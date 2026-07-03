import { NextResponse } from "next/server";
import { scrapeProfileAndReels } from "@/lib/scraper";
import { apifyStartScrapeRuns } from "@/lib/apifyRotation";
import { rapidScrapeProfileAndReels } from "@/lib/rapidApiScraper";
import { hikerScrapeProfileAndReels } from "@/lib/hikerApiScraper";

export const runtime = "nodejs";
export const maxDuration = 60;

function buildResponse(
  profile: { username: string; fullName: string; profilePicUrl: string; biography: string; followersCount: number },
  videos: object[],
  totalPosts: number,
  warning?: string,
) {
  return NextResponse.json({
    success: true,
    profile,
    videos,
    totalVideos: videos.length,
    totalPosts,
    ...(warning ? { warning } : {}),
  });
}

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

    // 1. Tenta RapidAPI (rápido e síncrono)
    if (process.env.RAPIDAPI_KEY) {
      try {
        const result = await rapidScrapeProfileAndReels(cleanUsername, 120, 10);
        if (result.reels.length > 0) {
          return buildResponse(
            { username: result.profile.username, fullName: result.profile.fullName, profilePicUrl: result.profile.profilePicUrl, biography: result.profile.biography ?? "", followersCount: result.profile.followersCount },
            formatVideos(result.reels),
            result.reels.length,
          );
        }
      } catch {
        // cai para Apify
      }
    }

    // 2. Apify: inicia os runs e retorna imediatamente com os IDs para polling
    const apifyTokens = (process.env.APIFY_TOKENS ?? process.env.APIFY_TOKEN ?? "")
      .split(",").map((t) => t.trim()).filter(Boolean);
    if (apifyTokens.length > 0) {
      try {
        const { profileRunId, reelRunId } = await apifyStartScrapeRuns(cleanUsername, 120);
        return NextResponse.json({
          pending: true,
          profileRunId,
          reelRunId,
          username: cleanUsername,
        });
      } catch (err) {
        console.error("[scrape] Apify start error:", err);
        // cai para HikerAPI
      }
    }

    // 3. HikerAPI (síncrono, fallback final)
    if (process.env.HIKERAPI_KEY) {
      try {
        const result = await hikerScrapeProfileAndReels(cleanUsername, 120);
        const videos = formatVideos(result.reels as Parameters<typeof formatVideos>[0]);
        return buildResponse(
          { username: result.profile.username, fullName: result.profile.fullName, profilePicUrl: result.profile.profilePicUrl, biography: result.profile.biography ?? "", followersCount: result.profile.followersCount },
          videos,
          videos.length,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: `Todos os scrapers falharam: ${msg}` }, { status: 503 });
      }
    }

    return NextResponse.json({ error: "Nenhum scraper configurado" }, { status: 503 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}
