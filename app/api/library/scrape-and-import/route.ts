import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { getAllApifyTokens } from "@/lib/apifyRotation";
import { createHash } from "crypto";
import { cleanVideo } from "@/lib/videoClean";

export const runtime = "nodejs";
export const maxDuration = 300;

const APIFY = "https://api.apify.com/v2";

function storage() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function waitRun(token: string, runId: string): Promise<string> {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`${APIFY}/actor-runs/${runId}?token=${token}`, { signal: AbortSignal.timeout(10_000) });
    const j = await res.json() as { data?: { status?: string; defaultDatasetId?: string } };
    const status = j.data?.status;
    if (status === "SUCCEEDED") return j.data?.defaultDatasetId ?? "";
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT")
      throw new Error(`Apify run: ${status}`);
  }
  throw new Error("Apify: timeout aguardando run");
}

/**
 * POST /api/library/scrape-and-import?secret=CRON_SECRET
 * Body: { username: string }
 *
 * 1. Triggers a fresh Apify reel-scraper run for the given username
 * 2. Waits for it to complete (up to 10 min)
 * 3. Downloads and saves every reel to Supabase library-videos
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  let userId: string;
  if (secret && secret === process.env.CRON_SECRET) {
    const acc = await prisma.instagramOAuthAccount.findFirst({ orderBy: { createdAt: "asc" } }).catch(() => null);
    userId = acc?.userId ?? "";
    if (!userId) return NextResponse.json({ error: "userId não encontrado" }, { status: 400 });
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    userId = user.id;
  }

  const { username } = (await request.json().catch(() => ({}))) as { username?: string };
  if (!username) return NextResponse.json({ error: "username obrigatório" }, { status: 400 });

  const tokens = await getAllApifyTokens();
  if (tokens.length === 0) return NextResponse.json({ error: "Nenhum token Apify configurado" }, { status: 400 });
  const token = tokens[0];

  // Start fresh Apify run
  console.log(`[scrape-import] starting Apify run for @${username}`);
  const startRes = await fetch(`${APIFY}/acts/apify~instagram-reel-scraper/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: [username], resultsLimit: 500 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!startRes.ok) {
    const err = await startRes.json().catch(() => ({})) as { error?: { message?: string } };
    return NextResponse.json({ error: `Apify start: ${err.error?.message ?? startRes.status}` }, { status: 400 });
  }
  const startData = await startRes.json() as { data?: { id?: string } };
  const runId = startData.data?.id;
  if (!runId) return NextResponse.json({ error: "Run ID não retornado pelo Apify" }, { status: 400 });

  console.log(`[scrape-import] runId=${runId}, waiting for completion...`);

  // Wait for run to finish
  let datasetId: string;
  try {
    datasetId = await waitRun(token, runId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro aguardando run" }, { status: 500 });
  }

  // Fetch dataset
  const itemsRes = await fetch(
    `${APIFY}/datasets/${datasetId}/items?token=${token}&format=json&limit=500`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!itemsRes.ok) return NextResponse.json({ error: `Dataset: HTTP ${itemsRes.status}` }, { status: 400 });
  const items = (await itemsRes.json()) as Record<string, unknown>[];

  console.log(`[scrape-import] ${items.length} reels found, importing...`);

  const results = { imported: 0, skipped: 0, failed: 0 };
  const admin = storage();

  for (const item of items) {
    const videoUrl =
      (item.videoUrl as string) || (item.url as string) || "";
    if (!videoUrl) { results.failed++; continue; }

    const caption = (item.caption as string) || (item.description as string) || "";
    const thumbnailUrl = (item.thumbnailUrl as string) || (item.displayUrl as string) || null;

    const urlHash = createHash("md5").update(videoUrl).digest("hex");
    const storagePath = `cloned/${userId}/${username}/${urlHash}.mp4`;
    const shortCaption = caption.slice(0, 80) || `Reel ${urlHash.slice(0, 8)}`;

    const existing = await prisma.libraryVideo.findFirst({ where: { userId, storagePath } }).catch(() => null);
    if (existing) { results.skipped++; continue; }

    try {
      const vidRes = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
      if (!vidRes.ok) { results.failed++; continue; }
      const raw = Buffer.from(await vidRes.arrayBuffer());
      const buffer = await cleanVideo(raw).catch(() => raw);

      const { error: upErr } = await admin.storage
        .from("library-videos")
        .upload(storagePath, buffer, { contentType: "video/mp4", upsert: false });
      if (upErr) { results.failed++; continue; }

      const { data: pub } = admin.storage.from("library-videos").getPublicUrl(storagePath);

      let coverUrl: string | null = null;
      if (thumbnailUrl) {
        try {
          const tRes = await fetch(thumbnailUrl, { signal: AbortSignal.timeout(15_000) });
          if (tRes.ok) {
            const tBuf = Buffer.from(await tRes.arrayBuffer());
            const coverPath = `cloned/${userId}/${username}/covers/${urlHash}.jpg`;
            const { error: cErr } = await admin.storage
              .from("library-videos")
              .upload(coverPath, tBuf, { contentType: "image/jpeg", upsert: true });
            if (!cErr) {
              const { data: cPub } = admin.storage.from("library-videos").getPublicUrl(coverPath);
              coverUrl = cPub.publicUrl;
            }
          }
        } catch { /* non-critical */ }
      }

      await prisma.libraryVideo.create({
        data: {
          userId,
          filename: `${urlHash}.mp4`,
          originalName: shortCaption,
          storagePath,
          publicUrl: pub.publicUrl,
          sizeBytes: buffer.length,
          mimeType: "video/mp4",
          coverUrl,
        },
      });

      results.imported++;
    } catch {
      results.failed++;
    }
  }

  console.log(`[scrape-import] done: ${JSON.stringify(results)}`);

  return NextResponse.json({
    ok: true,
    username,
    runId,
    total: items.length,
    ...results,
  });
}
