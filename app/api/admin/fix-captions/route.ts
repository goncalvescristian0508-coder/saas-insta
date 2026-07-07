import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { type CaptionTheme, shufflePool } from "@/lib/autoCaptions";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAdmin(email: string | undefined) {
  return email === (process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { cloneJobId, theme = "mundo" } = await request.json() as { cloneJobId?: string; theme?: CaptionTheme };

  if (!cloneJobId) {
    return NextResponse.json({ error: "cloneJobId é obrigatório" }, { status: 400 });
  }

  // Get all PENDING posts for this clone job
  const pending = await prisma.scheduledPost.findMany({
    where: { cloneJobId, status: "PENDING", userId: user.id },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
  });

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, message: "Nenhum post PENDING encontrado" });
  }

  const pool = shufflePool(theme, Math.abs(cloneJobId.split("").reduce((s, c) => s + c.charCodeAt(0), 0)));

  // Group IDs by caption pool index
  const groups = new Map<number, string[]>();
  pending.forEach(({ id }, i) => {
    const poolIdx = i % pool.length;
    if (!groups.has(poolIdx)) groups.set(poolIdx, []);
    groups.get(poolIdx)!.push(id);
  });

  const results = await Promise.allSettled([...groups.entries()].map(([poolIdx, ids]) =>
    prisma.scheduledPost.updateMany({
      where: { id: { in: ids }, status: "PENDING" },
      data: { caption: pool[poolIdx] },
    })
  ));

  const updated = results.reduce((sum, r) => sum + (r.status === "fulfilled" ? r.value.count : 0), 0);

  return NextResponse.json({ ok: true, updated, total: pending.length, theme });
}
