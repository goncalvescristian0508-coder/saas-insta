import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { getAllApifyTokens, loadExhaustedTokens, persistExhaustedToken, isQuotaOrBillingError, clearExhaustedApifyTokens } from "@/lib/apifyRotation";

export const runtime = "nodejs";
export const maxDuration = 60;

const GRAPH = "https://graph.instagram.com/v21.0";
const APIFY_BASE = "https://api.apify.com/v2";

// ── Types ────────────────────────────────────────────────────────────────────

interface MediaItem {
  id: string;
  like_count?: number;
  comments_count?: number;
  video_views?: number;
  play_count?: number;
  timestamp?: string;
  media_type?: string;
  media_product_type?: string;
}

export interface AccountInsight {
  id: string;
  username: string;
  profilePicUrl: string | null;
  followers: number;
  mediaCount: number;
  avgLikes: number;
  avgComments: number;
  avgViews: number;
  totalLikes: number;
  totalComments: number;
  totalViews: number;
  engagementRate: number;
  postsAnalyzed: number;
  lastPostAt: string | null;
  status: "ok" | "error";
  error?: string;
}

interface CachePayload {
  accounts: AccountInsight[];
  lastUpdated: string;
}

// ── Cache ────────────────────────────────────────────────────────────────────

function cacheKey(userId: string) { return `engagement_v1_${userId}`; }

async function loadCache(userId: string): Promise<CachePayload | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: cacheKey(userId) } });
    return row ? JSON.parse(row.value) as CachePayload : null;
  } catch { return null; }
}

async function saveCache(userId: string, payload: CachePayload): Promise<void> {
  try {
    await prisma.appSetting.upsert({
      where: { key: cacheKey(userId) },
      create: { key: cacheKey(userId), value: JSON.stringify(payload) },
      update: { value: JSON.stringify(payload) },
    });
  } catch { /* best effort */ }
}

// ── Instagram Graph API ───────────────────────────────────────────────────────

async function fetchGraphEngagement(accessToken: string, igUserId: string) {
  const [profileRes, mediaRes] = await Promise.all([
    fetch(`${GRAPH}/${igUserId}?fields=followers_count,media_count&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(12_000) }),
    fetch(`${GRAPH}/${igUserId}/media?fields=id,like_count,comments_count,play_count,video_views,timestamp,media_type,media_product_type&limit=50&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(12_000) }),
  ]);

  if (!profileRes.ok) {
    const err = await profileRes.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `HTTP ${profileRes.status}`);
  }

  const profile = await profileRes.json() as { followers_count?: number; media_count?: number };
  const followers = profile.followers_count ?? 0;
  const mediaCount = profile.media_count ?? 0;

  let posts: MediaItem[] = [];
  if (mediaRes.ok) {
    const d = await mediaRes.json() as { data?: MediaItem[] };
    posts = (d.data ?? []).filter(p => p.media_type !== "STORY");
  }

  if (posts.length === 0) {
    return { followers, mediaCount, totalLikes: 0, totalComments: 0, graphViews: 0, postsAnalyzed: 0, reelsAnalyzed: 0, lastPostAt: null };
  }

  const reels = posts.filter(p => p.media_type === "VIDEO" || p.media_product_type === "REELS");
  const totalLikes = posts.reduce((s, p) => s + (p.like_count ?? 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.comments_count ?? 0), 0);
  const graphViews = reels.reduce((s, p) => s + (p.play_count ?? p.video_views ?? 0), 0);
  const lastPostAt = posts[0]?.timestamp ?? null;

  return { followers, mediaCount, totalLikes, totalComments, graphViews, postsAnalyzed: posts.length, reelsAnalyzed: reels.length, lastPostAt };
}

// ── Apify helpers ─────────────────────────────────────────────────────────────

async function apifyGetDataset(token: string, datasetId: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&format=json`, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return [];
  return res.json() as Promise<Record<string, unknown>[]>;
}

function viewsFromItem(i: Record<string, unknown>): number {
  return Number(
    i.videoPlayCount ?? i.viewsCount ?? i.videoViewCount ??
    i.view_count ?? i.video_view_count ?? i.ig_play_count ?? i.play_count ?? 0
  );
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

/**
 * Starts all runs in parallel, retrying immediately with the next token on 401.
 * Then polls until all complete or maxWaitMs elapses.
 * Returns partial results — accounts whose runs didn't finish within the window get 0 views.
 */
async function fetchViewsApify(
  accounts: Array<{ accountId: string; username: string }>,
  maxWaitMs = 32_000,
): Promise<Map<string, number>> {
  const allTokens = await getAllApifyTokens();
  if (allTokens.length === 0) return new Map();
  const exhausted = await loadExhaustedTokens();
  const tokens = allTokens.filter(t => !exhausted.has(t));
  if (tokens.length === 0) return new Map();

  console.log(`[engagement/apify] starting ${accounts.length} runs (${tokens.length} tokens)`);

  // Tracks tokens that returned 401 during this request — shared across parallel tasks
  const invalidTokens = new Set<string>();
  const viewsMap = new Map<string, number>();

  // ── Phase 1: start all runs, retry on 401 ────────────────────────────────
  const runEntries: Array<{ accountId: string; username: string; runId: string; token: string }> = [];

  await Promise.allSettled(
    accounts.map(async ({ accountId, username }, idx) => {
      for (let attempt = 0; attempt < tokens.length; attempt++) {
        const token = tokens[(idx + attempt) % tokens.length];
        if (invalidTokens.has(token)) continue;

        let res: Response;
        try {
          res = await fetch(
            `${APIFY_BASE}/acts/apify~instagram-reel-scraper/runs?token=${token}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: [username], resultsLimit: 12 }),
              signal: AbortSignal.timeout(8_000),
            }
          );
        } catch { continue; }

        if (res.status === 401) { invalidTokens.add(token); continue; }

        if (!res.ok) {
          const j = await res.json().catch(() => ({})) as { error?: { message?: string } };
          const msg = j.error?.message ?? `HTTP ${res.status}`;
          if (isQuotaOrBillingError({ message: msg })) await persistExhaustedToken(token);
          console.warn(`[engagement/apify] @${username}: ${msg}`);
          return;
        }

        const j = await res.json() as { data?: { id?: string } };
        const runId = j.data?.id;
        if (runId) {
          runEntries.push({ accountId, username, runId, token });
        }
        return;
      }
      console.warn(`[engagement/apify] @${username}: no valid token available`);
    })
  );

  if (runEntries.length === 0) {
    console.warn("[engagement/apify] no runs started");
    return new Map();
  }
  console.log(`[engagement/apify] ${runEntries.length}/${accounts.length} runs started, polling up to ${maxWaitMs}ms`);

  // ── Phase 2: poll until all done or timeout ───────────────────────────────
  const deadline = Date.now() + maxWaitMs;
  const pending = new Map(runEntries.map(e => [e.runId, e]));

  while (pending.size > 0 && Date.now() < deadline) {
    await sleep(4_000);
    await Promise.allSettled(
      [...pending.entries()].map(async ([runId, { accountId, username, token }]) => {
        const r = await fetch(
          `${APIFY_BASE}/actor-runs/${runId}?token=${token}`,
          { signal: AbortSignal.timeout(5_000) }
        ).catch(() => null);
        if (!r?.ok) return;

        const sj = await r.json() as { data?: { status?: string; defaultDatasetId?: string } };
        const status = sj.data?.status;

        if (status === "SUCCEEDED") {
          const datasetId = sj.data?.defaultDatasetId;
          if (datasetId) {
            const items = await apifyGetDataset(token, datasetId);
            const total = items.reduce((s, i) => s + viewsFromItem(i), 0);
            viewsMap.set(accountId, total);
            console.log(`[engagement/apify] @${username}: ${total} views (${items.length} reels)`);
          }
          pending.delete(runId);
        } else if (status && ["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
          console.warn(`[engagement/apify] @${username}: run ${status}`);
          pending.delete(runId);
        }
      })
    );
  }

  if (pending.size > 0) {
    console.warn(`[engagement/apify] ${pending.size} runs still pending after timeout (partial results)`);
  }
  console.log(`[engagement/apify] done: ${viewsMap.size}/${accounts.length} accounts got views`);
  return viewsMap;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "true";

  if (!refresh) {
    const cached = await loadCache(user.id);
    if (cached) return NextResponse.json(cached);
    return NextResponse.json({ accounts: [], lastUpdated: null });
  }

  // Reset exhausted tokens so fresh tokens from APIFY_TOKENS are always tried
  await clearExhaustedApifyTokens().catch(() => {});

  // ── Step 1: Graph API for all accounts in parallel ────────────────────────
  const dbAccounts = await prisma.instagramOAuthAccount.findMany({
    where: { userId: user.id, accountStatus: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true, username: true, profilePictureUrl: true, instagramUserId: true, accessTokenEnc: true, tokenExpiresAt: true },
  });

  const now = new Date();

  const graphResults = await Promise.all(
    dbAccounts.map(async (account) => {
      if (account.tokenExpiresAt && account.tokenExpiresAt < now) {
        return { account, status: "error" as const, error: "Token expirado — reconecte a conta", data: null };
      }
      try {
        const token = decryptAccountPassword(account.accessTokenEnc);
        const data = await fetchGraphEngagement(token, account.instagramUserId);
        return { account, status: "ok" as const, error: undefined, data };
      } catch (err) {
        return { account, status: "error" as const, error: err instanceof Error ? err.message : "Erro desconhecido", data: null };
      }
    })
  );

  // ── Step 2: Apify for accounts with graphViews === 0 ─────────────────────
  // Run for ALL accounts with 0 graph views (regardless of reelsAnalyzed count,
  // since Graph API may not classify all video posts correctly).
  const needsApify = graphResults
    .filter(r => r.status === "ok" && r.data !== null && r.data.graphViews === 0)
    .map(r => ({ accountId: r.account.id, username: r.account.username }));

  const apifyViewsMap = needsApify.length > 0
    ? await fetchViewsApify(needsApify).catch((e) => {
        console.warn("[engagement/apify] fetchViewsApify error:", e instanceof Error ? e.message : e);
        return new Map<string, number>();
      })
    : new Map<string, number>();

  // ── Step 3: Build final results ───────────────────────────────────────────
  const results: AccountInsight[] = graphResults.map(r => {
    const { account } = r;
    if (r.status === "error" || !r.data) {
      return {
        id: account.id, username: account.username, profilePicUrl: account.profilePictureUrl ?? null,
        followers: 0, mediaCount: 0, avgLikes: 0, avgComments: 0, avgViews: 0,
        totalLikes: 0, totalComments: 0, totalViews: 0,
        engagementRate: 0, postsAnalyzed: 0, lastPostAt: null,
        status: "error" as const, error: r.error,
      };
    }

    const { followers, mediaCount, totalLikes, totalComments, graphViews, postsAnalyzed, reelsAnalyzed, lastPostAt } = r.data;
    const totalViews = graphViews > 0 ? graphViews : (apifyViewsMap.get(account.id) ?? 0);
    const nPosts = postsAnalyzed || 1;
    const nReels = (reelsAnalyzed ?? 0) > 0 ? (reelsAnalyzed ?? 1) : 1;
    const engagementRate = followers > 0
      ? Math.round(((totalLikes + totalComments) / nPosts / followers) * 1000) / 10
      : 0;

    return {
      id: account.id, username: account.username, profilePicUrl: account.profilePictureUrl ?? null,
      followers, mediaCount,
      avgLikes: Math.round(totalLikes / nPosts),
      avgComments: Math.round(totalComments / nPosts),
      avgViews: Math.round(totalViews / nReels),
      totalLikes, totalComments, totalViews,
      engagementRate, postsAnalyzed, lastPostAt,
      status: "ok" as const,
    };
  });

  results.sort((a, b) => b.engagementRate - a.engagementRate);

  const payload: CachePayload = { accounts: results, lastUpdated: new Date().toISOString() };
  saveCache(user.id, payload).catch(() => {});

  return NextResponse.json(payload);
}
