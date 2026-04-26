import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

function getTokens(): string[] {
  const raw = process.env.APIFY_TOKENS ?? process.env.APIFY_TOKEN ?? "";
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

async function runActor(token: string, actorId: string, input: object): Promise<unknown[]> {
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${token}&timeout=240&memory=256`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(250_000),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json() as { error?: { message?: string } };
      msg = err.error?.message || msg;
    } catch {}
    throw new Error(msg);
  }

  return res.json() as Promise<unknown[]>;
}

export async function POST(request: Request) {
  try {
    const { username } = await request.json() as { username?: string };
    if (!username) return NextResponse.json({ error: "Username é obrigatório" }, { status: 400 });

    const tokens = getTokens();
    if (tokens.length === 0) {
      return NextResponse.json(
        { error: "Token Apify não configurado. Acesse apify.com, crie uma conta gratuita e adicione APIFY_TOKEN no Vercel." },
        { status: 500 }
      );
    }

    const cleanUsername = username.replace("@", "").trim();
    let lastError = "";

    for (const token of tokens) {
      try {
        const [reelsItems, profileItems] = await Promise.all([
          runActor(token, "apify/instagram-reel-scraper", {
            username: [cleanUsername],
            resultsLimit: 9999,
          }),
          runActor(token, "apify/instagram-profile-scraper", {
            usernames: [cleanUsername],
          }),
        ]);

        const profileItem = (profileItems[0] ?? {}) as Record<string, unknown>;
        if (reelsItems[0]) {
          const sample = reelsItems[0] as Record<string, unknown>;
          console.log("[scrape] sample reel keys:", Object.keys(sample).join(","));
          console.log("[scrape] likesCount:", sample.likesCount, "likes:", sample.likes, "likeCount:", sample.likeCount);
        }
        const videos = (reelsItems as Record<string, unknown>[]).map((post, index) => ({
          id: index + 1,
          shortCode: String(post.shortCode ?? ""),
          caption: String(post.caption ?? "(sem legenda)"),
          videoUrl: String(post.videoUrl ?? ""),
          thumbnailUrl: String(post.displayUrl ?? post.thumbnailUrl ?? ""),
          likes: Number(post.likesCount ?? post.likes ?? post.likeCount ?? post.diggCount ?? 0),
          comments: Number(post.commentsCount ?? 0),
          views: Number(post.videoViewCount ?? post.viewCount ?? post.playCount ?? 0),
          timestamp: String(post.timestamp ?? ""),
        }));

        return NextResponse.json({
          success: true,
          profile: {
            username: cleanUsername,
            fullName: String(profileItem.fullName ?? (reelsItems[0] as Record<string, unknown>)?.ownerFullName ?? cleanUsername),
            profilePicUrl: String(profileItem.profilePicUrlHD ?? profileItem.profilePicUrl ?? ""),
            biography: String(profileItem.biography ?? profileItem.bio ?? ""),
            followersCount: Number(profileItem.followersCount ?? 0),
          },
          videos,
          totalVideos: videos.length,
          totalPosts: reelsItems.length,
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        const msg = lastError.toLowerCase();
        if (
          msg.includes("401") || msg.includes("unauthorized") ||
          msg.includes("billing") || msg.includes("quota") || msg.includes("credit") ||
          msg.includes("monthly") || msg.includes("limit") || msg.includes("402")
        ) {
          continue;
        }
        throw err;
      }
    }

    return NextResponse.json({ error: `Todos os tokens falharam: ${lastError}` }, { status: 503 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
