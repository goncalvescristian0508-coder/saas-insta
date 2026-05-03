import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

async function getApifyTokens(userId: string): Promise<string[]> {
  const userRecords = await prisma.userApifyToken.findMany({
    where: { userId, isActive: true },
    select: { token: true },
  });
  const envTokens = (process.env.APIFY_TOKENS ?? process.env.APIFY_TOKEN ?? "")
    .split(",").map((t) => t.trim()).filter(Boolean);
  return [...userRecords.map((r) => r.token), ...envTokens];
}

async function fetchTikTokVideos(
  username: string,
  limit: number,
  tokens: string[],
): Promise<{ videoUrl: string; caption: string }[]> {
  if (tokens.length === 0) throw new Error("Nenhum token Apify configurado. Adicione um token em Configurações.");

  const token = tokens[0];
  const actorId = "clockworks/tiktok-scraper";
  const pageSize = Math.min(limit, 100);

  // Try multiple input formats — actor versions differ
  const inputFormats = [
    { profiles: [username], resultsPerPage: pageSize },
    { profiles: [`@${username}`], resultsPerPage: pageSize },
    { startUrls: [{ url: `https://www.tiktok.com/@${username}` }], resultsPerPage: pageSize },
    { usernames: [username], maxItems: pageSize },
  ];

  let items: Record<string, unknown>[] = [];

  for (const input of inputFormats) {
    try {
      const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${token}&timeout=240&memory=1024`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(250_000),
      });
      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown>[];
      if (data.length > 0) { items = data; break; }
    } catch {
      continue;
    }
  }

  return items
    .slice(0, limit)
    .map((item) => {
      // Handle nested video object (some actor versions)
      const videoObj = item.video as Record<string, unknown> | undefined;
      const videoUrl = String(
        item.videoUrl ??
        item.video_url ??
        videoObj?.downloadAddr ??
        videoObj?.playAddr ??
        item.downloadAddr ??
        item.playAddr ??
        ""
      );
      const caption = String(
        item.text ?? item.desc ?? item.title ?? item.caption ?? ""
      );
      return { videoUrl, caption };
    })
    .filter((v) => v.videoUrl.startsWith("http"));
}

async function processJob(params: {
  cloneJobId: string;
  userId: string;
  accounts: Array<{ id: string }>;
  username: string;
  start: Date;
  intervalMs: number;
  postLimit: number | null | undefined;
  tokens: string[];
}) {
  const { cloneJobId, userId, accounts, username, start, intervalMs, postLimit, tokens } = params;
  try {
    const limit = postLimit ?? 500;
    const rawReels = await fetchTikTokVideos(username, limit, tokens);

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

    const [accounts, tokens] = await Promise.all([
      prisma.instagramOAuthAccount.findMany({
        where: { id: { in: accountIds }, userId: user.id },
        select: { id: true },
      }),
      getApifyTokens(user.id),
    ]);

    if (accounts.length === 0) return NextResponse.json({ error: "Nenhuma conta válida" }, { status: 404 });
    if (tokens.length === 0) return NextResponse.json({ error: "Nenhum token Apify configurado. Adicione um token em Configurações." }, { status: 400 });

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
      tokens,
    }));

    return NextResponse.json({ ok: true, cloneJobId: cloneJob.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
