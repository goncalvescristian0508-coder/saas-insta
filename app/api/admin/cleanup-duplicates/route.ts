import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  if (user.email !== adminEmail) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as { userId?: string; dryRun?: boolean };
  const dryRun = body.dryRun !== false; // default: dry run (preview only)

  // Find all (accountId, caption) combos that have a DONE post
  const donePosts = await prisma.scheduledPost.findMany({
    where: {
      ...(body.userId ? { userId: body.userId } : {}),
      status: "DONE",
      caption: { not: "" },
    },
    select: { accountId: true, caption: true },
    distinct: ["accountId", "caption"],
  });

  if (donePosts.length === 0) {
    return NextResponse.json({ deleted: 0, dryRun });
  }

  // For each DONE (accountId+caption), find PENDING duplicates
  // We batch OR conditions to avoid query size issues
  const BATCH = 500;
  let totalDeleted = 0;
  const preview: { accountId: string; caption: string; count: number }[] = [];

  for (let i = 0; i < donePosts.length; i += BATCH) {
    const batch = donePosts.slice(i, i + BATCH);

    const pendingDupes = await prisma.scheduledPost.groupBy({
      by: ["accountId", "caption"],
      where: {
        ...(body.userId ? { userId: body.userId } : {}),
        status: "PENDING",
        OR: batch.map((d) => ({ accountId: d.accountId, caption: d.caption })),
      },
      _count: { id: true },
    });

    for (const group of pendingDupes) {
      preview.push({ accountId: group.accountId, caption: (group.caption ?? "").slice(0, 60), count: group._count.id });
    }

    if (!dryRun && pendingDupes.length > 0) {
      const result = await prisma.scheduledPost.deleteMany({
        where: {
          ...(body.userId ? { userId: body.userId } : {}),
          status: "PENDING",
          OR: batch.map((d) => ({ accountId: d.accountId, caption: d.caption })),
        },
      });
      totalDeleted += result.count;
    }
  }

  const previewTotal = preview.reduce((s, r) => s + r.count, 0);

  return NextResponse.json({
    dryRun,
    deleted: dryRun ? 0 : totalDeleted,
    wouldDelete: dryRun ? previewTotal : totalDeleted,
    groups: preview.length,
    preview: preview.slice(0, 20),
  });
}
