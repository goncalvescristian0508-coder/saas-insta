import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const warmups = await prisma.accountWarmup.findMany({
    where: { userId: user.id, isActive: true },
    include: { account: { select: { username: true, profilePictureUrl: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ warmups });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { accountId, targetPosts, intervalMinutes } = await request.json() as {
    accountId?: string;
    targetPosts?: number;
    intervalMinutes?: number;
  };

  if (!accountId) return NextResponse.json({ error: "accountId obrigatório" }, { status: 400 });

  const account = await prisma.instagramOAuthAccount.findFirst({
    where: { id: accountId, userId: user.id },
  });
  if (!account) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  const warmup = await prisma.accountWarmup.upsert({
    where: { accountId },
    create: {
      userId: user.id,
      accountId,
      targetPosts: targetPosts ?? 30,
      intervalMinutes: intervalMinutes ?? 120,
      completedPosts: 0,
      isActive: true,
    },
    update: {
      targetPosts: targetPosts ?? 30,
      intervalMinutes: intervalMinutes ?? 120,
      isActive: true,
      completedPosts: 0,
    },
  });

  return NextResponse.json({ warmup });
}
