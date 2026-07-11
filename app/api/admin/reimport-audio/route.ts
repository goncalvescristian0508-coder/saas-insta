import { NextResponse } from "next/server";
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

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  return !!secret && auth === `Bearer ${secret}`;
}

/**
 * POST /api/admin/reimport-audio
 * Body: { username: string, limit?: number (default 15, max 20) }
 *
 * Executa Instagram Reel Scraper de forma síncrona (run-sync) e reimporta
 * os vídeos com audio usando cleanVideo (tmp dir corrigido para /tmp).
 * Sobrescreve arquivos existentes no Supabase e reseta captionedUrl.
 *
 * Processa em batches de 15 para caber em 300s. Chame múltiplas vezes.
 */
export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { username?: string; limit?: number; offset?: number; datasetId?: string };
  const { username, datasetId } = body;
  const limit = Math.min(body.limit ?? 15, 20);
  const offset = body.offset ?? 0;

  if (!username) return NextResponse.json({ error: "username obrigatório" }, { status: 400 });

  const tokens = await getAllApifyTokens();
  if (tokens.length === 0) return NextResponse.json({ error: "Nenhum token Apify" }, { status: 400 });

  // Pegar userId do admin
  const acc = await prisma.instagramOAuthAccount.findFirst({ orderBy: { createdAt: "asc" } });
  const userId = acc?.userId;
  if (!userId) return NextResponse.json({ error: "userId não encontrado" }, { status: 400 });

  let items: Record<string, unknown>[] = [];
  let lastError = "";

  // Se datasetId fornecido: lê direto do dataset (ignora runId, evita problema de token)
  if (datasetId) {
    for (const token of tokens) {
      try {
        const url = `${APIFY}/datasets/${datasetId}/items?token=${token}&format=json&offset=${offset}&limit=${limit}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) { lastError = `dataset HTTP ${res.status}`; continue; }
        const data = await res.json() as Record<string, unknown>[];
        items = data;
        break;
      } catch (e) { lastError = String(e); continue; }
    }
    // Dataset público do Apify não precisa de token
    if (items.length === 0) {
      try {
        const url = `${APIFY}/datasets/${datasetId}/items?format=json&offset=${offset}&limit=${limit}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (res.ok) items = await res.json() as Record<string, unknown>[];
      } catch { /* ignora */ }
    }
    if (items.length === 0) {
      return NextResponse.json({ ok: false, error: `Dataset não acessível: ${lastError}` }, { status: 400 });
    }
  } else {
    // Sem datasetId: usa run-sync síncrono
    const actors = [
      { id: "apify~instagram-reel-scraper", input: { username: [username], resultsLimit: limit } },
      { id: "apify~instagram-reel-scraper", input: { usernames: [username], resultsLimit: limit } },
    ];

    outer: for (const token of tokens) {
      for (const { id, input } of actors) {
        try {
          const url = `${APIFY}/acts/${encodeURIComponent(id)}/run-sync-get-dataset-items?token=${token}&timeout=200&memory=1024&format=json`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
            signal: AbortSignal.timeout(220_000),
          });
          if (!res.ok) { lastError = `${id}: HTTP ${res.status}`; continue; }
          const data = await res.json() as Record<string, unknown>[];
          if (data.length > 0) { items = data; break outer; }
          lastError = `${id}: 0 itens`;
        } catch (e) {
          lastError = `${id}: ${e instanceof Error ? e.message.slice(0, 100) : e}`;
          continue;
        }
      }
    }

    if (items.length === 0) {
      return NextResponse.json({ ok: false, error: `Nenhum vídeo obtido: ${lastError}` }, { status: 502 });
    }
  }

  const admin = storage();
  const results = { updated: 0, skipped: 0, failed: 0, noUrl: 0 };

  for (const item of items) {
    // Instagram Reel Scraper fields
    const videoUrl = String(
      item.videoUrl ??
      item.video_url ??
      (item.video as Record<string, unknown>)?.url ??
      item.url ??
      ""
    );

    if (!videoUrl || !videoUrl.startsWith("http")) { results.noUrl++; continue; }

    // Hash sobre a URL para manter compatibilidade com storagePaths existentes
    const urlHash = createHash("md5").update(videoUrl).digest("hex");
    const storagePath = `cloned/${userId}/${username}/${urlHash}.mp4`;

    try {
      const vidRes = await fetch(videoUrl, {
        signal: AbortSignal.timeout(60_000),
        headers: {
          // Headers de browser para forçar CDN a retornar H.264+AAC em vez de VP9 DASH
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          "Accept": "video/mp4,video/*;q=0.9,*/*;q=0.8",
        },
      });
      if (!vidRes.ok) { results.failed++; continue; }

      const raw = Buffer.from(await vidRes.arrayBuffer());
      // cleanVideo agora usa /tmp (gravável no Lambda) — re-encoda VP9→H.264+AAC
      const buffer = await cleanVideo(raw).catch((e) => {
        console.warn("[reimport] cleanVideo falhou, usando raw:", e instanceof Error ? e.message.slice(0, 100) : e);
        return raw;
      });

      const { error: upErr } = await admin.storage
        .from("library-videos")
        .upload(storagePath, buffer, { contentType: "video/mp4", upsert: true });
      if (upErr) { results.failed++; continue; }

      const { data: pub } = admin.storage.from("library-videos").getPublicUrl(storagePath);

      const existing = await prisma.libraryVideo.findFirst({ where: { userId, storagePath } });
      if (existing) {
        await prisma.libraryVideo.update({
          where: { id: existing.id },
          data: { publicUrl: pub.publicUrl, sizeBytes: buffer.length, captionedUrl: null },
        });
      } else {
        const caption = String(item.caption ?? item.text ?? item.desc ?? "").slice(0, 80);
        await prisma.libraryVideo.create({
          data: {
            userId,
            filename: `${urlHash}.mp4`,
            originalName: caption || `Reel ${urlHash.slice(0, 8)}`,
            storagePath,
            publicUrl: pub.publicUrl,
            sizeBytes: buffer.length,
            mimeType: "video/mp4",
          },
        });
      }

      results.updated++;
      console.log(`[reimport] OK ${storagePath} ${buffer.length}B`);
    } catch (e) {
      console.error(`[reimport] fail ${storagePath}:`, e instanceof Error ? e.message.slice(0, 100) : e);
      results.failed++;
    }
  }

  return NextResponse.json({ ok: true, username, scraped: items.length, ...results });
}
