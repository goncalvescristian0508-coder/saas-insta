import { NextResponse } from "next/server";
import { rapidScrapeProfileAndReels } from "@/lib/rapidApiScraper";

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

export async function POST(request: Request) {
  try {
    const { username } = await request.json() as { username?: string };
    if (!username) return NextResponse.json({ error: "Username é obrigatório" }, { status: 400 });

    const cleanUsername = username.replace("@", "").trim();

    if (!process.env.RAPIDAPI_KEY) {
      return NextResponse.json({ error: "RAPIDAPI_KEY não configurado no servidor" }, { status: 500 });
    }

    try {
      const { profile, reels } = await rapidScrapeProfileAndReels(cleanUsername, 120, 10);
      const videos = reels.map((r, i) => ({
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
      return buildResponse(
        {
          username: profile.username,
          fullName: profile.fullName,
          profilePicUrl: profile.profilePicUrl,
          biography: profile.biography,
          followersCount: profile.followersCount,
        },
        videos,
        videos.length,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[scrape] rapidapi error:", msg);
      return NextResponse.json({ error: msg }, { status: 503 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}
