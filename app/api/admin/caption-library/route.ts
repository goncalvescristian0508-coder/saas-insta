import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { promises as fs } from "fs";
import * as nodePath from "path";
import { burnCaptionsOnVideo } from "@/lib/videoCaptions";

export const runtime = "nodejs";
export const maxDuration = 300;

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  return !!secret && auth === `Bearer ${secret}`;
}

// GET — status: quantos vídeos pendentes vs processados por clone
// ?setup=1 → cria a coluna captionedUrl no banco se não existir
export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // ?fontCheck=1 → verifica se a fonte está acessível no Lambda
  if (searchParams.get("fontCheck") === "1") {
    const cwd = process.cwd();
    const fontPath = nodePath.join(cwd, "public", "CaptionFont.ttf");
    const exists = await fs.access(fontPath).then(() => true).catch(() => false);
    let size: number | null = null;
    if (exists) { size = (await fs.stat(fontPath)).size; }
    return NextResponse.json({ cwd, fontPath, exists, size });
  }

  // ?resetOne=1&username=jeninovaki → reseta 1 vídeo captionado (não-none) para null
  if (searchParams.get("resetOne") === "1") {
    const username = searchParams.get("username") ?? "jeninovaki";
    const vid = await prisma.libraryVideo.findFirst({
      where: {
        AND: [
          { captionedUrl: { not: null } },
          { captionedUrl: { not: "none" } },
        ],
        storagePath: { contains: `/${username}/`, not: { contains: "/covers/" } },
      },
      select: { id: true, publicUrl: true, captionedUrl: true },
      orderBy: { createdAt: "asc" },
    });
    if (!vid) return NextResponse.json({ error: "Nenhum vídeo captionado encontrado." });
    await prisma.libraryVideo.update({ where: { id: vid.id }, data: { captionedUrl: null } });
    return NextResponse.json({ reset: true, id: vid.id, wasUrl: vid.captionedUrl });
  }

  // ?resetNone=1&username=jeninovaki → reseta 5 vídeos marcados "none" para null (reprocessar com nova lógica)
  if (searchParams.get("resetNone") === "1") {
    const username = searchParams.get("username") ?? "jeninovaki";
    const count = parseInt(searchParams.get("count") ?? "5");
    const vids = await prisma.libraryVideo.findMany({
      where: {
        captionedUrl: "none",
        storagePath: { contains: `/${username}/`, not: { contains: "/covers/" } },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: Math.min(count, 20),
    });
    if (vids.length === 0) return NextResponse.json({ error: "Nenhum vídeo 'none' encontrado." });
    await prisma.libraryVideo.updateMany({
      where: { id: { in: vids.map(v => v.id) } },
      data: { captionedUrl: null },
    });
    return NextResponse.json({ reset: true, count: vids.length, ids: vids.map(v => v.id) });
  }

  if (searchParams.get("setup") === "1") {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "LibraryVideo" ADD COLUMN IF NOT EXISTS "captionedUrl" TEXT;`
    );
    return NextResponse.json({ ok: true, message: "Coluna captionedUrl criada (ou já existia)." });
  }

  if (searchParams.get("sample") === "1") {
    const username = searchParams.get("username") ?? "jeninovaki";
    const count = Math.min(parseInt(searchParams.get("count") ?? "1"), 20);
    const skip = parseInt(searchParams.get("skip") ?? "0");
    const samples = await prisma.libraryVideo.findMany({
      where: {
        AND: [
          { captionedUrl: { not: null } },
          { captionedUrl: { not: "none" } },
          { storagePath: { contains: `/${username}/` } },
        ],
      },
      select: { id: true, publicUrl: true, captionedUrl: true },
      orderBy: { createdAt: "desc" },
      take: count,
      skip,
    });
    if (samples.length === 0) return NextResponse.json({ error: "Nenhum vídeo legendado ainda." });
    return NextResponse.json(count === 1 ? samples[0] : samples);
  }

  const cloneId = searchParams.get("cloneId");

  if (cloneId) {
    const job = await prisma.cloneJob.findUnique({
      where: { id: cloneId },
      select: { sourceUsername: true, userId: true },
    });
    if (!job) return NextResponse.json({ error: "Clone não encontrado" }, { status: 404 });

    const all = await prisma.libraryVideo.findMany({
      where: {
        storagePath: { contains: `/${job.sourceUsername}/`, not: { contains: "/covers/" } },
      },
      select: { id: true, captionedUrl: true, publicUrl: true },
    });

    return NextResponse.json({
      cloneId,
      sourceUsername: job.sourceUsername,
      total: all.length,
      captioned: all.filter(v => v.captionedUrl).length,
      pending: all.filter(v => !v.captionedUrl).length,
    });
  }

  // Resumo geral
  const [total, captioned] = await Promise.all([
    prisma.libraryVideo.count(),
    prisma.libraryVideo.count({ where: { captionedUrl: { not: null } } }),
  ]);

  return NextResponse.json({ total, captioned, pending: total - captioned, build: "ea71d0e" });
}

// POST — processa próximo batch de vídeos sem legenda
// Body: { cloneId?, sourceUsername?, batch?, forceId? }
// forceId: reprocessa um vídeo específico pelo id (ignora captionedUrl atual)
export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    cloneId?: string;
    sourceUsername?: string;
    batch?: number;
    forceId?: string;
  };

  // Reprocessar vídeo específico para teste
  if (body.forceId) {
    const vid = await prisma.libraryVideo.findUnique({
      where: { id: body.forceId },
      select: { id: true, publicUrl: true, storagePath: true },
    });
    if (!vid) return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });
    try {
      const captionedUrl = await burnCaptionsOnVideo(vid.publicUrl, vid.storagePath, vid.id);
      if (captionedUrl) {
        await prisma.libraryVideo.update({ where: { id: vid.id }, data: { captionedUrl } });
        return NextResponse.json({ processed: 1, ok: 1, skipped: 0, results: [{ id: vid.id, ok: true, captionedUrl }] });
      }
      // burnCaptionsOnVideo retorna null apenas se não houve throw (legado)
      await prisma.libraryVideo.update({ where: { id: vid.id }, data: { captionedUrl: "none" } });
      return NextResponse.json({ processed: 1, ok: 0, skipped: 1, results: [{ id: vid.id, ok: false, error: "null" }] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // SEM_FALA / SEM_AUDIO → marca "none" e retorna 200 com erro detalhado
      if (msg.startsWith("SEM_FALA:") || msg.startsWith("SEM_AUDIO:")) {
        await prisma.libraryVideo.update({ where: { id: vid.id }, data: { captionedUrl: "none" } }).catch(() => {});
        return NextResponse.json({ processed: 1, ok: 0, skipped: 1, results: [{ id: vid.id, ok: false, error: msg }] });
      }
      return NextResponse.json({ processed: 1, ok: 0, skipped: 1, results: [{ id: vid.id, ok: false, error: msg }] }, { status: 500 });
    }
  }

  const batchSize = Math.min(body.batch ?? 5, 10);

  let where: Prisma.LibraryVideoWhereInput = {
    captionedUrl: null,
    storagePath: { not: { contains: "/covers/" } },
  };

  if (body.sourceUsername) {
    where = {
      ...where,
      storagePath: { contains: `/${body.sourceUsername}/`, not: { contains: "/covers/" } },
    };
  } else if (body.cloneId) {
    const job = await prisma.cloneJob.findUnique({
      where: { id: body.cloneId },
      select: { sourceUsername: true },
    });
    if (!job) return NextResponse.json({ error: "Clone não encontrado" }, { status: 404 });
    where = {
      ...where,
      storagePath: { contains: `/${job.sourceUsername}/`, not: { contains: "/covers/" } },
    };
  }

  const pending = await prisma.libraryVideo.findMany({
    where,
    select: { id: true, publicUrl: true, storagePath: true },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  if (pending.length === 0) {
    return NextResponse.json({ message: "Nenhum vídeo pendente para legendar.", processed: 0 });
  }

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const vid of pending) {
    try {
      console.log("[caption-library] processando", vid.id, vid.storagePath);
      const captionedUrl = await burnCaptionsOnVideo(vid.publicUrl, vid.storagePath, vid.id);

      if (captionedUrl) {
        await prisma.libraryVideo.update({
          where: { id: vid.id },
          data: { captionedUrl },
        });
        results.push({ id: vid.id, ok: true });
        console.log("[caption-library] OK", vid.id, "→", captionedUrl);
      } else {
        // Sem fala detectada: marcar com string especial para não reprocessar
        await prisma.libraryVideo.update({
          where: { id: vid.id },
          data: { captionedUrl: "none" },
        });
        results.push({ id: vid.id, ok: false, error: "sem fala detectada" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[caption-library] erro", vid.id, msg);
      // Sem áudio / sem fala → marcar "none" para não reprocessar eternamente
      if (msg.startsWith("SEM_AUDIO:") || msg.startsWith("SEM_FALA:")) {
        await prisma.libraryVideo.update({ where: { id: vid.id }, data: { captionedUrl: "none" } }).catch(() => {});
      }
      results.push({ id: vid.id, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    processed: results.length,
    ok: results.filter(r => r.ok).length,
    skipped: results.filter(r => !r.ok).length,
    results,
  });
}
