import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

interface TikwmVideo {
  video_id: string;
  title: string;
  play: string;
  wmplay: string;
  download: string; // no watermark
  cover: string;
  duration: number;
  play_count: number;
  digg_count: number;
  create_time: number;
}

interface TikwmResponse {
  code: number;
  msg: string;
  data?: {
    videos: TikwmVideo[];
    cursor: number;
    hasMore: boolean;
  };
}

async function fetchTikTokVideos(username: string, limit: number): Promise<{ videoUrl: string; caption: string }[]> {
  const results: { videoUrl: string; caption: string }[] = [];
  let cursor = 0;
  const pageSize = Math.min(limit, 20);

  while (results.length < limit) {
    const url = `https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(username)}&count=${pageSize}&cursor=${cursor}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) throw new Error(`tikwm HTTP ${res.status}`);

    const data = await res.json() as TikwmResponse;

    if (data.code !== 0 || !data.data?.videos?.length) break;

    for (const v of data.data.videos) {
      const videoUrl = v.download || v.play;
      if (videoUrl && videoUrl.startsWith("http")) {
        results.push({ videoUrl, caption: v.title ?? "" });
      }
      if (results.length >= limit) break;
    }

    if (!data.data.hasMore || data.data.videos.length === 0) break;
    cursor = data.data.cursor;
  }

  return results;
}

async function processJob(params: {
  cloneJobId: string;
  userId: string;
  accounts: Array<{ id: string }>;
  username: string;
  start: Date;
  intervalMs: number;
  postLimit: number | null | undefined;
}) {
  const { cloneJobId, userId, accounts, username, start, intervalMs, postLimit } = params;
  try {
    const limit = postLimit ?? 500;
    const rawReels = await fetchTikTokVideos(username, limit);

    console.log(`[tiktok-clone] username=${username} fetched=${rawReels.length}`);

    if (rawReels.length === 0) {
      await prisma.cloneJob.update({
        where: { id: cloneJobId },
        data: { totalReels: -1 },
      }).catch(() => null);
      return;
    }

    // Dedup videos
    const seen = new Set<string>();
    const reels = rawReels.filter((r) => {
      if (seen.has(r.videoUrl)) return false;
      seen.add(r.videoUrl);
      return true;
    });

    // Dedup against already-scheduled/published posts per account
    const meaningfulCaptions = [...new Set(reels.map((r) => r.caption.trim()).filter((c) => c.length > 10))];
    const rawUrls = reels.map((r) => r.videoUrl);
    const urlHashes = rawUrls.map((u) => createHash("md5").update(u).digest("hex"));
    const storagePaths = urlHashes.map((h) => `cloned/${userId}/${h}.mp4`);

    const [existingByUrl, existingByCaption, existingLibVideos] = await Promise.all([
      prisma.scheduledPost.findMany({
        where: { accountId: { in: accounts.map((a) => a.id) }, status: { in: ["DONE", "PENDING", "RUNNING"] }, rawVideoUrl: { in: rawUrls } },
        select: { accountId: true, rawVideoUrl: true },
      }),
      meaningfulCaptions.length > 0 ? prisma.scheduledPost.findMany({
        where: { accountId: { in: accounts.map((a) => a.id) }, status: { in: ["DONE", "PENDING", "RUNNING"] }, caption: { in: meaningfulCaptions } },
        select: { accountId: true, caption: true },
      }) : Promise.resolve([]),
      prisma.libraryVideo.findMany({
        where: { userId, storagePath: { in: storagePaths } },
        select: { id: true, storagePath: true },
      }),
    ]);

    const pathToLibId = new Map(existingLibVideos.map((v) => [v.storagePath, v.id]));
    const libVideoIds = [...pathToLibId.values()];
    const existingByLibId = libVideoIds.length > 0 ? await prisma.scheduledPost.findMany({
      where: { accountId: { in: accounts.map((a) => a.id) }, status: { in: ["DONE", "PENDING", "RUNNING"] }, videoId: { in: libVideoIds } },
      select: { accountId: true, videoId: true },
    }) : [];

    const acctUrls = new Map<string, Set<string>>();
    const acctCaptions = new Map<string, Set<string>>();
    const acctVideoIds = new Map<string, Set<string>>();
    for (const a of accounts) {
      acctUrls.set(a.id, new Set());
      acctCaptions.set(a.id, new Set());
      acctVideoIds.set(a.id, new Set());
    }
    for (const r of existingByUrl) { if (r.rawVideoUrl) acctUrls.get(r.accountId)?.add(r.rawVideoUrl); }
    for (const r of existingByCaption) { if (r.caption) acctCaptions.get(r.accountId)?.add(r.caption.trim()); }
    for (const r of existingByLibId) { if (r.videoId) acctVideoIds.get(r.accountId)?.add(r.videoId); }

    const postsToCreate = reels.flatMap((reel, i) =>
      accounts.flatMap((account, accountIdx) => {
        if (acctUrls.get(account.id)!.has(reel.videoUrl)) return [];
        const libId = pathToLibId.get(storagePaths[i]);
        if (libId && acctVideoIds.get(account.id)!.has(libId)) return [];
        const caption = reel.caption.trim();
        if (caption.length > 10 && acctCaptions.get(account.id)!.has(caption)) return [];
        return [{
          userId,
          accountId: account.id,
          videoId: null,
          rawVideoUrl: reel.videoUrl,
          caption: reel.caption,
          scheduledAt: new Date(start.getTime() + i * intervalMs + accountIdx * 60_000),
          cloneJobId,
        }];
      })
    );

    if (postsToCreate.length > 0) {
      await prisma.scheduledPost.createMany({ data: postsToCreate });
    }

    await prisma.cloneJob.update({
      where: { id: cloneJobId },
      data: { totalReels: reels.length, profilePicUrl: null, clonedBio: false },
    });
  } catch (err) {
    console.error("[clone/tiktok]", err instanceof Error ? err.message : err);
    await prisma.cloneJob.update({
      where: { id: cloneJobId },
      data: { totalReels: -1 },
    }).catch(() => null);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

    const body = await request.json() as {
      username?: string;
      accountIds?: string[];
      intervalMinutes?: number;
      postLimit?: number | null;
      startAt?: string;
    };

    const { username, accountIds, intervalMinutes = 10, postLimit, startAt } = body;
    if (!username || !accountIds?.length || !startAt) {
      return NextResponse.json({ error: "Campos obrigatórios: username, accountIds, startAt" }, { status: 400 });
    }

    const accounts = await prisma.instagramOAuthAccount.findMany({
      where: { id: { in: accountIds }, userId: user.id },
      select: { id: true },
    });
    if (accounts.length === 0) return NextResponse.json({ error: "Nenhuma conta válida" }, { status: 404 });

    // Extract username from URL if pasted
    const cleanUsername = username
      .replace(/https?:\/\/(www\.)?tiktok\.com\/@?/, "")
      .replace(/^@/, "")
      .split("?")[0]
      .split("/")[0]
      .trim();

    const cloneJob = await prisma.cloneJob.create({
      data: {
        userId: user.id,
        sourceUsername: `tiktok:${cleanUsername}`,
        profilePicUrl: null,
        accountUsernames: [],
        totalReels: 0,
        clonedBio: false,
        clonedPhoto: false,
      },
    });

    waitUntil(processJob({
      cloneJobId: cloneJob.id,
      userId: user.id,
      accounts,
      username: cleanUsername,
      start: new Date(startAt),
      intervalMs: intervalMinutes * 60_000,
      postLimit,
    }));

    return NextResponse.json({ ok: true, cloneJobId: cloneJob.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
