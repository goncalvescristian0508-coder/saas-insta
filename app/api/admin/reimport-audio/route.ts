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

export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, route: "reimport-audio", build: "e23883e" });
}

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { username?: string; limit?: number; offset?: number; datasetId?: string; diagnose?: boolean };
  const { username, datasetId, diagnose } = body;
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
      // instagram-scraper: retorna H.264+AAC (não segmento DASH VP9 sem áudio)
      { id: "apify~instagram-scraper", input: { directUrls: [`https://www.instagram.com/${username}/`], resultsType: "posts", resultsLimit: limit } },
      { id: "apify~instagram-scraper", input: { usernames: [username], resultsType: "posts", resultsLimit: limit } },
      // fallback: reel-scraper (retorna VP9 DASH sem áudio — pode não funcionar)
      { id: "apify~instagram-reel-scraper", input: { username: [username], resultsLimit: limit } },
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

  // modo diagnose: retorna campos brutos do scraper sem baixar nada
  if (diagnose) {
    return NextResponse.json({
      ok: true,
      diagnose: true,
      scraped: items.length,
      firstItem: items[0] ? Object.fromEntries(
        Object.entries(items[0]).map(([k, v]) => [
          k,
          typeof v === "string" && v.length > 300 ? v.slice(0, 300) + "…" : v,
        ])
      ) : null,
      keys: items[0] ? Object.keys(items[0]) : [],
    });
  }

  const admin = storage();
  const results = { updated: 0, skipped: 0, failed: 0, noUrl: 0 };

  for (const item of items) {
    const videoVersions = item.video_versions as Array<Record<string, unknown>> | undefined;
    const dashUrl = String(item.videoUrl ?? item.video_url ?? "");
    const postUrl = String(item.url ?? item.postUrl ?? "");
    const shortCode = postUrl.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1] ?? null;

    // Tenta extrair URL H.264 via página embed do Instagram (não requer autenticação)
    let h264Url: string | null = null;
    if (shortCode) {
      try {
        // /embed/captioned/ é público e contém "video_url" em JSON embutido no HTML
        const embedRes = await fetch(`https://www.instagram.com/p/${shortCode}/embed/captioned/`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
          },
          signal: AbortSignal.timeout(15_000),
        });
        if (embedRes.ok) {
          const html = await embedRes.text();
          // 1) "video_url":"https://..." dentro de JSON embutido
          const m1 = html.match(/"video_url"\s*:\s*"(https:\/\/[^"]+\.mp4[^"]*)"/);
          if (m1) h264Url = m1[1].replace(/\\u0026/g, "&");
          // 2) <video src="https://...mp4
          if (!h264Url) {
            const m2 = html.match(/<video[^>]+src="(https:\/\/[^"]+\.mp4[^"]*)"/);
            if (m2) h264Url = m2[1].replace(/\\u0026/g, "&").replace(/&amp;/g, "&");
          }
          // 3) "contentUrl":"https://..." (JSON-LD)
          if (!h264Url) {
            const m3 = html.match(/"contentUrl"\s*:\s*"(https:\/\/[^"]+)"/);
            if (m3) h264Url = m3[1].replace(/\\u0026/g, "&");
          }
          console.log(`[reimport] embed ${shortCode} ok=${embedRes.ok} found=${!!h264Url} html=${html.length}B`);
        } else {
          console.log(`[reimport] embed ${shortCode} status=${embedRes.status}`);
        }
      } catch (e) {
        console.warn(`[reimport] embed fetch ${shortCode} falhou:`, e instanceof Error ? e.message.slice(0, 80) : e);
      }
    }

    // Fallback: video_versions do scraper, ou dashUrl (VP9 CMAF — sem áudio)
    const videoUrl = h264Url
      ?? String(videoVersions?.[0]?.src ?? videoVersions?.[0]?.url ?? dashUrl);

    if (!videoUrl || !videoUrl.startsWith("http")) { results.noUrl++; continue; }

    // Hash sobre a dashUrl para manter storagePath compatível com registros existentes
    const hashBase = dashUrl || videoUrl;
    const urlHash = createHash("md5").update(hashBase).digest("hex");
    const storagePath = `cloned/${userId}/${username}/${urlHash}.mp4`;

    console.log(`[reimport] ${shortCode ?? "?"} h264=${!!h264Url} url=${videoUrl.slice(0, 80)}`);

    try {
      const vidRes = await fetch(videoUrl, {
        signal: AbortSignal.timeout(60_000),
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          "Accept": "video/mp4,video/*;q=0.9,*/*;q=0.8",
          "Referer": postUrl || "https://www.instagram.com/",
        },
      });
      if (!vidRes.ok) {
        console.warn(`[reimport] video fetch ${videoUrl.slice(0, 80)} → ${vidRes.status}`);
        results.failed++; continue;
      }

      const raw = Buffer.from(await vidRes.arrayBuffer());
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
