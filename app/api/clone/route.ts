import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { randomUUID, createHash } from "crypto";
import { scrapeIgProfileAndReels } from "@/lib/instagramProxyScraper";
import { hikerScrapeProfileAndReels } from "@/lib/hikerApiScraper";
import { rapidScrapeProfileAndReels } from "@/lib/rapidApiScraper";

export const runtime = "nodejs";
export const maxDuration = 300;

const GRAPH = "https://graph.instagram.com/v21.0";

function storageAdmin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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
  const data = await res.json();
  if (!Array.isArray(data)) {
    const run = data as { status?: string };
    throw new Error(`Actor run did not succeed (status: ${run.status ?? "UNKNOWN"})`);
  }
  return data as Record<string, unknown>[];
}

function isApifyQuotaError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("monthly") || m.includes("limit") || m.includes("billing") ||
    m.includes("quota") || m.includes("credit") || m.includes("401") || m.includes("402");
}

async function apifyRunWithRetry(token: string, actorId: string, input: object): Promise<Record<string, unknown>[]> {
  let lastErr: Error = new Error("Apify falhou");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await apifyRun(token, actorId, input);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (isApifyQuotaError(lastErr.message)) throw lastErr; // quota errors — don't retry
      if (attempt < 2) await sleep(4000 * (attempt + 1));
    }
  }
  throw lastErr;
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
  thumbnailUrl?: string | null,
  globalCoverUrl?: string | null,
): Promise<{ id: string; publicUrl: string } | null> {
  try {
    const urlHash = createHash("md5").update(videoUrl).digest("hex");
    const storagePath = `cloned/${userId}/${urlHash}.mp4`;
    const shortCaption = caption.slice(0, 60) || `Reel ${index + 1}`;

    // Primary check: exact URL hash match
    let existing = await prisma.libraryVideo.findFirst({ where: { userId, storagePath } });

    // Secondary check: same caption (handles CDN URL rotations for same video)
    if (!existing && shortCaption.length > 20) {
      existing = await prisma.libraryVideo.findFirst({
        where: { userId, originalName: shortCaption, storagePath: { startsWith: `cloned/${userId}/` } },
      });
    }

    if (existing) {
      // Apply global cover if set; otherwise backfill from thumbnail if missing
      const desiredCover = globalCoverUrl ?? null;
      if (desiredCover && existing.coverUrl !== desiredCover) {
        await prisma.libraryVideo.update({ where: { id: existing.id }, data: { coverUrl: desiredCover } }).catch(() => {});
      } else if (!existing.coverUrl && thumbnailUrl) {
        const coverStoragePath = await uploadThumbnail(thumbnailUrl, userId, urlHash);
        if (coverStoragePath) {
          const { data: pub } = storageAdmin().storage.from("library-videos").getPublicUrl(coverStoragePath);
          await prisma.libraryVideo.update({ where: { id: existing.id }, data: { coverUrl: pub.publicUrl } }).catch(() => {});
        }
      }
      return { id: existing.id, publicUrl: existing.publicUrl };
    }

    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());

    const admin = storageAdmin();
    const { error } = await admin.storage
      .from("library-videos")
      .upload(storagePath, buffer, { contentType: "video/mp4", upsert: false });
    if (error) return null;

    const { data: pub } = admin.storage.from("library-videos").getPublicUrl(storagePath);

    // Use global cover if available, otherwise upload the Apify thumbnail
    let coverUrl: string | null = globalCoverUrl ?? null;
    if (!coverUrl && thumbnailUrl) {
      const coverPath = await uploadThumbnail(thumbnailUrl, userId, urlHash);
      if (coverPath) {
        const { data: coverPub } = admin.storage.from("library-videos").getPublicUrl(coverPath);
        coverUrl = coverPub.publicUrl;
      }
    }

    const record = await prisma.libraryVideo.create({
      data: {
        userId,
        filename: storagePath.split("/").pop()!,
        originalName: shortCaption,
        storagePath,
        publicUrl: pub.publicUrl,
        sizeBytes: buffer.length,
        mimeType: "video/mp4",
        coverUrl,
      },
    });
    return { id: record.id, publicUrl: pub.publicUrl };
  } catch {
    return null;
  }
}

async function uploadThumbnail(thumbnailUrl: string, userId: string, hash: string): Promise<string | null> {
  try {
    const res = await fetch(thumbnailUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const coverPath = `cloned/${userId}/covers/${hash}.jpg`;
    const { error } = await storageAdmin().storage
      .from("library-videos")
      .upload(coverPath, buf, { contentType: "image/jpeg", upsert: true });
    return error ? null : coverPath;
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
  reels: Array<{ videoUrl: string; caption: string; thumbnailUrl?: string | null }>,
  userId: string,
  cloneJobId: string,
  globalCoverUrl?: string | null,
) {
  const BATCH = 3;
  for (let i = 0; i < reels.length; i += BATCH) {
    const batch = reels.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (reel, j) => {
        const lib = await downloadReelToLibrary(reel.videoUrl, userId, reel.caption, i + j, reel.thumbnailUrl, globalCoverUrl);
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
  alternateSequence: boolean;
  groupSize: number;
  globalCoverUrl?: string | null;
}

async function processCloneJob(p: ProcessParams) {
  try {
    let reelsItems: Record<string, unknown>[] = [];
    let profileItems: Record<string, unknown>[] = [];
    let usedToken = p.tokens[0];

    function mapReels(reels: { videoUrl: string; caption: string; shortCode: string; thumbnailUrl: string; likes: number; comments: number; views: number; timestamp: string }[]): Record<string, unknown>[] {
      return reels.map((r) => ({
        videoUrl: r.videoUrl, caption: r.caption, shortCode: r.shortCode,
        displayUrl: r.thumbnailUrl, likesCount: r.likes, commentsCount: r.comments,
        videoViewCount: r.views, timestamp: r.timestamp,
      }));
    }
    function mapProfile(p2: { fullName: string; biography: string; profilePicUrl: string; followersCount: number }): Record<string, unknown> {
      return { fullName: p2.fullName, biography: p2.biography, profilePicUrl: p2.profilePicUrl, profilePicUrlHD: p2.profilePicUrl, followersCount: p2.followersCount };
    }

    // ── 1st: direct Instagram API via DataImpulse residential proxy ──
    let usedProxy = false;
    try {
      const { profile: igProfile, reels: igReels } = await scrapeIgProfileAndReels(p.cleanUsername, p.postLimit ?? 9999);
      profileItems = [mapProfile(igProfile)];
      reelsItems = mapReels(igReels);
      usedProxy = true;
    } catch (proxyErr) {
      console.log("[clone] private-api failed:", proxyErr instanceof Error ? proxyErr.message : proxyErr);
    }

    // ── 2nd: HikerAPI ──
    if (!usedProxy && process.env.HIKERAPI_KEY) {
      try {
        const { profile: hProfile, reels: hReels } = await hikerScrapeProfileAndReels(p.cleanUsername, p.postLimit ?? 9999);
        profileItems = [mapProfile(hProfile)];
        reelsItems = mapReels(hReels);
        usedProxy = true;
      } catch (hikerErr) {
        console.log("[clone] hikerapi failed:", hikerErr instanceof Error ? hikerErr.message : hikerErr);
      }
    }

    // ── 3rd: RapidAPI Instagram120 ──
    if (!usedProxy && process.env.RAPIDAPI_KEY) {
      try {
        const { profile: rProfile, reels: rReels } = await rapidScrapeProfileAndReels(p.cleanUsername, p.postLimit ?? 9999);
        profileItems = [mapProfile(rProfile)];
        reelsItems = mapReels(rReels);
        usedProxy = true;
      } catch (rapidErr) {
        console.log("[clone] rapidapi failed:", rapidErr instanceof Error ? rapidErr.message : rapidErr);
      }
    }

    // ── 4th: Apify (with DataImpulse residential proxy to bypass Instagram blocks) ──
    const diUser = process.env.DATAIMPULSE_USER ?? "";
    const diPass = process.env.DATAIMPULSE_PASS ?? "";
    const proxyConfig = diUser && diPass
      ? { proxyConfiguration: { proxyUrls: [`http://${diUser}:${diPass}@gw.dataimpulse.com:823`] } }
      : {};

    let lastTokenErr: Error | null = null;
    if (!usedProxy) {
      for (const t of p.tokens) {
        try {
          [reelsItems, profileItems] = await Promise.all([
            apifyRunWithRetry(t, "apify/instagram-reel-scraper", { username: [p.cleanUsername], resultsLimit: p.postLimit ?? 9999, ...proxyConfig }),
            apifyRunWithRetry(t, "apify/instagram-profile-scraper", { usernames: [p.cleanUsername], ...proxyConfig }),
          ]);
          // Detect error items (proxy blocked)
          let profileItem = profileItems[0] ?? {};
          if (!profileItem.username) {
            // Profile scraper blocked — try to synthesize from reel owner metadata
            const ownerReel = reelsItems.find((r) => r.ownerUsername || r.authorUsername);
            if (ownerReel) {
              profileItem = {
                username: ownerReel.ownerUsername ?? ownerReel.authorUsername ?? p.cleanUsername,
                fullName: ownerReel.ownerFullName ?? ownerReel.authorFullName ?? ownerReel.ownerUsername,
                profilePicUrlHD: ownerReel.ownerProfilePicUrl ?? ownerReel.authorProfilePicUrl,
                profilePicUrl: ownerReel.ownerProfilePicUrl ?? ownerReel.authorProfilePicUrl,
                biography: "",
                followersCount: ownerReel.ownerFollowersCount ?? ownerReel.authorFollowersCount ?? 0,
              };
              profileItems[0] = profileItem; // keep in sync so post-loop code reads correct data
            } else {
              const errMsg = String(profileItem.errorDescription ?? profileItem.error ?? "Perfil bloqueado pelo proxy do Apify");
              lastTokenErr = new Error(errMsg);
              continue;
            }
          }
          const hasValidReels = reelsItems.some((r) => r.videoUrl || r.shortCode || r.id);
          if (!hasValidReels && reelsItems.length > 0) {
            const firstItem = reelsItems[0];
            const errMsg = String(firstItem.errorDescription ?? firstItem.error ?? (Array.isArray(firstItem.requestErrorMessages) ? (firstItem.requestErrorMessages as string[])[0] : "") ?? "proxy error");
            lastTokenErr = new Error(errMsg);
            continue;
          }
          usedToken = t;
          lastTokenErr = null;
          break;
        } catch (err) {
          lastTokenErr = err instanceof Error ? err : new Error(String(err));
          if (isApifyQuotaError(lastTokenErr.message)) continue;
          throw lastTokenErr;
        }
      }
      if (lastTokenErr) throw lastTokenErr;
    }

    const profileItem = (profileItems[0] ?? {}) as Record<string, unknown>;
    const biography = String(profileItem.biography ?? profileItem.bio ?? "");
    const profilePicUrl = String(profileItem.profilePicUrlHD ?? profileItem.profilePicUrl ?? "");

    const seenUrls = new Set<string>();
    const reelsRaw = reelsItems
      .filter((r) => r.videoUrl)
      .map((r) => ({
        videoUrl: String(r.videoUrl),
        caption: String(r.caption ?? ""),
        thumbnailUrl: String(r.displayUrl ?? r.thumbnailUrl ?? r.previewUrl ?? "") || null,
      }))
      .filter((r) => { if (seenUrls.has(r.videoUrl)) return false; seenUrls.add(r.videoUrl); return true; })
      .slice(0, p.postLimit ?? undefined);

    if (reelsRaw.length === 0) {
      // Check if Apify returned error items instead of reels
      const firstItem = (reelsItems[0] ?? {}) as Record<string, unknown>;
      const hasApifyError = firstItem.requestErrorMessages || firstItem.errorDescription || firstItem.error;
      const errDesc = hasApifyError
        ? String(firstItem.errorDescription ?? firstItem.error ?? (Array.isArray(firstItem.requestErrorMessages) ? (firstItem.requestErrorMessages as string[])[0] : "") ?? "")
        : "";
      const errorMsg = errDesc || "Nenhum reel encontrado neste perfil. Verifique se o perfil é público e tem reels.";
      await prisma.cloneJob.update({
        where: { id: p.cloneJobId },
        data: { totalReels: -1, errorMsg },
      }).catch(() => null);
      return;
    }

    // Deduplicate: skip videos already posted or pending for each account.
    // Uses three signals: rawVideoUrl (exact), library video hash, and caption
    // (caption is stable across re-scrapes when CDN URLs change).
    const rawUrls = reelsRaw.map((r) => r.videoUrl);
    const urlHashes = rawUrls.map((u) => createHash("md5").update(u).digest("hex"));
    const storagePaths = urlHashes.map((h) => `cloned/${p.userId}/${h}.mp4`);
    const meaningfulCaptions = [...new Set(
      reelsRaw.map((r) => r.caption.trim()).filter((c) => c.length > 10)
    )];

    const [existingByUrl, existingLibVideos, existingByCaption] = await Promise.all([
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
      meaningfulCaptions.length > 0 ? prisma.scheduledPost.findMany({
        where: {
          accountId: { in: p.accounts.map((a) => a.id) },
          status: { in: ["DONE", "PENDING", "RUNNING"] },
          caption: { in: meaningfulCaptions },
        },
        select: { accountId: true, caption: true },
      }) : Promise.resolve([]),
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

    // Per-account sets for quick lookup
    const acctSeenUrls = new Map<string, Set<string>>();
    const acctSeenVideoIds = new Map<string, Set<string>>();
    const acctSeenCaptions = new Map<string, Set<string>>();
    for (const a of p.accounts) {
      acctSeenUrls.set(a.id, new Set());
      acctSeenVideoIds.set(a.id, new Set());
      acctSeenCaptions.set(a.id, new Set());
    }
    for (const r of existingByUrl) {
      if (r.rawVideoUrl) acctSeenUrls.get(r.accountId)?.add(r.rawVideoUrl);
    }
    for (const r of existingByLibId) {
      if (r.videoId) acctSeenVideoIds.get(r.accountId)?.add(r.videoId);
    }
    for (const r of existingByCaption) {
      if (r.caption) acctSeenCaptions.get(r.accountId)?.add(r.caption.trim());
    }

    // Create all posts immediately with rawVideoUrl (skipping duplicates per account)
    const postsToCreate = reelsRaw.flatMap((reel, i) =>
      p.accounts.flatMap((account, accountIdx) => {
        // Alternate sequence: each group of accounts starts from a different video
        const effectiveI = p.alternateSequence
          ? (i + Math.floor(accountIdx / p.groupSize)) % reelsRaw.length
          : i;
        const effectiveReel = p.alternateSequence ? reelsRaw[effectiveI] : reel;

        if (acctSeenUrls.get(account.id)!.has(effectiveReel.videoUrl)) return [];
        const libId = pathToLibId.get(storagePaths[effectiveI]);
        if (libId && acctSeenVideoIds.get(account.id)!.has(libId)) return [];
        const caption = effectiveReel.caption.trim();
        if (caption.length > 10 && acctSeenCaptions.get(account.id)!.has(caption)) return [];
        return [{
          userId: p.userId,
          accountId: account.id,
          videoId: null,
          rawVideoUrl: effectiveReel.videoUrl,
          caption: effectiveReel.caption,
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
      downloadVideosBackground(reelsRaw, p.userId, p.cloneJobId, p.globalCoverUrl),
      p.cloneStories ? scrapeAndSaveMedia(usedToken, p.cleanUsername, p.userId, "stories") : Promise.resolve(),
      p.cloneHighlights ? scrapeAndSaveMedia(usedToken, p.cleanUsername, p.userId, "highlights") : Promise.resolve(),
    ]);

  } catch (err) {
    const errorMsg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error("[clone/processCloneJob]", errorMsg);
    await prisma.cloneJob.update({
      where: { id: p.cloneJobId },
      data: { totalReels: -1, errorMsg },
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
      cloneBio?: boolean;
      cloneStories?: boolean;
      cloneHighlights?: boolean;
      startAt?: string;
      alternateSequence?: boolean;
      groupSize?: number;
      globalCoverUrl?: string | null;
    };

    const { username, accountIds, intervalMinutes = 10, postLimit, cloneBio = false, cloneStories = false, cloneHighlights = false, startAt, alternateSequence = false, groupSize = 5, globalCoverUrl = null } = body;
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
    // Tokens are used as Apify fallback; proxy scraper runs first so tokens aren't strictly required
    if (tokens.length === 0) console.warn("[clone] No Apify tokens configured — relying on proxy scraper only");

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
      alternateSequence,
      groupSize: Math.max(1, groupSize),
      globalCoverUrl: globalCoverUrl || null,
    }));

    // Respond immediately — client polls for completion
    return NextResponse.json({ ok: true, cloneJobId: cloneJob.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[clone POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
