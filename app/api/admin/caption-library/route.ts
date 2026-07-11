import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { burnCaptionsOnVideo } from "@/lib/videoCaptions";

export const runtime = "nodejs";
export const maxDuration = 300;

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  return !!secret && auth === `Bearer ${secret}`;
}

// GET — status: quantos vídeos pendentes vs processados por clone
export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
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

  return NextResponse.json({ total, captioned, pending: total - captioned });
}

// POST — processa próximo batch de vídeos sem legenda
// Body: { cloneId: string, batch?: number }
export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { cloneId?: string; batch?: number };
  const batchSize = Math.min(body.batch ?? 5, 10);

  let where: Parameters<typeof prisma.libraryVideo.findMany>[0]["where"] = {
    captionedUrl: null,
    storagePath: { not: { contains: "/covers/" } },
  };

  if (body.cloneId) {
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
