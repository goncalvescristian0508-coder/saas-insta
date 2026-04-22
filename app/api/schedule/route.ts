import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const schedules = await prisma.scheduledPost.findMany({
    where: { userId: user.id },
    include: {
      account: { select: { username: true, profilePictureUrl: true } },
      video: { select: { originalName: true, publicUrl: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json({ schedules });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json();
  const { accountIds, videoId, caption, scheduledAt } = body;

  if (!accountIds || !videoId || !caption || !scheduledAt) {
    return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
  }

  const ids: string[] = Array.isArray(accountIds) ? accountIds : [accountIds];
  if (ids.length === 0) return NextResponse.json({ error: "Selecione ao menos uma conta" }, { status: 400 });

  const video = await prisma.libraryVideo.findFirst({ where: { id: videoId, userId: user.id } });
  if (!video) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });

  const accounts = await prisma.instagramOAuthAccount.findMany({
    where: { id: { in: ids }, userId: user.id },
  });
  if (accounts.length === 0) return NextResponse.json({ error: "Nenhuma conta válida encontrada" }, { status: 404 });

  const schedules = await Promise.all(
    accounts.map((account) =>
      prisma.scheduledPost.create({
        data: { userId: user.id, accountId: account.id, videoId, caption, scheduledAt: new Date(scheduledAt) },
        include: {
          account: { select: { username: true } },
          video: { select: { originalName: true } },
        },
      })
    )
  );

  return NextResponse.json({ schedules });
}
