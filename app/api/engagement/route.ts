import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { getAllApifyTokens, loadExhaustedTokens, persistExhaustedToken, isQuotaOrBillingError } from "@/lib/apifyRotation";

export const runtime = "nodejs";
export const maxDuration = 60;

const GRAPH = "https://graph.instagram.com/v21.0";
const APIFY_BASE = "https://api.apify.com/v2";
const MAX_RUN_AGE_MS = 10 * 60 * 1000; // discard runs older than 10 min

// ── Types ────────────────────────────────────────────────────────────────────

interface MediaItem {
  id: string;
  like_count?: number;
  comments_count?: number;
  video_views?: number;
  play_count?: number;
  timestamp?: string;
  media_type?: string;
  media_product_type?: string; // "REELS" | "FEED" | "STORY"
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

interface ApifyRunEntry {
  accountId: string;
  username: string;
  runId: string;
  token: string;
  startedAt: number;
}

// ── Main cache ────────────────────────────────────────────────────────────────

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

// ── Apify async run + view cache ──────────────────────────────────────────────

function apifyRunsCacheKey(userId: string) { return `engagement_apify_runs_v1_${userId}`; }
function apifyViewsCacheKey(userId: string) { return `engagement_apify_views_v1_${userId}`; }

async function loadPendingApifyRuns(userId: string): Promise<ApifyRunEntry[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: apifyRunsCacheKey(userId) } });
    return row ? JSON.parse(row.value) as ApifyRunEntry[] : [];
  } catch { return []; }
}

async function savePendingApifyRuns(userId: string, runs: ApifyRunEntry[]): Promise<void> {
  try {
    await prisma.appSetting.upsert({
      where: { key: apifyRunsCacheKey(userId) },
      create: { key: apifyRunsCacheKey(userId), value: JSON.stringify(runs) },
      update: { value: JSON.stringify(runs) },
    });
  } catch { /* best effort */ }
}

async function loadCachedApifyViews(userId: string): Promise<Map<string, number>> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: apifyViewsCacheKey(userId) } });
    if (!row) return new Map();
    return new Map(Object.entries(JSON.parse(row.value) as Record<string, number>));
  } catch { return new Map(); }
}

async function saveCachedApifyViews(userId: string, views: Map<string, number>): Promise<void> {
  try {
    await prisma.appSetting.upsert({
      where: { key: apifyViewsCacheKey(userId) },
      create: { key: apifyViewsCacheKey(userId), value: JSON.stringify(Object.fromEntries(views)) },
      update: { value: JSON.stringify(Object.fromEntries(views)) },
    });
  } catch { /* best effort */ }
}

// ── Instagram Graph API ───────────────────────────────────────────────────────

async function fetchGraphEngagement(accessToken: string, igUserId: string) {
  const [profileRes, mediaRes] = await Promise.all([
    fetch(`${GRAPH}/${igUserId}?fields=followers_count,media_count&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(15_000) }),
    fetch(`${GRAPH}/${igUserId}/media?fields=id,like_count,comments_count,play_count,video_views,timestamp,media_type,media_product_type&limit=50&access_token=${accessToken}`,
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

  const reels = posts.filter(p =>
    p.media_type === "VIDEO" || p.media_product_type === "REELS"
  );

  const totalLikes = posts.reduce((s, p) => s + (p.like_count ?? 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.comments_count ?? 0), 0);
  const graphViews = reels.reduce((s, p) => s + (p.play_count ?? p.video_views ?? 0), 0);
  const lastPostAt = posts[0]?.timestamp ?? null;

  return { followers, mediaCount, totalLikes, totalComments, graphViews, postsAnalyzed: posts.length, reelsAnalyzed: reels.length, lastPostAt };
}

// ── Apify helpers ─────────────────────────────────────────────────────────────

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

  // ── Step 2: Poll pending Apify runs from the previous refresh ─────────────
  const [pendingRuns, cachedApifyViews] = await Promise.all([
    loadPendingApifyRuns(user.id),
    loadCachedApifyViews(user.id),
  ]);

  const nowMs = Date.now();
  const freshRuns = pendingRuns.filter(r => nowMs - r.startedAt < MAX_RUN_AGE_MS);

  let stillPending: ApifyRunEntry[] = [];
  if (freshRuns.length > 0) {
    // Catch errors inline so every entry resolves — keeps the run reference
    const pollResults = await Promise.all(freshRuns.map(async (run) => {
      try {
        const { status, datasetId } = await apifyRunStatus(run.token, run.runId);
        return { run, status, datasetId };
      } catch {
        return { run, status: "UNKNOWN", datasetId: "" };
      }
    }));

    const completedRuns: Array<{ run: ApifyRunEntry; datasetId: string }> = [];
    for (const { run, status, datasetId } of pollResults) {
      if (status === "SUCCEEDED" && datasetId) {
        completedRuns.push({ run, datasetId });
      } else if (!["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
        stillPending.push(run);
      }
    }

    if (completedRuns.length > 0) {
      await Promise.allSettled(completedRuns.map(async ({ run, datasetId }) => {
        try {
          const items = await apifyGetDataset(run.token, datasetId);
          const total = items.reduce((s, i) => s + Number(
            i.videoPlayCount ?? i.viewsCount ?? i.videoViewCount ?? i.view_count ?? i.video_view_count ?? i.ig_play_count ?? i.play_count ?? 0
          ), 0);
          cachedApifyViews.set(run.accountId, total);
          console.log(`[engagement/apify] polled @${run.username}: ${total} views from ${items.length} reels`);
        } catch { /* keep old cached value */ }
      }));
      await saveCachedApifyViews(user.id, cachedApifyViews);
    }

    await savePendingApifyRuns(user.id, stillPending);
  } else if (pendingRuns.length > 0) {
    // Stale runs — clear them
    await savePendingApifyRuns(user.id, []);
  }

  // ── Step 3: Start new Apify runs for accounts with no views (fire-and-forget)
  const pendingAccountIds = new Set(stillPending.map(r => r.accountId));
  const needsApify = graphResults.filter(r =>
    r.status === "ok" &&
    r.data !== null &&
    r.data.graphViews === 0 &&
    (r.data.reelsAnalyzed ?? 0) > 0 &&
    !pendingAccountIds.has(r.account.id)
  ).map(r => ({ accountId: r.account.id, username: r.account.username }));

  if (needsApify.length > 0) {
    const allTokens = await getAllApifyTokens();
    const exhausted = await loadExhaustedTokens();
    const tokens = allTokens.filter(t => !exhausted.has(t));

    if (tokens.length > 0) {
      const newRuns: ApifyRunEntry[] = [];
      await Promise.allSettled(needsApify.map(async ({ accountId, username }, idx) => {
        const token = tokens[idx % tokens.length];
        try {
          const runId = await apifyStartReelRun(token, username, 12);
          newRuns.push({ accountId, username, runId, token, startedAt: Date.now() });
          console.log(`[engagement/apify] started run for @${username} (run ${runId})`);
        } catch (e) {
          if (isQuotaOrBillingError(e)) await persistExhaustedToken(token);
          else console.warn(`[engagement/apify] start failed @${username}:`, e instanceof Error ? e.message : e);
        }
      }));
      if (newRuns.length > 0) await savePendingApifyRuns(user.id, newRuns);
    }
  }

  // ── Step 4: Build final results ───────────────────────────────────────────
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
    const totalViews = graphViews > 0 ? graphViews : (cachedApifyViews.get(account.id) ?? 0);
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
