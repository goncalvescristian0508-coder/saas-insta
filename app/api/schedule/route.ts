import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const schedules = await prisma.scheduledPost.findMany({
    where: { userId: user.id, cloneJobId: null },
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
  const {
    accountIds, videoId, videoIds, caption, scheduledAt,
    intervalSeconds = 30, batchSize, batchIntervalHours, distributeVideos = false,
  } = body as {
    accountIds: string[]; videoId?: string; videoIds?: string[]; caption: string;
    scheduledAt: string; intervalSeconds?: number; batchSize?: number;
    batchIntervalHours?: number; distributeVideos?: boolean;
  };

  const vIdsRaw: string[] = Array.isArray(videoIds) && videoIds.length > 0
    ? videoIds : videoId ? [videoId] : [];
  // Deduplicate — never schedule the same video twice to the same account
  const vIds = [...new Set(vIdsRaw)];

  if (!accountIds || vIds.length === 0 || !caption || !scheduledAt) {
    return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
  }

  const ids: string[] = Array.isArray(accountIds) ? accountIds : [accountIds];
  if (ids.length === 0) return NextResponse.json({ error: "Selecione ao menos uma conta" }, { status: 400 });

  const videos = await prisma.libraryVideo.findMany({ where: { id: { in: vIds }, userId: user.id } });
  const foundIds = new Set(videos.map((v) => v.id));
  const validVIds = vIds.filter((id) => foundIds.has(id));
  if (validVIds.length === 0) return NextResponse.json({ error: "Nenhum vídeo encontrado" }, { status: 404 });

  const accounts = await prisma.instagramOAuthAccount.findMany({
    where: { id: { in: ids }, userId: user.id },
  });
  if (accounts.length === 0) return NextResponse.json({ error: "Nenhuma conta válida encontrada" }, { status: 404 });

  const start = new Date(scheduledAt);
  const intervalMs = (intervalSeconds ?? 30) * 1000;

  function getScheduledAt(videoIdx: number, accountIdx: number, totalVidsForAccount: number): Date {
    const accountOffset = accountIdx * totalVidsForAccount * intervalMs;
    if (batchSize && batchIntervalHours) {
      const batchIntervalMs = batchIntervalHours * 3600 * 1000;
      const blockIdx = Math.floor(videoIdx / batchSize);
      const posInBlock = videoIdx % batchSize;
      return new Date(start.getTime() + accountOffset + blockIdx * batchIntervalMs + posInBlock * intervalMs);
    }
    return new Date(start.getTime() + accountOffset + videoIdx * intervalMs);
  }

  let pairs: { accountIdx: number; accountId: string; vId: string; videoIdx: number }[];

  if (distributeVideos) {
    // Each account gets a different slice of videos — no account shares the same video
    const perAccount = Math.ceil(validVIds.length / accounts.length);
    pairs = accounts.flatMap((account, accountIdx) => {
      const slice = validVIds.slice(accountIdx * perAccount, (accountIdx + 1) * perAccount);
      return slice.map((vId, videoIdx) => ({ accountIdx, accountId: account.id, vId, videoIdx }));
    });
  } else {
    // All accounts receive all videos, staggered in time
    pairs = accounts.flatMap((account, accountIdx) =>
      validVIds.map((vId, videoIdx) => ({ accountIdx, accountId: account.id, vId, videoIdx }))
    );
  }

  const schedules = await Promise.all(
    pairs.map(({ accountIdx, accountId, vId, videoIdx }) => {
      const totalVids = distributeVideos
        ? Math.ceil(validVIds.length / accounts.length)
        : validVIds.length;
      return prisma.scheduledPost.create({
        data: { userId: user.id, accountId, videoId: vId, caption, scheduledAt: getScheduledAt(videoIdx, accountIdx, totalVids) },
        include: {
          account: { select: { username: true } },
          video: { select: { originalName: true } },
        },
      });
    })
  );

  return NextResponse.json({ schedules });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { filter } = await request.json() as { filter?: string };
  const allowed = ["pending", "done", "failed", "all"];
  if (!filter || !allowed.includes(filter)) {
    return NextResponse.json({ error: "Filtro inválido" }, { status: 400 });
  }

  const statusMap: Record<string, ("PENDING" | "DONE" | "FAILED" | "RUNNING")[]> = {
    pending: ["PENDING"],
    done: ["DONE"],
    failed: ["FAILED"],
    all: ["PENDING", "DONE", "FAILED", "RUNNING"],
  };

  const { count } = await prisma.scheduledPost.deleteMany({
    where: { userId: user.id, status: { in: statusMap[filter] } },
  });

  return NextResponse.json({ deleted: count });
}
