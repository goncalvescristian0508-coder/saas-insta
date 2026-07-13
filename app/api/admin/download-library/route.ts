import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { cleanVideo } from "@/lib/videoClean";
import { scrapeProfileAndReels } from "@/lib/scraper";

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

// GET — status: quantos vídeos baixados vs total no cache
// ?username=jeninovaki
export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  if (!username) return NextResponse.json({ error: "username obrigatório" }, { status: 400 });

  const inLibrary = await prisma.libraryVideo.count({
    where: { storagePath: { contains: `/${username}/`, not: { contains: "/covers/" } } },
  });

  return NextResponse.json({ username, inLibrary });
}

// POST body: { sourceUsername, batch? }
// Raspa vídeos do Apify (cache 6h ou scrape fresco) e baixa para Supabase Storage.
// Rodar em loop até remaining=0.
export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { sourceUsername?: string; batch?: number };
  const sourceUsername = body.sourceUsername;
  if (!sourceUsername) return NextResponse.json({ error: "sourceUsername obrigatório" }, { status: 400 });

  const batchSize = Math.min(body.batch ?? 3, 5);

  // Busca userId do CloneJob mais recente desse username
  const job = await prisma.cloneJob.findFirst({
    where: { sourceUsername },
    orderBy: { createdAt: "desc" },
    select: { userId: true },
  });
  if (!job) return NextResponse.json({ error: `Nenhum CloneJob encontrado para '${sourceUsername}'` }, { status: 404 });
  const { userId } = job;

  // Raspa (usa cache de 6h ou busca fresco do Apify)
  let reels: { videoUrl: string; shortCode: string; caption: string }[] = [];
  try {
    const scraped = await scrapeProfileAndReels(sourceUsername, 9999);
    reels = scraped.reels.filter(r => r.videoUrl);
  } catch (err) {
    return NextResponse.json({ error: `Falha no scrape: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }

  if (reels.length === 0) return NextResponse.json({ error: "Nenhum vídeo encontrado no scrape." }, { status: 404 });

  // Descobre quais já estão na biblioteca (por storagePath)
  const existingPaths = await prisma.libraryVideo.findMany({
    where: { userId, storagePath: { contains: `/${sourceUsername}/` } },
    select: { storagePath: true },
  }).then(rows => new Set(rows.map(r => r.storagePath)));

  // Filtra os que ainda não foram baixados
  const pending = reels.filter(r => {
    const hash = createHash("md5").update(r.videoUrl).digest("hex");
    const path = `cloned/${userId}/${sourceUsername}/${hash}.mp4`;
    return !existingPaths.has(path);
  });

  if (pending.length === 0) {
    return NextResponse.json({ done: true, remaining: 0, inLibrary: existingPaths.size });
  }

  const batch = pending.slice(0, batchSize);
  const results: { ok: boolean; error?: string }[] = [];
  const admin = storageAdmin();

  for (const reel of batch) {
    const urlHash = createHash("md5").update(reel.videoUrl).digest("hex");
    const storagePath = `cloned/${userId}/${sourceUsername}/${urlHash}.mp4`;

    try {
      const res = await fetch(reel.videoUrl, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = Buffer.from(await res.arrayBuffer());
      const buffer = await cleanVideo(raw);

      const { error: upErr } = await admin.storage
        .from("library-videos")
        .upload(storagePath, buffer, { contentType: "video/mp4", upsert: false });
      if (upErr && !upErr.message.includes("already exists")) throw new Error(upErr.message);

      const { data: pub } = admin.storage.from("library-videos").getPublicUrl(storagePath);

      const alreadyInDb = await prisma.libraryVideo.findFirst({ where: { storagePath } });
      if (!alreadyInDb) {
        await prisma.libraryVideo.create({
          data: {
            userId,
            filename: `${urlHash}.mp4`,
            originalName: reel.caption?.slice(0, 60) || `Reel ${urlHash.slice(0, 8)}`,
            storagePath,
            publicUrl: pub.publicUrl,
            sizeBytes: buffer.length,
            mimeType: "video/mp4",
          },
        });
      }

      results.push({ ok: true });
    } catch (err) {
      results.push({ ok: false, error: err instanceof Error ? err.message.slice(0, 120) : String(err) });
    }
  }

  return NextResponse.json({
    processed: results.length,
    ok: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    remaining: pending.length - results.filter(r => r.ok).length,
    total: reels.length,
  });
}
