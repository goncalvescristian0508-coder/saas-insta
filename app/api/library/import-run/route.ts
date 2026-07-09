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

/**
 * POST /api/library/import-run?secret=CRON_SECRET
 * Body: { runId: string, userId?: string }
 *
 * Fetches the output of an Apify actor run and saves each video
 * permanently to the Supabase library-videos bucket + LibraryVideo table.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  // Read body once
  const body = await request.json().catch(() => ({})) as { runId?: string; userId?: string; username?: string; offset?: number; limit?: number };
  const { runId, username } = body;
  const offset = body.offset ?? 0;
  const limit = body.limit ?? 80;

  if (!runId) return NextResponse.json({ error: "runId obrigatório" }, { status: 400 });

  let userId: string;

  if (secret && secret === process.env.CRON_SECRET) {
    if (body.userId) {
      userId = body.userId;
    } else {
        // Sempre usa o userId do primeiro InstagramOAuthAccount (único admin)
      const acc = await prisma.instagramOAuthAccount.findFirst({ orderBy: { createdAt: "asc" } }).catch(() => null);
      userId = acc?.userId ?? "";
      if (!userId) return NextResponse.json({ error: "userId não encontrado no banco" }, { status: 400 });
    }
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    userId = user.id;
  }

  // Get any available Apify token
  const tokens = await getAllApifyTokens();
  if (tokens.length === 0) return NextResponse.json({ error: "Nenhum token Apify configurado" }, { status: 400 });
  const token = tokens[0];

  // Fetch run info to find the dataset ID
  const runRes = await fetch(`${APIFY}/actor-runs/${runId}?token=${token}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!runRes.ok) return NextResponse.json({ error: `Run não encontrado: HTTP ${runRes.status}` }, { status: 400 });
  const runData = (await runRes.json()) as { data?: { defaultDatasetId?: string } };
  const datasetId = runData.data?.defaultDatasetId;
  if (!datasetId) return NextResponse.json({ error: "Run sem dataset" }, { status: 400 });

  // Fetch dataset items com paginação
  const itemsRes = await fetch(
    `${APIFY}/datasets/${datasetId}/items?token=${token}&format=json&offset=${offset}&limit=${limit}`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!itemsRes.ok) return NextResponse.json({ error: `Falha ao buscar dataset: HTTP ${itemsRes.status}` }, { status: 400 });
  const items = (await itemsRes.json()) as Record<string, unknown>[];

  const results = { imported: 0, skipped: 0, failed: 0 };
  const admin = storage();

  for (const item of items) {
    const videoUrl =
      (item.videoUrl as string) ||
      (item.url as string) ||
      ((item.media as Record<string, unknown>)?.url as string) ||
      "";

    if (!videoUrl) { results.failed++; continue; }

    const caption =
      (item.caption as string) ||
      (item.description as string) ||
      (item.text as string) ||
      "";

    const thumbnailUrl =
      (item.thumbnailUrl as string) ||
      (item.displayUrl as string) ||
      null;

    const urlHash = createHash("md5").update(videoUrl).digest("hex");
    const folder = username ? `cloned/${userId}/${username}` : `cloned/${userId}/imported`;
    const storagePath = `${folder}/${urlHash}.mp4`;
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
            const coverPath = `${folder}/covers/${urlHash}.jpg`;
            const { error: cErr } = await admin.storage
              .from("library-videos")
              .upload(coverPath, tBuf, { contentType: "image/jpeg", upsert: true });
            if (!cErr) {
              const { data: cPub } = admin.storage.from("library-videos").getPublicUrl(coverPath);
              coverUrl = cPub.publicUrl;
            }
          }
        } catch { /* thumbnail non-critical */ }
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

  return NextResponse.json({ ok: true, runId, username: username ?? "imported", offset, limit, total: items.length, ...results });
}
