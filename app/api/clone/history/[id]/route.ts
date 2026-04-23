import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const job = await prisma.cloneJob.findFirst({ where: { id, userId: user.id } });
  if (!job) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  // Delete pending/failed posts then the job itself
  await prisma.scheduledPost.deleteMany({
    where: { cloneJobId: id, status: { in: ["PENDING", "FAILED"] } },
  });
  await prisma.cloneJob.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const job = await prisma.cloneJob.findFirst({
    where: { id, userId: user.id },
    include: {
      posts: {
        include: { account: { select: { username: true } } },
        orderBy: { scheduledAt: "asc" },
      },
    },
  });

  if (!job) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  return NextResponse.json({
    job: {
      id: job.id,
      sourceUsername: job.sourceUsername,
      profilePicUrl: job.profilePicUrl,
      accountUsernames: job.accountUsernames,
      totalReels: job.totalReels,
      createdAt: job.createdAt,
      posts: job.posts.map((p) => ({
        id: p.id,
        accountUsername: p.account.username,
        caption: p.caption,
        scheduledAt: p.scheduledAt,
        status: p.status,
        errorMsg: p.errorMsg,
        postedAt: p.postedAt,
      })),
    },
  });
}
