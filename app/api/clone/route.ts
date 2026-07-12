import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { createHash } from "crypto";
import { getCached, scrapeProfileAndReels } from "@/lib/scraper";
import { type CaptionTheme, shufflePool } from "@/lib/autoCaptions";
import { cleanVideo } from "@/lib/videoClean";

export const runtime = "nodejs";
export const maxDuration = 300;

const GRAPH = "https://graph.instagram.com/v21.0";

function storageAdmin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
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
  sourceUsername: string,
  caption: string,
  index: number,
  thumbnailUrl?: string | null,
  globalCoverUrl?: string | null,
): Promise<{ id: string; publicUrl: string } | null> {
  try {
    const urlHash = createHash("md5").update(videoUrl).digest("hex");
    const folder = `cloned/${userId}/${sourceUsername}`;
    const storagePath = `${folder}/${urlHash}.mp4`;
    const shortCaption = caption.slice(0, 60) || `Reel ${index + 1}`;

    // Primary check: exact URL hash match
    let existing = await prisma.libraryVideo.findFirst({ where: { userId, storagePath } });

    // Secondary check: same caption within same profile folder
    if (!existing && shortCaption.length > 20) {
      existing = await prisma.libraryVideo.findFirst({
        where: { userId, originalName: shortCaption, storagePath: { startsWith: `${folder}/` } },
      });
    }

    if (existing) {
      // Apply global cover if set; otherwise backfill from thumbnail if missing
      const desiredCover = globalCoverUrl ?? null;
      if (desiredCover && existing.coverUrl !== desiredCover) {
        await prisma.libraryVideo.update({ where: { id: existing.id }, data: { coverUrl: desiredCover } }).catch(() => {});
      } else if (!existing.coverUrl && thumbnailUrl) {
        const coverStoragePath = await uploadThumbnail(thumbnailUrl, userId, sourceUsername, urlHash);
        if (coverStoragePath) {
          const { data: pub } = storageAdmin().storage.from("library-videos").getPublicUrl(coverStoragePath);
          await prisma.libraryVideo.update({ where: { id: existing.id }, data: { coverUrl: pub.publicUrl } }).catch(() => {});
        }
      }
      return { id: existing.id, publicUrl: existing.publicUrl };
    }

    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const rawBuffer = Buffer.from(await res.arrayBuffer());
    const buffer = await cleanVideo(rawBuffer);

    const admin = storageAdmin();
    const { error } = await admin.storage
      .from("library-videos")
      .upload(storagePath, buffer, { contentType: "video/mp4", upsert: false });
    if (error) return null;

    const { data: pub } = admin.storage.from("library-videos").getPublicUrl(storagePath);

    // Use global cover if available, otherwise upload the Apify thumbnail
    let coverUrl: string | null = globalCoverUrl ?? null;
    if (!coverUrl && thumbnailUrl) {
      const coverPath = await uploadThumbnail(thumbnailUrl, userId, sourceUsername, urlHash);
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

async function uploadThumbnail(thumbnailUrl: string, userId: string, sourceUsername: string, hash: string): Promise<string | null> {
  try {
    const res = await fetch(thumbnailUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const coverPath = `cloned/${userId}/${sourceUsername}/covers/${hash}.jpg`;
    const { error } = await storageAdmin().storage
      .from("library-videos")
      .upload(coverPath, buf, { contentType: "image/jpeg", upsert: true });
    return error ? null : coverPath;
  } catch {
    return null;
  }
}


async function downloadVideosBackground(
  reels: Array<{ videoUrl: string; caption: string; thumbnailUrl?: string | null }>,
  userId: string,
  sourceUsername: string,
  cloneJobId: string,
  globalCoverUrl?: string | null,
) {
  const BATCH = 3;
  for (let i = 0; i < reels.length; i += BATCH) {
    const batch = reels.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (reel, j) => {
        const lib = await downloadReelToLibrary(reel.videoUrl, userId, sourceUsername, reel.caption, i + j, reel.thumbnailUrl, globalCoverUrl);
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
  cleanUsername: string;
  start: Date;
  intervalMs: number;
  postLimit: number | null | undefined;
  cloneBio: boolean;
  alternateSequence: boolean;
  groupSize: number;
  globalCoverUrl?: string | null;
  autoCaptions?: boolean;
  captionTheme?: CaptionTheme;
}

async function processCloneJob(p: ProcessParams) {
  try {
    // Ordem de prioridade: cache → biblioteca local → Apify (último recurso).
    // When library videos are used, posts are created with videoId so cron skips FFmpeg entirely.
    const urlToLibId = new Map<string, string>();
    let cachedData = await getCached(p.cleanUsername);
    if (!cachedData) {
      // Tenta biblioteca local do perfil específico antes de chamar Apify.
      // Primeiro tenta com userId, depois sem (fallback para mismatch de userId entre import e clone).
      let libVideos = await prisma.libraryVideo.findMany({
        where: { userId: p.userId, storagePath: { contains: `/${p.cleanUsername}/`, not: { contains: "/covers/" } } },
        orderBy: { createdAt: "asc" },
      });
      if (libVideos.length === 0) {
        libVideos = await prisma.libraryVideo.findMany({
          where: { storagePath: { contains: `/${p.cleanUsername}/`, not: { contains: "/covers/" } } },
          orderBy: { createdAt: "asc" },
          take: 500,
        });
      }
      if (libVideos.length > 0) {
        console.log(`[clone] usando ${libVideos.length} vídeos da biblioteca (sem chamar Apify)`);
        // Map publicUrl → library id so posts can be created with videoId (skips FFmpeg in cron)
        libVideos.forEach(v => urlToLibId.set(v.publicUrl, v.id));
        cachedData = {
          profile: { id: "", username: p.cleanUsername, fullName: p.cleanUsername, biography: "", profilePicUrl: "", followersCount: 0 },
          reels: libVideos.map((v) => ({
            videoUrl: v.publicUrl,
            caption: v.originalName || "",
            thumbnailUrl: v.coverUrl || "",
            shortCode: "",
            likes: 0,
            comments: 0,
            views: 0,
            timestamp: v.createdAt.toISOString(),
          })),
        };
      } else {
        // Biblioteca vazia → tenta Apify
        console.log(`[clone] biblioteca vazia, buscando via Apify`);
        try {
          cachedData = await scrapeProfileAndReels(p.cleanUsername);
        } catch (e) {
          await prisma.cloneJob.update({
            where: { id: p.cloneJobId },
            data: { totalReels: -1, errorMsg: `Falha ao buscar perfil @${p.cleanUsername}: ${e instanceof Error ? e.message : String(e)}` },
          }).catch(() => null);
          return;
        }
      }
    }

    const limit = p.postLimit ?? 9999;
    const rProfile = cachedData.profile;
    const rReels = cachedData.reels.slice(0, limit);

    const reelsItems: Record<string, unknown>[] = rReels.map((r) => ({
      videoUrl: r.videoUrl, caption: r.caption, shortCode: r.shortCode,
      displayUrl: r.thumbnailUrl, likesCount: r.likes, commentsCount: r.comments,
      videoViewCount: r.views, timestamp: r.timestamp,
    }));

    const biography = rProfile.biography ?? "";
    const profilePicUrl = rProfile.profilePicUrl ?? "";

    const seenUrls = new Set<string>();
    const reelsRaw = reelsItems
      .filter((r) => r.videoUrl)
      .map((r) => ({
        videoUrl: String(r.videoUrl),
        caption: String(r.caption ?? ""),
        thumbnailUrl: String(r.displayUrl ?? r.thumbnailUrl ?? "") || null,
      }))
      .filter((r) => { if (seenUrls.has(r.videoUrl)) return false; seenUrls.add(r.videoUrl); return true; });

    if (reelsRaw.length === 0) {
      const errorMsg = "Nenhum reel encontrado neste perfil. Verifique se o perfil é público e tem reels.";
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

    // Build caption pool — always have a fallback pool so no post is ever published without caption
    const seed = Math.abs(p.cloneJobId.split("").reduce((s, c) => s + c.charCodeAt(0), 0));
    const autoCaptionPool = (p.autoCaptions && p.captionTheme)
      ? shufflePool(p.captionTheme, seed)
      : null;
    // Fallback: used when source caption is empty and autoCaptions is off
    const fallbackPool = autoCaptionPool ?? shufflePool("mundo", seed);

    // Create all posts immediately with rawVideoUrl (skipping duplicates per account)
    let autoCaptionIdx = 0;
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

        const originalCaption = effectiveReel.caption.trim();
        if (!autoCaptionPool && originalCaption.length > 10 && acctSeenCaptions.get(account.id)!.has(originalCaption)) return [];

        const sourceCaption = effectiveReel.caption?.trim() ?? "";
        // If autoCaptions is on, use pool. If source caption is empty, use fallback pool. Otherwise use source.
        const caption = autoCaptionPool
          ? autoCaptionPool[autoCaptionIdx++ % autoCaptionPool.length]
          : sourceCaption || fallbackPool[autoCaptionIdx++ % fallbackPool.length];

        // Prefer library videoId reference so cron can publish directly without FFmpeg.
        const resolvedLibId = urlToLibId.get(effectiveReel.videoUrl) ?? pathToLibId.get(storagePaths[effectiveI]) ?? null;
        return [{
          userId: p.userId,
          accountId: account.id,
          videoId: resolvedLibId,
          rawVideoUrl: resolvedLibId ? null : effectiveReel.videoUrl,
          caption,
          scheduledAt: new Date(p.start.getTime() + i * p.intervalMs + accountIdx * 60_000),
          cloneJobId: p.cloneJobId,
        }];
      })
    );

    if (postsToCreate.length > 0) {
      await prisma.scheduledPost.createMany({ data: postsToCreate });
    }

    // Safety net: any post that ended up with empty caption gets auto-caption applied
    const emptyCaptioned = await prisma.scheduledPost.findMany({
      where: { cloneJobId: p.cloneJobId, status: "PENDING", caption: "" },
      select: { id: true },
    }).catch(() => []);
    if (emptyCaptioned.length > 0) {
      const safetyGroups = new Map<number, string[]>();
      emptyCaptioned.forEach(({ id }, i) => {
        const idx = i % fallbackPool.length;
        if (!safetyGroups.has(idx)) safetyGroups.set(idx, []);
        safetyGroups.get(idx)!.push(id);
      });
      await Promise.allSettled([...safetyGroups.entries()].map(([idx, ids]) =>
        prisma.scheduledPost.updateMany({ where: { id: { in: ids } }, data: { caption: fallbackPool[idx] } })
      ));
    }

    // When auto-captions is enabled, update ALL PENDING posts for these accounts.
    // This ensures old posts (from previous clones without auto-captions, or whose
    // CDN URL changed between scrapes) also get auto-captions, not just newly created ones.
    if (autoCaptionPool && p.accounts.length > 0) {
      const allPending = await prisma.scheduledPost.findMany({
        where: { accountId: { in: p.accounts.map(a => a.id) }, status: "PENDING" },
        select: { id: true },
        orderBy: { scheduledAt: "asc" },
      });
      if (allPending.length > 0) {
        // Group IDs by caption pool index — at most autoCaptionPool.length updateMany calls
        const groups = new Map<number, string[]>();
        allPending.forEach(({ id }, i) => {
          const poolIdx = i % autoCaptionPool.length;
          if (!groups.has(poolIdx)) groups.set(poolIdx, []);
          groups.get(poolIdx)!.push(id);
        });
        await Promise.allSettled([...groups.entries()].map(([poolIdx, ids]) =>
          prisma.scheduledPost.updateMany({
            where: { id: { in: ids }, status: "PENDING" },
            data: { caption: autoCaptionPool[poolIdx] },
          })
        ));
      }
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
    await downloadVideosBackground(reelsRaw, p.userId, p.cleanUsername, p.cloneJobId, p.globalCoverUrl);

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
      startAt?: string;
      alternateSequence?: boolean;
      groupSize?: number;
      globalCoverUrl?: string | null;
      autoCaptions?: boolean;
      captionTheme?: CaptionTheme;
    };

    const { username, accountIds, intervalMinutes = 10, postLimit, cloneBio = false, startAt, alternateSequence = false, groupSize = 5, globalCoverUrl = null, autoCaptions = true, captionTheme = "mundo" } = body;
    if (!username || !accountIds?.length || !startAt) {
      return NextResponse.json({ error: "Campos obrigatórios: username, accountIds, startAt" }, { status: 400 });
    }

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
        intervalMinutes,
      },
    });

    waitUntil(processCloneJob({
      cloneJobId: cloneJob.id,
      userId: user.id,
      accounts,
      cleanUsername,
      start,
      intervalMs,
      postLimit,
      cloneBio,
      alternateSequence,
      groupSize: Math.max(1, groupSize),
      globalCoverUrl: globalCoverUrl || null,
      autoCaptions,
      captionTheme,
    }));

    // Respond immediately — client polls for completion
    return NextResponse.json({ ok: true, cloneJobId: cloneJob.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[clone POST]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
