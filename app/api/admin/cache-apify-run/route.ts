import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getApifyTokensFromEnv } from "@/lib/apifyRotation";
import { saveScraperCache, type ScraperProfile, type ScraperReel } from "@/lib/scraper";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAdmin(email: string | undefined) {
  return email === (process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { runId, username } = await request.json() as { runId?: string; username?: string };
  if (!runId || !username) {
    return NextResponse.json({ error: "runId e username são obrigatórios" }, { status: 400 });
  }

  const token = getApifyTokensFromEnv()[0];
  if (!token) return NextResponse.json({ error: "APIFY_TOKENS não configurado" }, { status: 503 });

  const BASE = "https://api.apify.com/v2";

  // Pega o defaultDatasetId do run
  const runRes = await fetch(`${BASE}/actor-runs/${runId}?token=${token}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const runJson = await runRes.json() as { data?: { defaultDatasetId?: string; status?: string } };
  if (!runRes.ok || !runJson.data?.defaultDatasetId) {
    return NextResponse.json({ error: "Run não encontrado ou sem dataset" }, { status: 404 });
  }

  const datasetId = runJson.data.defaultDatasetId;

  // Busca os itens do dataset
  const dataRes = await fetch(
    `${BASE}/datasets/${datasetId}/items?token=${token}&format=json`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!dataRes.ok) return NextResponse.json({ error: `Dataset HTTP ${dataRes.status}` }, { status: 502 });

  const items = await dataRes.json() as Record<string, unknown>[];

  const reels: ScraperReel[] = items
    .filter((i) => !!(i.videoUrl ?? i.video_url))
    .map((i) => {
      const images = Array.isArray(i.images) ? (i.images as string[]) : [];
      return {
        shortCode: String(i.shortCode ?? i.code ?? i.shortcode ?? ""),
        caption: String(i.caption ?? ""),
        videoUrl: String(i.videoUrl ?? i.video_url ?? ""),
        thumbnailUrl: images[0] ?? String(i.thumbnailUrl ?? i.displayUrl ?? i.thumbnail_url ?? ""),
        likes: Number(i.likesCount ?? i.like_count ?? 0),
        comments: Number(i.commentsCount ?? i.comment_count ?? 0),
        views: Number(i.viewsCount ?? i.videoViewCount ?? i.view_count ?? i.video_view_count ?? 0),
        timestamp: String(i.timestamp ?? ""),
      };
    });

  const cleanUsername = username.replace("@", "").trim();

  // Cria um perfil mínimo (sem run de perfil, só com username)
  const profile: ScraperProfile = {
    id: cleanUsername,
    username: cleanUsername,
    fullName: "",
    biography: "",
    profilePicUrl: "",
    followersCount: 0,
  };

  await saveScraperCache(cleanUsername, profile, reels);

  return NextResponse.json({
    ok: true,
    username: cleanUsername,
    reelsSalvos: reels.length,
    datasetId,
    message: `${reels.length} reels salvos no cache por 6h`,
  });
}
