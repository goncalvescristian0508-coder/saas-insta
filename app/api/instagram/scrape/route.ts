import { NextResponse } from "next/server";
import { getCached, saveScraperCache } from "@/lib/scraper";
import { apifyStartScrapeRuns, getApifyTokensFromEnv } from "@/lib/apifyRotation";

export const runtime = "nodejs";
export const maxDuration = 60;

function formatVideos(reels: { shortCode: string; caption: string; videoUrl: string; thumbnailUrl: string; likes: number; comments: number; views: number; timestamp: string }[]) {
  return reels.map((r, i) => ({
    id: i + 1,
    shortCode: r.shortCode,
    caption: r.caption || "(sem legenda)",
    videoUrl: r.videoUrl,
    thumbnailUrl: r.thumbnailUrl,
    likes: r.likes,
    comments: r.comments,
    views: r.views,
    timestamp: r.timestamp,
  }));
}

export async function POST(request: Request) {
  try {
    const { username } = await request.json() as { username?: string };
    if (!username) return NextResponse.json({ error: "Username é obrigatório" }, { status: 400 });

    const cleanUsername = username.replace("@", "").trim();

    // 1. Cache hit → retorna instantaneamente sem chamar Apify
    const cached = await getCached(cleanUsername);
    if (cached) {
      const videos = formatVideos(cached.reels as Parameters<typeof formatVideos>[0]);
      return NextResponse.json({
        success: true,
        profile: {
          username: cached.profile.username,
          fullName: cached.profile.fullName,
          profilePicUrl: cached.profile.profilePicUrl,
          biography: cached.profile.biography ?? "",
          followersCount: cached.profile.followersCount,
        },
        videos,
        totalVideos: videos.length,
        totalPosts: videos.length,
        fromCache: true,
      });
    }

    // 2. Cache miss → inicia runs no Apify e retorna IDs para polling assíncrono
    const tokens = getApifyTokensFromEnv();
    if (tokens.length === 0) {
      return NextResponse.json({ error: "Apify: APIFY_TOKENS não configurado" }, { status: 503 });
    }

    try {
      const { profileRunId, reelRunId } = await apifyStartScrapeRuns(cleanUsername, 9999);
      return NextResponse.json({ pending: true, profileRunId, reelRunId, username: cleanUsername });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Apify: ${msg}` }, { status: 503 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}
