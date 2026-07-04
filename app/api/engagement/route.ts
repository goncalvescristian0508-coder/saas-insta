import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { getAllApifyTokens, loadExhaustedTokens, persistExhaustedToken, isQuotaOrBillingError } from "@/lib/apifyRotation";

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
      { signal: AbortSignal.timeout(15_000) }),
    fetch(`${GRAPH}/${igUserId}/media?fields=id,like_count,comments_count,play_count,timestamp,media_type,media_product_type&limit=50&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(15_000) }),
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

  // Reels são VIDEO com play_count disponível
  const reels = posts.filter(p =>
    p.media_type === "VIDEO" && (p.play_count != null && p.play_count > 0)
  );

  const totalLikes = posts.reduce((s, p) => s + (p.like_count ?? 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.comments_count ?? 0), 0);
  // Views: soma apenas dos reels (videos com play_count)
  const graphViews = reels.reduce((s, p) => s + (p.play_count ?? 0), 0);
  const lastPostAt = posts[0]?.timestamp ?? null;

  return { followers, mediaCount, totalLikes, totalComments, graphViews, postsAnalyzed: posts.length, reelsAnalyzed: reels.length, lastPostAt };
}

// ── Apify view fetching ───────────────────────────────────────────────────────

async function apifyStartReelRun(token: string, username: string, limit: number): Promise<string> {
  const res = await fetch(`${APIFY_BASE}/acts/apify~instagram-reel-scraper/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: [username], resultsLimit: limit }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await res.json() as { data?: { id?: string }; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  const runId = json.data?.id;
  if (!runId) throw new Error("Apify: run ID ausente");
  return runId;
}

async function apifyRunStatus(token: string, runId: string): Promise<{ status: string; datasetId: string }> {
  const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`, { signal: AbortSignal.timeout(8_000) });
  const json = await res.json() as { data?: { status?: string; defaultDatasetId?: string } };
  return { status: json.data?.status ?? "UNKNOWN", datasetId: json.data?.defaultDatasetId ?? "" };
}

async function apifyGetDataset(token: string, datasetId: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&format=json`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return [];
  return res.json() as Promise<Record<string, unknown>[]>;
}

/**
 * Starts Apify reel-scraper runs distributed across all available tokens,
 * then polls all runs simultaneously every 3 s until done or timeout.
 * Accounts are split evenly across non-exhausted tokens to maximise quota usage.
 */
async function fetchViewsApify(
  accounts: Array<{ accountId: string; username: string }>,
  reelLimit = 15,
  maxWaitMs = 42_000,
): Promise<Map<string, number>> {
  const allTokens = await getAllApifyTokens();
  if (allTokens.length === 0) return new Map();
  const exhausted = await loadExhaustedTokens();
  const tokens = allTokens.filter((t) => !exhausted.has(t));
  if (tokens.length === 0) return new Map();

  // Assign each account to a token (round-robin)
  const tokenForAccount = (idx: number) => tokens[idx % tokens.length];

  // Start all runs simultaneously, each with its assigned token
  const runEntries = await Promise.all(
    accounts.map(async ({ accountId, username }, idx) => {
      const token = tokenForAccount(idx);
      try {
        const runId = await apifyStartReelRun(token, username, reelLimit);
        return { accountId, username, runId, token };
      } catch (e) {
        if (isQuotaOrBillingError(e)) {
          await persistExhaustedToken(token);
          console.warn(`[engagement/apify] token esgotado ao iniciar @${username}`);
        } else {
          console.warn(`[engagement/apify] start failed for @${username}:`, e instanceof Error ? e.message : e);
        }
        return null;
      }
    })
  );

  const active = runEntries.filter(Boolean) as Array<{ accountId: string; username: string; runId: string; token: string }>;
  if (active.length === 0) return new Map();

  console.log(`[engagement/apify] started ${active.length} runs across ${tokens.length} token(s)`);

  // Poll all runs until all terminal or deadline
  const pending = new Map(active.map(r => [r.runId, { accountId: r.accountId, token: r.token }]));
  const datasetMap = new Map<string, { datasetId: string; token: string }>();
  const deadline = Date.now() + maxWaitMs;

  while (pending.size > 0 && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3_000));
    const statuses = await Promise.all(
      [...pending.entries()].map(async ([runId, { token }]) => {
        const s = await apifyRunStatus(token, runId).catch(() => ({ status: "UNKNOWN", datasetId: "" }));
        return { runId, token, ...s };
      })
    );
    for (const { runId, token, status, datasetId } of statuses) {
      if (status === "SUCCEEDED") { datasetMap.set(runId, { datasetId, token }); pending.delete(runId); }
      else if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) { pending.delete(runId); }
    }
    console.log(`[engagement/apify] pending: ${pending.size}, completed: ${datasetMap.size}`);
  }

  // Fetch datasets and sum views
  const viewsMap = new Map<string, number>();
  await Promise.all(
    active.map(async ({ accountId, username, runId }) => {
      const entry = datasetMap.get(runId);
      if (!entry) { viewsMap.set(accountId, 0); return; }
      const items = await apifyGetDataset(entry.token, entry.datasetId);
      const total = items.reduce((s, i) => s + Number(
        i.viewsCount ?? i.videoViewCount ?? i.view_count ?? i.video_view_count ?? i.ig_play_count ?? i.play_count ?? 0
      ), 0);
      viewsMap.set(accountId, total);
      console.log(`[engagement/apify] @${username}: ${total} views from ${items.length} reels`);
    })
  );

  return viewsMap;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "true";

  // Serve from cache when not refreshing
  if (!refresh) {
    const cached = await loadCache(user.id);
    if (cached) return NextResponse.json(cached);
    return NextResponse.json({ accounts: [], lastUpdated: null });
  }

  // ── Step 1: Graph API for all accounts in parallel ───────────────────────
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

  // Contas onde o Graph API não retornou views (play_count = 0) — busca via Apify
  const needsApify = graphResults
    .filter((r) => r.status === "ok" && r.data && r.data.graphViews === 0)
    .map((r) => ({ accountId: r.account.id, username: r.account.username }));

  const apifyViewsMap = needsApify.length > 0
    ? await fetchViewsApify(needsApify).catch(() => new Map<string, number>())
    : new Map<string, number>();

  // ── Step 3: Build final results ──────────────────────────────────────────
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
      avgViews: Math.round(totalViews / nReels), // média só dos reels com views
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
