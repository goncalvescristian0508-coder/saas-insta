import { NextResponse } from "next/server";
import { apifyPollScrapeRuns } from "@/lib/apifyRotation";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profileRunId = searchParams.get("profileRunId");
    const reelRunId = searchParams.get("reelRunId");
    const username = (searchParams.get("username") ?? "").replace("@", "").trim();

    if (!profileRunId || !reelRunId || !username) {
      return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
    }

    const result = await apifyPollScrapeRuns(profileRunId, reelRunId, username, 120);

    if (!result.done) {
      return NextResponse.json({ pending: true, runStatus: result.runStatus });
    }

    const videos = result.reels.map((r, i) => ({
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

    return NextResponse.json({
      success: true,
      profile: result.profile,
      videos,
      totalVideos: videos.length,
      totalPosts: videos.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao verificar status" },
      { status: 503 },
    );
  }
}
