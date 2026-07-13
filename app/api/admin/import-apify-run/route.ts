import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveScraperCache } from "@/lib/scraper";

export const runtime = "nodejs";
export const maxDuration = 60;

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  return !!secret && auth === `Bearer ${secret}`;
}

// POST body: { runId, token, username? }
// Busca todos os itens do run Apify e salva no cache do scraper.
// Depois o clone endpoint usa esse cache sem chamar o Apify novamente.
export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { runId: string; token: string; username?: string };
  const { runId, token } = body;
  if (!runId || !token) return NextResponse.json({ error: "runId e token obrigatórios" }, { status: 400 });

  // Busca todos os itens do dataset em páginas de 200
  const items: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 200;
  while (true) {
    const url = `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${token}&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return NextResponse.json({ error: `Apify API ${res.status}` }, { status: 500 });
    const batch = await res.json() as Record<string, unknown>[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  if (items.length === 0) return NextResponse.json({ error: "Nenhum item no dataset" }, { status: 404 });

  // Detecta username do primeiro item se não fornecido
  const username = body.username ?? String(items[0].ownerUsername ?? "");
  if (!username) return NextResponse.json({ error: "Não foi possível detectar username" }, { status: 400 });

  // Busca info do perfil via Apify run input (ou cria placeholder)
  let profilePicUrl = "";
  try {
    const runRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`, { signal: AbortSignal.timeout(10_000) });
    if (runRes.ok) {
      const runData = await runRes.json() as { data?: { meta?: { userAgent?: string } } };
      void runData; // apenas para tipar
    }
  } catch { /* ignore */ }

  // Mapeia para o formato ScraperReel
  const reels = items
    .filter(r => r.type === "Video" && r.videoUrl)
    .map(r => ({
      shortCode: String(r.shortCode ?? ""),
      caption: String(r.caption ?? ""),
      videoUrl: String(r.videoUrl ?? ""),
      thumbnailUrl: String(r.displayUrl ?? (Array.isArray(r.images) ? r.images[0] : "") ?? ""),
      likes: Number(r.likesCount ?? 0),
      comments: Number(r.commentsCount ?? 0),
      views: Number(r.videoViewCount ?? r.videoPlayCount ?? 0),
      timestamp: String(r.timestamp ?? new Date().toISOString()),
    }));

  const profile = {
    id: String(items[0].ownerId ?? username),
    username,
    fullName: String(items[0].ownerFullName ?? username),
    biography: "",
    profilePicUrl,
    followersCount: 0,
  };

  // Salva no cache com TTL de 24h (sobrescreve o padrão de 6h pelo cachedAt no futuro)
  await saveScraperCache(username, profile, reels);

  // Salva também o token Apify no env simulado para o scraper usar depois se necessário
  await prisma.appSetting.upsert({
    where: { key: "apify_run_import_last" },
    create: { key: "apify_run_import_last", value: JSON.stringify({ runId, username, reels: reels.length, importedAt: Date.now() }) },
    update: { value: JSON.stringify({ runId, username, reels: reels.length, importedAt: Date.now() }) },
  }).catch(() => {});

  return NextResponse.json({ ok: true, username, totalItems: items.length, videosImported: reels.length });
}
