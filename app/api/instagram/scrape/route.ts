import { NextResponse } from "next/server";
import { scrapeIgProfileAndReels } from "@/lib/instagramProxyScraper";
import { hikerScrapeProfileAndReels } from "@/lib/hikerApiScraper";
import { rapidScrapeProfileAndReels } from "@/lib/rapidApiScraper";
import {
  getApifyTokensFromEnv,
  isQuotaOrBillingError,
  loadExhaustedTokens,
  persistExhaustedToken,
} from "@/lib/apifyRotation";

export const runtime = "nodejs";
export const maxDuration = 300;

async function runApifyActor(token: string, actorId: string, input: object): Promise<unknown[]> {
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${token}&timeout=180&memory=256`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(200_000),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const err = await res.json() as { error?: { message?: string } }; msg = err.error?.message || msg; } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    const run = data as { status?: string };
    throw new Error(`Actor run did not succeed (status: ${run.status ?? "UNKNOWN"})`);
  }
  return data as unknown[];
}

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

    // ── 1st: instagram-private-api + DataImpulse proxy ──
    try {
      const { profile, reels } = await scrapeIgProfileAndReels(cleanUsername);
      const videos = reels.map((r, i) => ({
        id: i + 1, shortCode: r.shortCode, caption: r.caption || "(sem legenda)",
        videoUrl: r.videoUrl, thumbnailUrl: r.thumbnailUrl,
        likes: r.likes, comments: r.comments, views: r.views, timestamp: r.timestamp,
      }));
      return buildResponse(
        { username: profile.username, fullName: profile.fullName, profilePicUrl: profile.profilePicUrl, biography: profile.biography, followersCount: profile.followersCount },
        videos, videos.length,
      );
    } catch (e) {
      console.error("[scrape] private-api:", e instanceof Error ? e.message : e);
    }

    // ── 2nd: HikerAPI ──
    if (process.env.HIKERAPI_KEY) {
      try {
        const { profile, reels } = await hikerScrapeProfileAndReels(cleanUsername);
        const videos = reels.map((r, i) => ({
          id: i + 1, shortCode: r.shortCode, caption: r.caption || "(sem legenda)",
          videoUrl: r.videoUrl, thumbnailUrl: r.thumbnailUrl,
          likes: r.likes, comments: r.comments, views: r.views, timestamp: r.timestamp,
        }));
        return buildResponse(
          { username: profile.username, fullName: profile.fullName, profilePicUrl: profile.profilePicUrl, biography: profile.biography, followersCount: profile.followersCount },
          videos, videos.length,
        );
      } catch (e) {
        console.error("[scrape] hikerapi:", e instanceof Error ? e.message : e);
      }
    }

    // ── 3rd: RapidAPI Instagram120 ──
    if (process.env.RAPIDAPI_KEY) {
      try {
        const { profile, reels } = await rapidScrapeProfileAndReels(cleanUsername);
        const videos = reels.map((r, i) => ({
          id: i + 1, shortCode: r.shortCode, caption: r.caption || "(sem legenda)",
          videoUrl: r.videoUrl, thumbnailUrl: r.thumbnailUrl,
          likes: r.likes, comments: r.comments, views: r.views, timestamp: r.timestamp,
        }));
        return buildResponse(
          { username: profile.username, fullName: profile.fullName, profilePicUrl: profile.profilePicUrl, biography: profile.biography, followersCount: profile.followersCount },
          videos, videos.length,
        );
      } catch (e) {
        console.error("[scrape] rapidapi:", e instanceof Error ? e.message : e);
      }
    }

    // ── 4th: Apify (with token rotation) ──
    const allApifyTokens = getApifyTokensFromEnv();
    if (allApifyTokens.length === 0) {
      return NextResponse.json({ error: "Nenhum scraper disponível." }, { status: 500 });
    }

    const exhaustedTokens = await loadExhaustedTokens();
    const apifyTokens = allApifyTokens.filter((t) => !exhaustedTokens.has(t));

    if (apifyTokens.length === 0) {
      return NextResponse.json(
        { error: "Limite do serviço de busca atingido. Tente novamente amanhã ou adicione novos tokens." },
        { status: 503 },
      );
    }

    const diUser = process.env.DATAIMPULSE_USER ?? "";
    const diPass = process.env.DATAIMPULSE_PASS ?? "";
    const proxyConfig = diUser && diPass
      ? { proxyConfiguration: { proxyUrls: [`http://${diUser}:${diPass}@gw.dataimpulse.com:823`] } }
      : {};

    let lastError = "";
    for (const token of apifyTokens) {
      try {
        const [reelsResult, profileResult] = await Promise.allSettled([
          runApifyActor(token, "apify/instagram-reel-scraper", { username: [cleanUsername], resultsLimit: 9999, ...proxyConfig }),
          runApifyActor(token, "apify/instagram-profile-scraper", { usernames: [cleanUsername], ...proxyConfig }),
        ]);

        if (profileResult.status === "rejected") {
          const err = profileResult.reason;
          if (isQuotaOrBillingError(err)) {
            await persistExhaustedToken(token);
            console.warn("[scrape] apify token quota exhausted:", token.slice(0, 8));
          }
          lastError = err instanceof Error ? err.message : String(err);
          continue;
        }

        const profileItem = ((profileResult.value[0] ?? {}) as Record<string, unknown>);

        if (!profileItem.username) {
          const errMsg = String(profileItem.errorDescription ?? profileItem.error ?? "Perfil não encontrado (proxy bloqueado)");
          lastError = errMsg;
          continue;
        }

        const reelsRaw = reelsResult.status === "fulfilled" ? reelsResult.value as Record<string, unknown>[] : [];
        // Only include items that have an actual video URL
        const validReels = reelsRaw.filter((item) => item.videoUrl);

        let warning: string | undefined;
        if (validReels.length === 0) {
          const first = (reelsRaw[0] ?? {}) as Record<string, unknown>;
          const errDesc = String(first.errorDescription ?? first.error ?? "");
          const errMsgs = Array.isArray(first.requestErrorMessages) ? (first.requestErrorMessages as string[]).join("; ") : "";
          warning = errDesc || errMsgs || (reelsResult.status === "rejected" ? String((reelsResult as PromiseRejectedResult).reason) : "Sem reels encontrados");
        }

        const videos = validReels.map((post, i) => ({
          id: i + 1,
          shortCode: String(post.shortCode ?? ""),
          caption: String(post.caption ?? "(sem legenda)"),
          videoUrl: String(post.videoUrl ?? ""),
          thumbnailUrl: String(post.displayUrl ?? post.thumbnailUrl ?? ""),
          likes: Number(post.likesCount ?? post.likes ?? post.likeCount ?? 0),
          comments: Number(post.commentsCount ?? 0),
          views: Number(post.videoViewCount ?? post.viewCount ?? post.playCount ?? 0),
          timestamp: String(post.timestamp ?? ""),
        }));

        return buildResponse(
          {
            username: cleanUsername,
            fullName: String(profileItem.fullName ?? cleanUsername),
            profilePicUrl: String(profileItem.profilePicUrlHD ?? profileItem.profilePicUrl ?? ""),
            biography: String(profileItem.biography ?? profileItem.bio ?? ""),
            followersCount: Number(profileItem.followersCount ?? 0),
          },
          videos, reelsRaw.length, warning,
        );
      } catch (err) {
        if (isQuotaOrBillingError(err)) {
          await persistExhaustedToken(token);
          console.warn("[scrape] apify token quota exhausted:", token.slice(0, 8));
        }
        lastError = err instanceof Error ? err.message : String(err);
        continue;
      }
    }

    return NextResponse.json({ error: lastError || "Não foi possível buscar o perfil" }, { status: 503 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}
