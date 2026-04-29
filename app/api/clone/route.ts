import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { randomUUID, createHash } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

const GRAPH = "https://graph.instagram.com/v21.0";

function storageAdmin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

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

async function updateBio(accessToken: string, igUserId: string, biography: string): Promise<void> {
  try {
    const url = new URL(`${GRAPH}/${igUserId}`);
    url.searchParams.set("biography", biography);
    url.searchParams.set("access_token", accessToken);
    await fetch(url.toString(), { method: "POST" });
  } catch { /* non-critical */ }
}

async function downloadReelToLibrary(
  videoUrl: string,
  userId: string,
  caption: string,
  index: number,
): Promise<{ id: string; publicUrl: string } | null> {
  try {
    const urlHash = createHash("md5").update(videoUrl).digest("hex");
    const storagePath = `cloned/${userId}/${urlHash}.mp4`;

    const existing = await prisma.libraryVideo.findFirst({ where: { userId, storagePath } });
    if (existing) return { id: existing.id, publicUrl: existing.publicUrl };

    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());

    const admin = storageAdmin();
    const { error } = await admin.storage
      .from("library-videos")
      .upload(storagePath, buffer, { contentType: "video/mp4", upsert: false });
    if (error) return null;

    const { data: pub } = admin.storage.from("library-videos").getPublicUrl(storagePath);
    const shortCaption = caption.slice(0, 60) || `Reel ${index + 1}`;
    const record = await prisma.libraryVideo.create({
      data: {
        userId,
        filename: storagePath.split("/").pop()!,
        originalName: shortCaption,
        storagePath,
        publicUrl: pub.publicUrl,
        sizeBytes: buffer.length,
        mimeType: "video/mp4",
      },
    });
    return { id: record.id, publicUrl: pub.publicUrl };
  } catch {
    return null;
  }
}

async function scrapeAndSaveMedia(
  token: string,
  username: string,
  userId: string,
  type: "stories" | "highlights",
): Promise<void> {
  try {
    const actorId = type === "stories"
      ? "apify/instagram-story-scraper"
      : "apify/instagram-highlights-scraper";
    const items = await apifyRun(token, actorId, { usernames: [username] });
    for (const item of items.slice(0, 40)) {
      const videoUrl = String(item.videoUrl ?? item.video_url ?? "");
      const imageUrl = String(item.displayUrl ?? item.imageUrl ?? item.image_url ?? item.url ?? "");
      const isVideo = !!videoUrl;
      const mediaUrl = isVideo ? videoUrl : imageUrl;
      if (!mediaUrl || mediaUrl === "undefined") continue;
      const label = type === "stories" ? "Story" : "Destaque";
      const ext = isVideo ? "mp4" : "jpg";
      const mimeType = isVideo ? "video/mp4" : "image/jpeg";
      try {
        const r = await fetch(mediaUrl, { signal: AbortSignal.timeout(30_000) });
        if (!r.ok) continue;
        const buffer = Buffer.from(await r.arrayBuffer());
        const storagePath = `cloned/${userId}/${randomUUID()}.${ext}`;
        const admin = storageAdmin();
        const { error } = await admin.storage.from("library-videos").upload(storagePath, buffer, { contentType: mimeType, upsert: false });
        if (error) continue;
        const { data: pub } = admin.storage.from("library-videos").getPublicUrl(storagePath);
        const name = `@${username} - ${label}`;
        await prisma.libraryVideo.create({
          data: { userId, filename: storagePath.split("/").pop()!, originalName: name, storagePath, publicUrl: pub.publicUrl, sizeBytes: buffer.length, mimeType },
        });
      } catch { continue; }
    }
  } catch { /* non-critical */ }
}

async function downloadVideosBackground(
  reels: Array<{ videoUrl: string; caption: string }>,
  userId: string,
  cloneJobId: string,
) {
  const BATCH = 3;
  for (let i = 0; i < reels.length; i += BATCH) {
    const batch = reels.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (reel, j) => {
        const lib = await downloadReelToLibrary(reel.videoUrl, userId, reel.caption, i + j);
        if (lib) {
          await prisma.scheduledPost.updateMany({
            where: { cloneJobId, rawVideoUrl: reel.videoUrl, status: "PENDING" },
            data: { videoId: lib.id, rawVideoUrl: null },
          });
        }
      })
    );
  }
}

interface ProcessParams {
  cloneJobId: string;
  userId: string;
  accounts: Array<{ id: string; username: string; instagramUserId: string; accessTokenEnc: string }>;
  tokens: string[];
  cleanUsername: string;
  start: Date;
  intervalMs: number;
  postLimit: number | null | undefined;
  cloneBio: boolean;
  cloneStories: boolean;
  cloneHighlights: boolean;
}

async function processCloneJob(p: ProcessParams) {
  try {
    let reelsItems: Record<string, unknown>[] = [];
    let profileItems: Record<string, unknown>[] = [];
    let usedToken = p.tokens[0];

    for (const t of p.tokens) {
      try {
        [reelsItems, profileItems] = await Promise.all([
          apifyRun(t, "apify/instagram-reel-scraper", { username: [p.cleanUsername], resultsLimit: p.postLimit ?? 9999 }),
          apifyRun(t, "apify/instagram-profile-scraper", { usernames: [p.cleanUsername] }),
        ]);
        usedToken = t;
        break;
      } catch (err) {
        const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
        if (msg.includes("monthly") || msg.includes("limit") || msg.includes("billing") || msg.includes("quota") || msg.includes("credit") || msg.includes("401") || msg.includes("402")) {
          continue;
        }
        throw err;
      }
    }

    const profileItem = (profileItems[0] ?? {}) as Record<string, unknown>;
    const biography = String(profileItem.biography ?? profileItem.bio ?? "");
    const profilePicUrl = String(profileItem.profilePicUrlHD ?? profileItem.profilePicUrl ?? "");

    const seenUrls = new Set<string>();
    const reelsRaw = reelsItems
      .filter((r) => r.videoUrl)
      .map((r) => ({ videoUrl: String(r.videoUrl), caption: String(r.caption ?? "") }))
      .filter((r) => { if (seenUrls.has(r.videoUrl)) return false; seenUrls.add(r.videoUrl); return true; })
      .slice(0, p.postLimit ?? undefined);

    if (reelsRaw.length === 0) {
      await prisma.cloneJob.delete({ where: { id: p.cloneJobId } }).catch(() => null);
      return;
    }

    // Deduplicate: skip videos already posted or pending for each account
    const rawUrls = reelsRaw.map((r) => r.videoUrl);
    const urlHashes = rawUrls.map((u) => createHash("md5").update(u).digest("hex"));
    const storagePaths = urlHashes.map((h) => `cloned/${p.userId}/${h}.mp4`);

    const [existingByUrl, existingLibVideos] = await Promise.all([
      prisma.scheduledPost.findMany({
        where: {
          accountId: { in: p.accounts.map((a) => a.id) },
          status: { in: ["DONE", "PENDING", "RUNNING"] },
          rawVideoUrl: { in: rawUrls },
        },
        select: { accountId: true, rawVideoUrl: true },
      }),
      prisma.libraryVideo.findMany({
        where: { userId: p.userId, storagePath: { in: storagePaths } },
        select: { id: true, storagePath: true },
      }),
    ]);

    const pathToLibId = new Map(existingLibVideos.map((v) => [v.storagePath, v.id]));
    const libVideoIds = [...pathToLibId.values()];
    const existingByLibId = libVideoIds.length > 0 ? await prisma.scheduledPost.findMany({
      where: {
        accountId: { in: p.accounts.map((a) => a.id) },
        status: { in: ["DONE", "PENDING", "RUNNING"] },
        videoId: { in: libVideoIds },
      },
      select: { accountId: true, videoId: true },
    }) : [];

    // Per-account sets of already-scheduled rawVideoUrls and videoIds
    const seenUrls = new Map<string, Set<string>>();
    const seenVideoIds = new Map<string, Set<string>>();
    for (const a of p.accounts) {
      seenUrls.set(a.id, new Set());
      seenVideoIds.set(a.id, new Set());
    }
    for (const r of existingByUrl) {
      if (r.rawVideoUrl) seenUrls.get(r.accountId)?.add(r.rawVideoUrl);
    }
    for (const r of existingByLibId) {
      if (r.videoId) seenVideoIds.get(r.accountId)?.add(r.videoId);
    }

    // Create all posts immediately with rawVideoUrl (skipping duplicates per account)
    const postsToCreate = reelsRaw.flatMap((reel, i) =>
      p.accounts.flatMap((account, accountIdx) => {
        const urls = seenUrls.get(account.id)!;
        if (urls.has(reel.videoUrl)) return [];
        const libId = pathToLibId.get(storagePaths[i]);
        if (libId && seenVideoIds.get(account.id)!.has(libId)) return [];
        return [{
          userId: p.userId,
          accountId: account.id,
          videoId: null,
          rawVideoUrl: reel.videoUrl,
          caption: reel.caption,
          scheduledAt: new Date(p.start.getTime() + i * p.intervalMs + accountIdx * 60_000),
          cloneJobId: p.cloneJobId,
        }];
      })
    );
    if (postsToCreate.length > 0) {
      await prisma.scheduledPost.createMany({ data: postsToCreate });
    }

    // Update job with final data — totalReels > 0 signals "done" to frontend
    await prisma.cloneJob.update({
      where: { id: p.cloneJobId },
      data: {
        totalReels: reelsRaw.length,
        profilePicUrl: profilePicUrl || null,
        clonedBio: p.cloneBio && !!biography,
      },
    });

    if (p.cloneBio && biography) {
      await Promise.all(
        p.accounts.map((account) =>
          updateBio(decryptAccountPassword(account.accessTokenEnc), account.instagramUserId, biography)
        )
      );
    }

    // Download videos to library in background (non-blocking for post scheduling)
    await Promise.all([
      downloadVideosBackground(reelsRaw, p.userId, p.cloneJobId),
      p.cloneStories ? scrapeAndSaveMedia(usedToken, p.cleanUsername, p.userId, "stories") : Promise.resolve(),
      p.cloneHighlights ? scrapeAndSaveMedia(usedToken, p.cleanUsername, p.userId, "highlights") : Promise.resolve(),
    ]);

  } catch (err) {
    console.error("[clone/processCloneJob]", err instanceof Error ? err.message : err);
    // Remove the pending job so it doesn't linger with 0 reels
    await prisma.cloneJob.delete({ where: { id: p.cloneJobId } }).catch(() => null);
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
      cloneBio?: boolean;
      cloneStories?: boolean;
      cloneHighlights?: boolean;
      startAt?: string;
    };

    const { username, accountIds, intervalMinutes = 10, postLimit, cloneBio = false, cloneStories = false, cloneHighlights = false, startAt } = body;
    if (!username || !accountIds?.length || !startAt) {
      return NextResponse.json({ error: "Campos obrigatórios: username, accountIds, startAt" }, { status: 400 });
    }

    // User's own tokens take priority, then fall back to system tokens
    const userTokenRecords = await prisma.userApifyToken.findMany({
      where: { userId: user.id, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { token: true },
    });
    const userTokens = userTokenRecords.map((r) => r.token);
    const systemTokens = (process.env.APIFY_TOKENS ?? process.env.APIFY_TOKEN ?? "")
      .split(",").map((t) => t.trim()).filter(Boolean);
    const tokens = [...userTokens, ...systemTokens];
    if (tokens.length === 0) return NextResponse.json({ error: "Token Apify não configurado. Adicione em Integrações." }, { status: 500 });

    const accounts = await prisma.instagramOAuthAccount.findMany({
      where: { id: { in: accountIds as string[] }, userId: user.id },
    });
    if (accounts.length === 0) return NextResponse.json({ error: "Nenhuma conta válida" }, { status: 404 });

    const cleanUsername = (username as string).replace("@", "").trim();
    const start = new Date(startAt as string);
    const intervalMs = intervalMinutes * 60 * 1000;

    // Create the job immediately (totalReels=0 = processing)
    const cloneJob = await prisma.cloneJob.create({
      data: {
        userId: user.id,
        sourceUsername: cleanUsername,
        profilePicUrl: null,
        accountUsernames: accounts.map((a) => a.username),
        totalReels: 0,
        clonedBio: false,
        clonedPhoto: false,
      },
    });

    // All heavy work (Apify + posts + library) runs in background
    waitUntil(processCloneJob({
      cloneJobId: cloneJob.id,
      userId: user.id,
      accounts,
      tokens,
      cleanUsername,
      start,
      intervalMs,
      postLimit,
      cloneBio,
      cloneStories,
      cloneHighlights,
    }));

    // Respond immediately — client polls for completion
    return NextResponse.json({ ok: true, cloneJobId: cloneJob.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[clone POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
