import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const { username } = await request.json() as { username?: string };
    if (!username?.trim()) return NextResponse.json({ error: "Username obrigatório" }, { status: 400 });

    const cleanUsername = username.replace(/https?:\/\/(www\.)?tiktok\.com\/@?/, "").replace(/^@/, "").split("?")[0].split("/")[0].trim();

    const userRecords = await prisma.userApifyToken.findMany({ where: { userId: user.id, isActive: true }, select: { token: true } });
    const tokens = [
      ...userRecords.map((r) => r.token),
      ...(process.env.APIFY_TOKENS ?? process.env.APIFY_TOKEN ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    ];
    if (tokens.length === 0) return NextResponse.json({ error: "Nenhum token Apify configurado." }, { status: 400 });

    const token = tokens[0];

    const actorAttempts = [
      {
        actor: "clockworks/tiktok-scraper",
        inputs: [
          { profiles: [cleanUsername], resultsPerPage: 30 },
          { profiles: [`@${cleanUsername}`], resultsPerPage: 30 },
          { startUrls: [{ url: `https://www.tiktok.com/@${cleanUsername}` }], resultsPerPage: 30 },
        ],
      },
      {
        actor: "clockworks/free-tiktok-scraper",
        inputs: [
          { profiles: [cleanUsername], resultsPerPage: 30 },
          { profiles: [`@${cleanUsername}`], resultsPerPage: 30 },
          { startUrls: [{ url: `https://www.tiktok.com/@${cleanUsername}` }], resultsPerPage: 30 },
        ],
      },
    ];

    let items: Record<string, unknown>[] = [];
    let apifyError = "";

    outer: for (const { actor, inputs } of actorAttempts) {
      for (const input of inputs) {
        try {
          const res = await fetch(
            `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${token}&timeout=55&memory=1024`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(58_000) }
          );
          if (!res.ok) {
            if (!apifyError) {
              try { const b = await res.json() as { error?: { message?: string } }; apifyError = b?.error?.message ?? `HTTP ${res.status}`; } catch { apifyError = `HTTP ${res.status}`; }
            }
            continue;
          }
          const data = await res.json() as Record<string, unknown>[];
          if (data.length > 0) { items = data; break outer; }
        } catch { continue; }
      }
    }

    if (items.length === 0) {
      const msg = apifyError
        ? `Apify: ${apifyError}`
        : "Perfil não encontrado ou privado. Verifique o username.";
      return NextResponse.json({ error: msg }, { status: 404 });
    }

    // Extract profile from first item's authorMeta
    const first = items[0];
    const authorMeta = (first.authorMeta ?? first.author ?? {}) as Record<string, unknown>;
    const profile = {
      username: String(authorMeta.name ?? authorMeta.uniqueId ?? cleanUsername),
      displayName: String(authorMeta.nickName ?? authorMeta.nickname ?? authorMeta.name ?? cleanUsername),
      avatar: String(authorMeta.avatar ?? authorMeta.avatarLarger ?? first.authorAvatar ?? ""),
      biography: String(authorMeta.signature ?? authorMeta.bio ?? ""),
      followers: Number(authorMeta.fans ?? authorMeta.followerCount ?? 0),
      following: Number(authorMeta.following ?? authorMeta.followingCount ?? 0),
      videoCount: Number(authorMeta.video ?? authorMeta.videoCount ?? items.length),
      heartCount: Number(authorMeta.heart ?? authorMeta.heartCount ?? 0),
    };

    const videos = items.map((item) => {
      const videoObj = item.video as Record<string, unknown> | undefined;
      return {
        videoUrl: String(item.videoUrl ?? item.video_url ?? videoObj?.downloadAddr ?? videoObj?.playAddr ?? ""),
        caption: String(item.text ?? item.desc ?? ""),
        likes: Number(item.diggCount ?? item.likeCount ?? 0),
        views: Number(item.playCount ?? item.viewCount ?? 0),
        comments: Number(item.commentCount ?? 0),
        timestamp: item.createTime ? new Date(Number(item.createTime) * 1000).toISOString() : null,
      };
    }).filter((v) => v.videoUrl.startsWith("http"));

    const avgLikes = videos.length ? Math.round(videos.reduce((s, v) => s + v.likes, 0) / videos.length) : 0;
    const avgViews = videos.length ? Math.round(videos.reduce((s, v) => s + v.views, 0) / videos.length) : 0;
    const avgComments = videos.length ? videos.reduce((s, v) => s + v.comments, 0) / videos.length : 0;
    const engagementRate = profile.followers > 0 ? Math.round(((avgLikes + avgComments) / profile.followers) * 1000) / 10 : 0;

    // Hourly heatmap
    const hourBuckets = Array.from({ length: 24 }, () => ({ total: 0, count: 0 }));
    videos.filter((v) => v.timestamp).forEach((v) => {
      const h = new Date(v.timestamp!).getUTCHours();
      hourBuckets[h].total += v.likes + v.comments;
      hourBuckets[h].count++;
    });
    const hourlyData = hourBuckets.map((b) => (b.count > 0 ? Math.round(b.total / b.count) : 0));

    return NextResponse.json({ profile, videos, avgLikes, avgViews, engagementRate, hourlyData, totalVideos: profile.videoCount || videos.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao buscar perfil" }, { status: 500 });
  }
}
