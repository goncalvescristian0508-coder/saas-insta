import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

async function apifyRun(token: string, actorId: string, input: object): Promise<Record<string, unknown>[]> {
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${token}&timeout=240&memory=512`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(250_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `Apify HTTP ${res.status}`);
  }
  return res.json() as Promise<Record<string, unknown>[]>;
}

async function processJob(params: {
  cloneJobId: string;
  userId: string;
  accounts: Array<{ id: string }>;
  tokens: string[];
  username: string;
  start: Date;
  intervalMs: number;
  postLimit: number | null | undefined;
}) {
  try {
    const { cloneJobId, userId, accounts, tokens, username, start, intervalMs, postLimit } = params;

    let items: Record<string, unknown>[] = [];
    for (const t of tokens) {
      try {
        items = await apifyRun(t, "clockworks/tiktok-scraper", {
          profiles: [username],
          resultsPerPage: postLimit ?? 9999,
          shouldDownloadVideos: false,
        });
        break;
      } catch (err) {
        const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
        if (msg.includes("monthly") || msg.includes("limit") || msg.includes("billing") || msg.includes("quota") || msg.includes("401") || msg.includes("402")) {
          continue;
        }
        throw err;
      }
    }

    const seen = new Set<string>();
    const reels = items
      .filter((r) => r.videoUrl)
      .map((r) => ({
        videoUrl: String(r.videoUrl),
        caption: String(r.text ?? r.description ?? r.title ?? ""),
      }))
      .filter((r) => {
        if (seen.has(r.videoUrl)) return false;
        seen.add(r.videoUrl);
        return true;
      })
      .slice(0, postLimit ?? undefined);

    if (reels.length === 0) {
      await prisma.cloneJob.delete({ where: { id: cloneJobId } }).catch(() => null);
      return;
    }

    // Dedup by caption per account (same logic as Instagram clone)
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
    await prisma.cloneJob.delete({ where: { id: params.cloneJobId } }).catch(() => null);
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

    const userTokenRecords = await prisma.userApifyToken.findMany({
      where: { userId: user.id, isActive: true },
      select: { token: true },
    });
    const userTokens = userTokenRecords.map((r) => r.token);
    const systemTokens = (process.env.APIFY_TOKENS ?? process.env.APIFY_TOKEN ?? "")
      .split(",").map((t) => t.trim()).filter(Boolean);
    const tokens = [...userTokens, ...systemTokens];
    if (tokens.length === 0) return NextResponse.json({ error: "Token Apify não configurado. Adicione em Integrações." }, { status: 500 });

    const accounts = await prisma.instagramOAuthAccount.findMany({
      where: { id: { in: accountIds }, userId: user.id },
      select: { id: true },
    });
    if (accounts.length === 0) return NextResponse.json({ error: "Nenhuma conta válida" }, { status: 404 });

    const cleanUsername = username.replace("@", "").trim();
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
      tokens,
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
