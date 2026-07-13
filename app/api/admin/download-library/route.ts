import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { cleanVideo } from "@/lib/videoClean";

export const runtime = "nodejs";
export const maxDuration = 300;

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  return !!secret && auth === `Bearer ${secret}`;
}

function storageAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function resolveCloneJobId(body: { sourceUsername?: string; cloneJobId?: string }) {
  if (body.cloneJobId) return body.cloneJobId;
  if (body.sourceUsername) {
    const job = await prisma.cloneJob.findFirst({
      where: { sourceUsername: body.sourceUsername },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return job?.id ?? null;
  }
  return null;
}

// POST body: { sourceUsername?, cloneJobId?, batch? }
// Baixa vídeos do Apify CDN → Supabase Storage e cria LibraryVideo.
// Rodar em loop pelo VPS até remaining=0.
export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { sourceUsername?: string; cloneJobId?: string; batch?: number };
  const batchSize = Math.min(body.batch ?? 3, 5);
  const cloneJobId = await resolveCloneJobId(body);
  if (!cloneJobId) return NextResponse.json({ error: "sourceUsername ou cloneJobId obrigatório" }, { status: 400 });

  const jobInfo = await prisma.cloneJob.findUnique({
    where: { id: cloneJobId },
    select: { userId: true, sourceUsername: true },
  });
  if (!jobInfo) return NextResponse.json({ error: "Clone não encontrado" }, { status: 404 });

  const { userId, sourceUsername } = jobInfo;

  // Posts com Apify CDN URL (não-Supabase) ainda por baixar
  const posts = await prisma.scheduledPost.findMany({
    where: {
      cloneJobId,
      status: "PENDING",
      videoId: null,
      rawVideoUrl: { not: null },
    },
    select: { id: true, rawVideoUrl: true, caption: true },
    distinct: ["rawVideoUrl"],
    take: batchSize,
  });

  const apifyPosts = posts.filter(p => p.rawVideoUrl && !p.rawVideoUrl.includes("supabase.co/storage"));

  if (apifyPosts.length === 0) {
    const remaining = await prisma.scheduledPost.count({
      where: { cloneJobId, status: "PENDING", videoId: null, rawVideoUrl: { not: null } },
    });
    return NextResponse.json({ done: true, remaining, message: "Nenhum vídeo Apify pendente." });
  }

  const results: { ok: boolean; error?: string }[] = [];

  for (const post of apifyPosts) {
    const videoUrl = post.rawVideoUrl!;
    try {
      const urlHash = createHash("md5").update(videoUrl).digest("hex");
      const storagePath = `cloned/${userId}/${sourceUsername}/${urlHash}.mp4`;

      let existing = await prisma.libraryVideo.findFirst({ where: { userId, storagePath } });

      if (!existing) {
        const res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = Buffer.from(await res.arrayBuffer());
        const buffer = await cleanVideo(raw);

        const admin = storageAdmin();
        const { error: upErr } = await admin.storage
          .from("library-videos")
          .upload(storagePath, buffer, { contentType: "video/mp4", upsert: false });
        if (upErr && !upErr.message.includes("already exists")) throw new Error(upErr.message);

        const { data: pub } = admin.storage.from("library-videos").getPublicUrl(storagePath);
        existing = await prisma.libraryVideo.create({
          data: {
            userId,
            filename: `${urlHash}.mp4`,
            originalName: post.caption?.slice(0, 60) || `Reel ${urlHash.slice(0, 8)}`,
            storagePath,
            publicUrl: pub.publicUrl,
            sizeBytes: buffer.length,
            mimeType: "video/mp4",
          },
        });
      }

      // Atualiza todos os posts com esse rawVideoUrl para usar videoId
      await prisma.scheduledPost.updateMany({
        where: { cloneJobId, rawVideoUrl: videoUrl },
        data: { videoId: existing.id, rawVideoUrl: null },
      });

      results.push({ ok: true });
    } catch (err) {
      results.push({ ok: false, error: err instanceof Error ? err.message.slice(0, 120) : String(err) });
    }
  }

  const remaining = await prisma.scheduledPost.count({
    where: { cloneJobId, status: "PENDING", videoId: null, rawVideoUrl: { not: null } },
  });

  return NextResponse.json({
    processed: results.length,
    ok: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    remaining,
  });
}

// GET — quantos ainda precisam ser baixados
export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const cloneJobId = await resolveCloneJobId({ sourceUsername: searchParams.get("username") ?? undefined });
  if (!cloneJobId) return NextResponse.json({ error: "username obrigatório" }, { status: 400 });

  const [total, withVideoId] = await Promise.all([
    prisma.scheduledPost.count({ where: { cloneJobId, status: "PENDING" } }),
    prisma.scheduledPost.count({ where: { cloneJobId, status: "PENDING", videoId: { not: null } } }),
  ]);

  return NextResponse.json({ total, withVideoId, needsDownload: total - withVideoId });
}
