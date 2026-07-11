import { NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { getAllApifyTokens } from "@/lib/apifyRotation";
import { createHash } from "crypto";

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

function pickVideoUrl(item: Record<string, unknown>): { dashUrl: string; audioUrl: string } {
  const videoObj = item.video as Record<string, unknown> | undefined;
  const videoVersions = item.video_versions as Array<Record<string, unknown>> | undefined;

  // dashUrl: usado como chave de hash (para manter mesmo storagePath)
  const dashUrl = String(item.videoUrl ?? item.url ?? "");

  // Tenta vários campos que o Instagram Reel Scraper pode retornar com áudio
  const audioUrl = String(
    // Instagram Reel Scraper campos
    item.videoUrl ??               // pode já ser H.264 com áudio
    item.video_url ??
    videoObj?.url ??
    videoVersions?.[0]?.url ??    // primeiro item de video_versions
    // TikTok campos (fallback)
    videoObj?.downloadAddr ??
    videoObj?.playAddr ??
    item.downloadAddr ??
    item.playAddr ??
    dashUrl
  );
  return { dashUrl, audioUrl };
}

/**
 * POST /api/admin/reimport-audio
 * Body: { username: string, runId?: string, offset?: number, limit?: number }
 *
 * Se runId não fornecido: inicia novo run Apify TikTok scraper e retorna runId.
 * Se runId fornecido: baixa do dataset com offset/limit e reimporta com áudio.
 *
 * Usa `item.video.downloadAddr` (vídeo+áudio) em vez de `item.videoUrl` (VP9 sem áudio).
 * Sobrescreve os arquivos existentes no Supabase com upsert.
 */
// GET ?inspect=1&runId=X — mostra os campos do primeiro item do dataset (para debug)
export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");
  if (!runId) return NextResponse.json({ error: "runId obrigatório" }, { status: 400 });

  const tokens = await getAllApifyTokens();
  const token = tokens[0];
  if (!token) return NextResponse.json({ error: "Sem token Apify" }, { status: 400 });

  const runRes = await fetch(`${APIFY}/actor-runs/${runId}?token=${token}`, { signal: AbortSignal.timeout(10_000) });
  const runData = await runRes.json() as { data?: { status?: string; defaultDatasetId?: string } };
  const datasetId = runData.data?.defaultDatasetId;
  const status = runData.data?.status;

  if (!datasetId) return NextResponse.json({ runId, status, error: "Sem dataset" });

  const itemsRes = await fetch(
    `${APIFY}/datasets/${datasetId}/items?token=${token}&format=json&limit=2`,
    { signal: AbortSignal.timeout(15_000) }
  );
  const items = await itemsRes.json() as Record<string, unknown>[];
  if (!items.length) return NextResponse.json({ runId, status, error: "Dataset vazio" });

  // Retorna campos do primeiro item (sem baixar o vídeo) para inspeção
  const firstItem = items[0];
  const urlFields: Record<string, unknown> = {};
  for (const key of Object.keys(firstItem)) {
    const val = firstItem[key];
    if (typeof val === "string" && (val.startsWith("http") || key.toLowerCase().includes("url") || key.toLowerCase().includes("video"))) {
      urlFields[key] = val;
    } else if (typeof val === "object" && val !== null) {
      urlFields[key] = val;
    }
  }
  return NextResponse.json({ runId, status, datasetId, totalItems: items.length, urlFields });
}

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    username?: string;
    runId?: string;
    offset?: number;
    limit?: number;
  };

  const { username, runId: inputRunId } = body;
  const offset = body.offset ?? 0;
  const limit = Math.min(body.limit ?? 20, 30);

  if (!username) return NextResponse.json({ error: "username obrigatório" }, { status: 400 });

  const tokens = await getAllApifyTokens();
  if (tokens.length === 0) return NextResponse.json({ error: "Nenhum token Apify" }, { status: 400 });
  const token = tokens[0];

  // Passo 1: iniciar run se não tiver runId
  if (!inputRunId) {
    const actorAttempts = [
      // Instagram Reel Scraper (conta Instagram)
      { actor: "apify~instagram-reel-scraper", input: { username: [username], resultsLimit: 600 } },
      { actor: "apify/instagram-reel-scraper",  input: { username: [username], resultsLimit: 600 } },
      { actor: "apify~instagram-reel-scraper", input: { usernames: [username], resultsLimit: 600 } },
    ];

    for (const { actor, input } of actorAttempts) {
      try {
        const startRes = await fetch(
          `${APIFY}/acts/${encodeURIComponent(actor)}/runs?token=${token}&memory=1024`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
            signal: AbortSignal.timeout(30_000),
          }
        );
        if (!startRes.ok) continue;
        const startData = await startRes.json() as { data?: { id?: string } };
        const runId = startData.data?.id;
        if (runId) {
          return NextResponse.json({
            ok: true,
            step: "started",
            runId,
            message: `Run iniciado para @${username}. Aguarde 5-10 min e chame novamente com runId.`,
          });
        }
      } catch { continue; }
    }
    return NextResponse.json({ error: "Não foi possível iniciar run Apify" }, { status: 500 });
  }

  // Passo 2: verificar status do run
  const runRes = await fetch(`${APIFY}/actor-runs/${inputRunId}?token=${token}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!runRes.ok) return NextResponse.json({ error: `Run não encontrado: ${runRes.status}` }, { status: 400 });
  const runData = await runRes.json() as { data?: { status?: string; defaultDatasetId?: string } };
  const runStatus = runData.data?.status;
  const datasetId = runData.data?.defaultDatasetId;

  if (runStatus !== "SUCCEEDED") {
    return NextResponse.json({
      ok: false,
      runId: inputRunId,
      status: runStatus,
      message: `Run ainda não concluído (status: ${runStatus}). Aguarde e tente novamente.`,
    });
  }

  if (!datasetId) return NextResponse.json({ error: "Dataset ID não encontrado" }, { status: 400 });

  // Passo 3: buscar dataset com paginação
  const itemsRes = await fetch(
    `${APIFY}/datasets/${datasetId}/items?token=${token}&format=json&offset=${offset}&limit=${limit}`,
    { signal: AbortSignal.timeout(30_000) }
  );
  if (!itemsRes.ok) return NextResponse.json({ error: `Dataset erro: ${itemsRes.status}` }, { status: 400 });
  const items = await itemsRes.json() as Record<string, unknown>[];

  if (items.length === 0) {
    return NextResponse.json({ ok: true, done: true, message: "Todos os vídeos processados." });
  }

  const admin = storage();

  // Pegar userId do primeiro InstagramOAuthAccount (admin)
  const acc = await prisma.instagramOAuthAccount.findFirst({ orderBy: { createdAt: "asc" } });
  const userId = acc?.userId;
  if (!userId) return NextResponse.json({ error: "userId não encontrado" }, { status: 400 });

  const results = { updated: 0, skipped: 0, failed: 0, noAudioUrl: 0 };

  for (const item of items) {
    const { dashUrl, audioUrl } = pickVideoUrl(item);
    if (!dashUrl) { results.failed++; continue; }

    // Se não tem URL com áudio diferente do dashUrl, pula
    if (audioUrl === dashUrl) { results.noAudioUrl++; continue; }

    // storagePath usa hash da dashUrl para manter compatibilidade com registros existentes
    const urlHash = createHash("md5").update(dashUrl).digest("hex");
    const storagePath = `cloned/${userId}/${username}/${urlHash}.mp4`;

    try {
      // Baixa do URL com áudio
      const vidRes = await fetch(audioUrl, { signal: AbortSignal.timeout(60_000) });
      if (!vidRes.ok) { results.failed++; continue; }
      const buffer = Buffer.from(await vidRes.arrayBuffer());

      // Sobrescreve no Supabase
      const { error: upErr } = await admin.storage
        .from("library-videos")
        .upload(storagePath, buffer, { contentType: "video/mp4", upsert: true });
      if (upErr) { results.failed++; continue; }

      const { data: pub } = admin.storage.from("library-videos").getPublicUrl(storagePath);

      // Atualiza ou cria LibraryVideo + reseta captionedUrl para reprocessar
      const existing = await prisma.libraryVideo.findFirst({ where: { userId, storagePath } });
      if (existing) {
        await prisma.libraryVideo.update({
          where: { id: existing.id },
          data: {
            publicUrl: pub.publicUrl,
            sizeBytes: buffer.length,
            captionedUrl: null, // força reprocessamento de legenda
          },
        });
      } else {
        const caption = String(item.text ?? item.desc ?? item.caption ?? "").slice(0, 80);
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
      console.log(`[reimport-audio] updated ${storagePath} (${buffer.length} bytes)`);
    } catch (e) {
      console.error(`[reimport-audio] failed ${storagePath}:`, e instanceof Error ? e.message : e);
      results.failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    runId: inputRunId,
    offset,
    limit,
    processed: items.length,
    nextOffset: offset + items.length,
    ...results,
  });
}
