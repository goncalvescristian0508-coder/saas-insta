import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import {
  createReelContainer,
  checkContainerStatus,
  publishMediaContainer,
} from "@/lib/instagramGraphPublish";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { sendPushToUser } from "@/lib/sendPush";
import { stripMp4Metadata } from "@/lib/videoUtils";
import { shufflePool } from "@/lib/autoCaptions";
import { transformVideoForAccount } from "@/lib/videoTransform";

function storageAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function downloadAndStripVideo(rawUrl: string, userId: string): Promise<{ publicUrl: string; storagePath: string }> {
  const urlHash = createHash("md5").update(rawUrl).digest("hex");
  const storagePath = `cloned/${userId}/${urlHash}.mp4`;
  const admin = storageAdmin();

  const res = await fetch(rawUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Falha ao baixar vídeo: HTTP ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());
  const buffer = stripMp4Metadata(raw);

  const { error } = await admin.storage.from("library-videos").upload(storagePath, buffer, {
    contentType: "video/mp4", upsert: true,
  });
  if (error) throw new Error(`Falha ao salvar vídeo: ${error.message}`);
  const { data: pub } = admin.storage.from("library-videos").getPublicUrl(storagePath);
  return { publicUrl: pub.publicUrl, storagePath };
}

/**
 * Download the base video (from Apify or Supabase cache), apply per-account
 * FFmpeg transformation, and upload the result as a unique per-post file.
 * Returns the public URL for the unique video + the storage path for later cleanup.
 */
async function downloadTransformAndHostVideo(
  rawUrl: string,
  userId: string,
  accountId: string,
  postId: string,
): Promise<{ publicUrl: string; uniqueStoragePath: string }> {
  const urlHash = createHash("md5").update(rawUrl).digest("hex");
  const baseStoragePath = `cloned/${userId}/${urlHash}.mp4`;
  const admin = storageAdmin();

  // Try to reuse the stripped base from LibraryVideo (avoids re-downloading from Apify)
  // Search by hash suffix to handle both old (cloned/{userId}/{hash}.mp4) and
  // new (cloned/{userId}/{username}/{hash}.mp4) path formats.
  let rawBuffer: Buffer | null = null;
  const baseLibVideo = await prisma.libraryVideo
    .findFirst({ where: { userId, storagePath: { contains: urlHash } } })
    .catch(() => null);

  if (baseLibVideo) {
    const baseRes = await fetch(baseLibVideo.publicUrl, { signal: AbortSignal.timeout(25_000) });
    if (baseRes.ok) {
      rawBuffer = Buffer.from(await baseRes.arrayBuffer());
    } else {
      console.warn("[cron] cache 403/erro:", baseRes.status, baseLibVideo.publicUrl.slice(0, 80));
    }
  }

  if (!rawBuffer) {
    // Cache miss or expired: download from source
    const sourceRes = await fetch(rawUrl, { signal: AbortSignal.timeout(30_000) });
    if (!sourceRes.ok) throw new Error(`Falha ao baixar vídeo fonte: HTTP ${sourceRes.status} (URL Apify provavelmente expirou)`);
    rawBuffer = stripMp4Metadata(Buffer.from(await sourceRes.arrayBuffer()));

    const { error: baseUpErr } = await admin.storage
      .from("library-videos")
      .upload(baseStoragePath, rawBuffer, { contentType: "video/mp4", upsert: true });
    if (!baseUpErr) {
      const { data: basePub } = admin.storage.from("library-videos").getPublicUrl(baseStoragePath);
      await prisma.libraryVideo.create({
        data: {
          userId,
          filename: urlHash + ".mp4",
          originalName: "Base reel",
          storagePath: baseStoragePath,
          publicUrl: basePub.publicUrl,
          sizeBytes: 0,
          mimeType: "video/mp4",
        },
      }).catch(() => {});
    }
  }

  // Apply per-account FFmpeg transformation (unique trim + CRF + audio)
  const transformed = await transformVideoForAccount(rawBuffer, accountId);

  // Upload per-post unique file
  const uniquePath = `cloned-unique/${postId}.mp4`;
  const { error: upErr } = await admin.storage
    .from("library-videos")
    .upload(uniquePath, transformed, { contentType: "video/mp4", upsert: true });
  if (upErr) throw new Error(`Falha ao salvar vídeo único: ${upErr.message}`);

  const { data: pub } = admin.storage.from("library-videos").getPublicUrl(uniquePath);
  return { publicUrl: pub.publicUrl, uniqueStoragePath: uniquePath };
}

export const runtime = "nodejs";
export const maxDuration = 300;

function pickFromLibPool(
  libUrls: string[],
  accountId: string,
  cloneJobId: string,
  usedMap: Map<string, Set<string>>,
): string {
  const libKey = `${accountId}:${cloneJobId}`;
  const used = usedMap.get(libKey) ?? new Set<string>();
  const pool = libUrls.filter(u => !used.has(u));
  const pickFrom = pool.length > 0 ? pool : libUrls;
  const accountOffset = Math.abs(accountId.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0));
  const url = pickFrom[(accountOffset + used.size) % pickFrom.length];
  used.add(url);
  usedMap.set(libKey, used);
  return url;
}

async function runCron() {
  const now = new Date();

  console.log("[cron] start", now.toISOString());

  // ── Pre-flight DB resets (all guarded) ──────────────────────────────────────

  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  await prisma.scheduledPost.updateMany({
    where: { status: "RUNNING", containerCreationId: null, updatedAt: { lte: fiveMinutesAgo } },
    data: { status: "PENDING" },
  }).catch(e => console.error("[cron] reset stuck RUNNING:", e));

  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  await prisma.scheduledPost.updateMany({
    where: {
      status: "FAILED",
      scheduledAt: { lte: now },
      retryCount: { lt: 6 },
      updatedAt: { lte: oneMinuteAgo },
    },
    data: { status: "PENDING", errorMsg: null, containerCreationId: null, containerCreatedAt: null },
  }).catch(e => console.error("[cron] retry failed:", e));

  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  await prisma.scheduledPost.updateMany({
    where: {
      status: "FAILED",
      retryCount: { gte: 6 },
      updatedAt: { lte: twoHoursAgo },
      account: { accountStatus: "ACTIVE" },
    },
    data: { status: "PENDING", retryCount: 0, scheduledAt: now, errorMsg: null, containerCreationId: null, containerCreatedAt: null },
  }).catch(e => console.error("[cron] auto-reset exhausted:", e));

  await prisma.instagramOAuthAccount.updateMany({
    where: { accountStatus: "QUARANTINE", quarantinedUntil: { lte: now } },
    data: { accountStatus: "ACTIVE", quarantinedUntil: null },
  }).catch(e => console.error("[cron] release quarantine:", e));

  const warmups = await prisma.accountWarmup.findMany({ where: { isActive: true } }).catch(() => []);
  const warmupMap = new Map(warmups.map((w) => [w.accountId, w]));

  // Block accounts that have ANY RUNNING post (with or without container) to prevent
  // creating multiple containers per account and avoid back-to-back publishing.
  const phase1Running = await prisma.scheduledPost.findMany({
    where: { status: "RUNNING" },
    select: { accountId: true },
  }).catch(() => []);
  const busyPhase1 = new Set(phase1Running.map((p) => p.accountId));

  // ── PHASE 2: Publish containers (parallel, 15 at a time) ─────────────────────
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const runningWithContainer = await prisma.scheduledPost.findMany({
    where: { status: "RUNNING", containerCreationId: { not: null } },
    include: { account: true, video: true },
    orderBy: { containerCreatedAt: "asc" },
    take: 30,
  }).catch(() => []);

  console.log("[cron] phase2:", runningWithContainer.length, "containers to check");

  // One container per account per tick — prevents 2+ reels publishing simultaneously
  // on the same account (containerCreatedAt asc ensures oldest goes first).
  const seenAccPhase2 = new Set<string>();
  const uniqueContainers = runningWithContainer.filter(post => {
    if (seenAccPhase2.has(post.accountId)) return false;
    seenAccPhase2.add(post.accountId);
    return true;
  });

  await Promise.all(uniqueContainers.map(async (post) => {
    try {
      const accessToken = decryptAccountPassword(post.account.accessTokenEnc);
      const proxyUrl = post.account.proxyUrl ?? null;
      const containerStatus = await checkContainerStatus(post.containerCreationId!, accessToken, proxyUrl);
      console.log("[cron] container @", post.account.username, "status:", containerStatus, "| url:", post.rawVideoUrl?.slice(0, 60) ?? "videoId");

      if (containerStatus === "FINISHED") {
        const pubResult = await publishMediaContainer(post.account.instagramUserId, accessToken, post.containerCreationId!, proxyUrl);

        if (pubResult.ok) {
          await prisma.scheduledPost.update({
            where: { id: post.id },
            data: { status: "DONE", postedAt: now, errorMsg: null, containerCreationId: null, containerCreatedAt: null, rehostStoragePath: null },
          });

          // Delete the per-post unique video from Supabase now that Instagram has it
          if (post.rehostStoragePath) {
            storageAdmin().storage.from("library-videos").remove([post.rehostStoragePath]).catch(() => {});
          }

          const warmup = warmupMap.get(post.accountId);
          if (warmup) {
            const newCount = warmup.completedPosts + 1;
            await prisma.accountWarmup.update({
              where: { id: warmup.id },
              data: { completedPosts: newCount, lastPostedAt: now, isActive: newCount < warmup.targetPosts },
            }).catch(() => {});
          }

          const notifIntegration = await prisma.userIntegration.findUnique({
            where: { userId_type: { userId: post.userId, type: "notifications" } },
          }).catch(() => null);
          const notifCfg = notifIntegration ? (() => { try { return JSON.parse(notifIntegration.config) as Record<string, string>; } catch { return {}; } })() : {};
          const customName = notifCfg.customName?.trim() || "AutoPost";
          if (notifCfg.approvedEnabled !== "false") {
            await sendPushToUser(post.userId, {
              title: `Post publicado! | ${customName}`,
              body: `@${post.account.username}`,
              url: "/schedule",
            }).catch(() => {});
          }
          // Enforce minimum gap between posts on the same account using the clone's interval.
          // Clamps to [30, 240] minutes so it never goes too short or too long.
          const cloneInterval = post.cloneJobId
            ? await prisma.cloneJob.findUnique({ where: { id: post.cloneJobId }, select: { intervalMinutes: true } }).catch(() => null)
            : null;
          const cooldownMinutes = Math.max(30, Math.min(cloneInterval?.intervalMinutes ?? 60, 240));
          const cooldownAt = new Date(now.getTime() + cooldownMinutes * 60 * 1000);
          await prisma.scheduledPost.updateMany({
            where: { accountId: post.accountId, status: "PENDING", scheduledAt: { lt: cooldownAt } },
            data: { scheduledAt: cooldownAt },
          }).catch(() => {});

          console.log("[cron] published @", post.account.username);
        } else {
          await failPost(post, pubResult.error ?? "Falha ao publicar container", now);
        }
      } else if (containerStatus === "ERROR" || containerStatus === "EXPIRED") {
        await failPost(post, `Container ${containerStatus.toLowerCase()} — vídeo inválido ou fora das especificações do Instagram`, now);
      } else {
        if (post.containerCreatedAt && post.containerCreatedAt < tenMinutesAgo) {
          await failPost(post, "Timeout: vídeo não processado pelo Instagram em 10 minutos", now);
        }
      }
    } catch (err) {
      await failPost(post, err instanceof Error ? err.message : "Erro desconhecido", now);
    }
  }));

  // ── PHASE 1: Create containers for pending posts (parallel) ──────────────────
  // Guard: skip phase1 only if another invocation is still processing (phase2 always runs above).
  const activePhase1Count = await prisma.scheduledPost.count({
    where: { status: "RUNNING", containerCreationId: null, updatedAt: { gte: new Date(now.getTime() - 50_000) } },
  }).catch(() => 0);
  if (activePhase1Count > 0) {
    console.log("[cron] phase1 skip — concurrent active:", activePhase1Count);
    return;
  }

  // Dedup by (accountId, cloneJobId) so every active clone gets slots regardless of scheduledAt,
  // then random-sample 20 for fair distribution across accounts and clones.
  const eligibleMinimal = await prisma.scheduledPost.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: now },
      accountId: { notIn: [...busyPhase1] },
      account: { accountStatus: "ACTIVE" },
    },
    select: { id: true, accountId: true, cloneJobId: true },
    orderBy: { scheduledAt: "asc" },
    take: 2000,
  }).catch(() => [] as { id: string; accountId: string; cloneJobId: string | null }[]);

  // One post per (account × clone) pair so newer clones compete fairly with old backlogs.
  const seenAccountClone = new Set<string>();
  const deduped = eligibleMinimal.filter((p) => {
    const key = `${p.accountId}:${p.cloneJobId ?? ""}`;
    if (seenAccountClone.has(key)) return false;
    seenAccountClone.add(key);
    return true;
  });

  // Random selection so all clones (old and new) get a fair share of slots
  const selectedIds = deduped
    .sort(() => Math.random() - 0.5)
    .slice(0, 20)
    .map(p => p.id);

  const pending = selectedIds.length === 0 ? [] : await prisma.scheduledPost.findMany({
    where: { id: { in: selectedIds } },
    include: { account: true, video: true },
  }).catch(() => []);

  console.log("[cron] phase1:", pending.length, "pending to process (total eligible:", deduped.length, ")");

  if (pending.length === 0) {
    console.log("[cron] nothing to do");
    return;
  }

  await prisma.scheduledPost.updateMany({
    where: { id: { in: pending.map(p => p.id) } },
    data: { status: "RUNNING" },
  }).catch(e => console.error("[cron] mark RUNNING:", e));

  // Pre-load library videos for all unique clone jobs — includes videoId posts so that
  // posts linked to un-captioned library videos can fall back to the captioned pool.
  const uniqueCloneIds = [...new Set(pending
    .filter(p => p.cloneJobId)
    .map(p => p.cloneJobId!))];
  const cloneLibMap = new Map<string, string[]>(); // cloneJobId → [publicUrl]
  await Promise.all(uniqueCloneIds.map(async (cloneId) => {
    const job = await prisma.cloneJob.findUnique({
      where: { id: cloneId },
      select: { sourceUsername: true, userId: true, intervalMinutes: true },
    }).catch(() => null);
    if (!job?.sourceUsername) { cloneLibMap.set(cloneId, []); return; }
    // Query directly for captioned videos — avoids loading uncaptioned ones into the pool
    let captionedVids = await prisma.libraryVideo.findMany({
      where: {
        userId: job.userId,
        storagePath: { contains: `/${job.sourceUsername}/`, not: { contains: "/covers/" } },
        AND: [{ captionedUrl: { not: null } }, { captionedUrl: { not: "none" } }],
      },
      select: { captionedUrl: true },
    }).catch(() => [] as { captionedUrl: string | null }[]);
    if (captionedVids.length === 0) {
      captionedVids = await prisma.libraryVideo.findMany({
        where: {
          storagePath: { contains: `/${job.sourceUsername}/`, not: { contains: "/covers/" } },
          AND: [{ captionedUrl: { not: null } }, { captionedUrl: { not: "none" } }],
        },
        select: { captionedUrl: true },
      }).catch(() => [] as { captionedUrl: string | null }[]);
    }
    const pool = captionedVids.map(v => v.captionedUrl!);
    cloneLibMap.set(cloneId, pool);
    console.log("[cron] lib cache:", job.sourceUsername, captionedVids.length, "captioned");
  }));

  // Pre-load recently used library URLs per (accountId, cloneJobId) to avoid posting
  // the same video multiple times on the same account.
  // Strategy: query last 60 DONE posts where rawVideoUrl was saved as a Supabase URL.
  const usedUrlsPerAccountClone = new Map<string, Set<string>>();
  const libFirstPairs = [...new Map(
    pending
      .filter(p => p.cloneJobId)
      .map(p => [`${p.accountId}:${p.cloneJobId}`, { accountId: p.accountId, cloneJobId: p.cloneJobId! }])
  ).values()];
  await Promise.all(libFirstPairs.map(async ({ accountId, cloneJobId }) => {
    const key = `${accountId}:${cloneJobId}`;
    const recent = await prisma.scheduledPost.findMany({
      where: { accountId, cloneJobId, status: "DONE", rawVideoUrl: { contains: "supabase.co/storage" } },
      select: { rawVideoUrl: true },
      orderBy: { scheduledAt: "desc" },
      take: 60,
    }).catch(() => [] as { rawVideoUrl: string | null }[]);
    usedUrlsPerAccountClone.set(key, new Set(recent.map(p => p.rawVideoUrl).filter(Boolean) as string[]));
  }));

  // Phase1 runs sequentially so FFmpeg transforms don't compete for /tmp space.
  for (const post of pending) {
    const warmup = warmupMap.get(post.accountId);
    if (warmup?.lastPostedAt) {
      const msSinceLast = now.getTime() - warmup.lastPostedAt.getTime();
      if (msSinceLast < warmup.intervalMinutes * 60 * 1000) {
        await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: "PENDING" } }).catch(() => {});
        continue;
      }
    }

    try {
      const accessToken = decryptAccountPassword(post.account.accessTokenEnc);

      let videoUrl: string;
      if (post.rawVideoUrl) {
        if (post.cloneJobId) {
          // If rawVideoUrl is already on Supabase (library-sourced clone), use it directly.
          // But prefer captionedUrl when available — rawVideoUrl may point to un-captioned VP9.
          if (post.rawVideoUrl.includes("supabase.co/storage")) {
            const captioned = post.video?.captionedUrl;
            if (captioned && captioned !== "none") {
              videoUrl = captioned;
            } else {
              // No captionedUrl on linked video — fall back to captioned pool to avoid VP9/silent posts
              const libUrls = cloneLibMap.get(post.cloneJobId) ?? [];
              videoUrl = libUrls.length > 0
                ? pickFromLibPool(libUrls, post.accountId, post.cloneJobId, usedUrlsPerAccountClone)
                : post.rawVideoUrl;
            }
          } else {
            // Non-Supabase (Apify CDN) URL: use library-first to avoid expired URL failures.
            // Apify CDN URLs expire in ~24h; for older posts the download will always fail.
            const libUrls = cloneLibMap.get(post.cloneJobId) ?? [];
            if (libUrls.length > 0) {
              videoUrl = pickFromLibPool(libUrls, post.accountId, post.cloneJobId, usedUrlsPerAccountClone);
              await prisma.scheduledPost.update({
                where: { id: post.id },
                data: { rawVideoUrl: videoUrl },
              }).catch(() => {});
              console.log("[cron] library-first @", post.account.username, `pool ${libUrls.length}`);
            } else {
              // No library videos for this clone — try download + FFmpeg as last resort.
              try {
                const { publicUrl, uniqueStoragePath } = await downloadTransformAndHostVideo(
                  post.rawVideoUrl,
                  post.userId,
                  post.accountId,
                  post.id,
                );
                videoUrl = publicUrl;
                await prisma.scheduledPost.update({
                  where: { id: post.id },
                  data: { rehostStoragePath: uniqueStoragePath },
                }).catch(() => {});
              } catch (transformErr) {
                const tErrMsg = transformErr instanceof Error ? transformErr.message : String(transformErr);
                console.warn("[cron] transform failed (no library):", tErrMsg, "— using raw URL");
                videoUrl = post.rawVideoUrl;
              }
            }
          }
        } else {
          // Non-cloned rawVideoUrl: existing behavior (download + strip + LibraryVideo cache)
          const urlHash = createHash("md5").update(post.rawVideoUrl).digest("hex");
          const storagePath = `cloned/${post.userId}/${urlHash}.mp4`;
          const libVideo = await prisma.libraryVideo.findFirst({ where: { userId: post.userId, storagePath } }).catch(() => null);

          if (libVideo) {
            await prisma.scheduledPost.update({ where: { id: post.id }, data: { videoId: libVideo.id, rawVideoUrl: null } }).catch(() => {});
            videoUrl = libVideo.publicUrl;
          } else {
            try {
              const hosted = await downloadAndStripVideo(post.rawVideoUrl, post.userId);
              videoUrl = hosted.publicUrl;
              await prisma.libraryVideo.create({
                data: {
                  userId: post.userId,
                  filename: hosted.storagePath.split("/").pop()!,
                  originalName: post.caption?.slice(0, 60) || "Reel clonado",
                  storagePath: hosted.storagePath,
                  publicUrl: hosted.publicUrl,
                  sizeBytes: 0,
                  mimeType: "video/mp4",
                },
              }).catch(() => {});
              await prisma.scheduledPost.update({ where: { id: post.id }, data: { rawVideoUrl: null } }).catch(() => {});
            } catch (dlErr) {
              console.warn("[cron] download failed, using raw URL directly:", dlErr instanceof Error ? dlErr.message : dlErr);
              videoUrl = post.rawVideoUrl;
            }
          }
        }
      } else if (post.video?.publicUrl) {
        const hasCaption = post.video.captionedUrl && post.video.captionedUrl !== "none";
        if (hasCaption) {
          videoUrl = post.video.captionedUrl!;
        } else if (post.cloneJobId) {
          // Linked video has no caption — pick from captioned pool to avoid silent/VP9 videos
          const libUrls = cloneLibMap.get(post.cloneJobId) ?? [];
          videoUrl = libUrls.length > 0
            ? pickFromLibPool(libUrls, post.accountId, post.cloneJobId, usedUrlsPerAccountClone)
            : post.video.publicUrl;
        } else {
          videoUrl = post.video.publicUrl;
        }
      } else {
        throw new Error("Nenhuma URL de vídeo disponível para este post.");
      }

      console.log("[cron] creating container @", post.account.username);
      const result = await createReelContainer({
        igUserId: post.account.instagramUserId,
        accessToken,
        videoUrl,
        caption: post.caption,
        coverUrl: post.video?.coverUrl ?? null,
        proxyUrl: post.account.proxyUrl ?? null,
      });

      if (!result.ok) {
        console.error(`[cron] container error @${post.account.username}: ${result.error}`);
        await failPost(post, result.error, now);
        continue;
      }

      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { containerCreationId: result.containerId, containerCreatedAt: now },
      });
      console.log("[cron] container created @", post.account.username);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      console.error(`[cron] phase1 error @${post.account.username}: ${msg}`);
      await failPost(post, msg, now);
    }
  }

  console.log("[cron] done");
}

// Redistributes all FAILED posts from a suspended account to other active accounts in the same clone(s).
async function redistributeFailedToClone(failedAccountId: string, now: Date): Promise<void> {
  const failed = await prisma.scheduledPost.findMany({
    where: { accountId: failedAccountId, status: "FAILED", cloneJobId: { not: null } },
    select: { id: true, cloneJobId: true },
  }).catch(() => [] as { id: string; cloneJobId: string | null }[]);

  if (failed.length === 0) return;

  // Group by clone
  const byClone = new Map<string, string[]>();
  for (const p of failed) {
    if (!p.cloneJobId) continue;
    if (!byClone.has(p.cloneJobId)) byClone.set(p.cloneJobId, []);
    byClone.get(p.cloneJobId)!.push(p.id);
  }

  for (const [cloneJobId, postIds] of byClone) {
    const eligibleIds = (await prisma.scheduledPost.findMany({
      where: { cloneJobId, accountId: { not: failedAccountId } },
      select: { accountId: true },
      distinct: ["accountId"],
    }).catch(() => [])).map(a => a.accountId);

    if (eligibleIds.length === 0) continue;

    const active = await prisma.instagramOAuthAccount.findMany({
      where: { id: { in: eligibleIds }, accountStatus: "ACTIVE" },
      select: { id: true },
    }).catch(() => []);

    if (active.length === 0) continue;

    // Round-robin: group post IDs by target account
    const groups = new Map<string, string[]>();
    postIds.forEach((id, i) => {
      const tid = active[i % active.length].id;
      if (!groups.has(tid)) groups.set(tid, []);
      groups.get(tid)!.push(id);
    });

    const results = await Promise.all(
      Array.from(groups.entries()).map(([targetId, ids]) =>
        prisma.scheduledPost.updateMany({
          where: { id: { in: ids } },
          data: { accountId: targetId, status: "PENDING", retryCount: 0, errorMsg: null, scheduledAt: now, containerCreationId: null, containerCreatedAt: null },
        }).catch(() => ({ count: 0 }))
      )
    );

    const n = results.reduce((s, r) => s + r.count, 0);
    console.log(`[cron] redistribuiu ${n}/${postIds.length} posts para ${active.length} contas no clone ${cloneJobId}`);

    // Apply auto-captions to redistributed posts that have no caption
    const noCaption = await prisma.scheduledPost.findMany({
      where: { id: { in: postIds }, status: "PENDING", caption: "" },
      select: { id: true },
    }).catch(() => []);
    if (noCaption.length > 0) {
      const pool = shufflePool("mundo", Math.abs(cloneJobId.split("").reduce((s, c) => s + c.charCodeAt(0), 0)));
      const captionGroups = new Map<number, string[]>();
      noCaption.forEach(({ id }, i) => {
        const idx = i % pool.length;
        if (!captionGroups.has(idx)) captionGroups.set(idx, []);
        captionGroups.get(idx)!.push(id);
      });
      await Promise.allSettled([...captionGroups.entries()].map(([idx, ids]) =>
        prisma.scheduledPost.updateMany({ where: { id: { in: ids } }, data: { caption: pool[idx] } })
      ));
      console.log(`[cron] aplicou legendas em ${noCaption.length} posts redistribuídos sem caption`);
    }
  }
}

async function failPost(
  post: { id: string; accountId: string; userId: string; retryCount: number; account: { username: string; instagramUserId: string } },
  msg: string,
  now: Date,
) {
  const msgLower = msg.toLowerCase();
  const newRetryCount = post.retryCount + 1;

  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: {
      status: "FAILED",
      errorMsg: msg,
      retryCount: newRetryCount,
      containerCreationId: null,
      containerCreatedAt: null,
    },
  });

  const accountName = post.account.username ?? "conta";

  const isTokenInvalid =
    msgLower.includes("error validating access token") ||
    msgLower.includes("invalid oauth access token") ||
    msgLower.includes("access token has expired") ||
    msgLower.includes("the user must be a confirmed user") ||
    msgLower.includes("sessions for the user are not allowed") ||
    (msgLower.includes("oauth") && msgLower.includes("token") && msgLower.includes("invalid"));

  if (isTokenInvalid) {
    await prisma.instagramOAuthAccount.update({
      where: { id: post.accountId },
      data: { accountStatus: "SUSPENDED", lastError: msg },
    });
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { retryCount: 6, errorMsg: "Token inválido — reconecte a conta." } });
    await prisma.scheduledPost.updateMany({
      where: { accountId: post.accountId, status: "PENDING" },
      data: { status: "FAILED", retryCount: 6, errorMsg: "Token inválido — reconecte a conta." },
    });
    await redistributeFailedToClone(post.accountId, now).catch(() => {});
    await sendPushToUser(post.userId, {
      title: "⚠️ Reconecte a conta",
      body: `@${accountName}: token expirado — posts redistribuídos automaticamente para as outras contas. Reconecte em Contas.`,
      url: "/accounts",
    }).catch(() => {});
    return;
  }

  // Account doesn't support posting via Graph API (personal account or missing publish permission)
  const isUnsupportedPost =
    msgLower.includes("unsupported request - method type: post") ||
    msgLower.includes("unsupported request") ||
    msgLower.includes("method type: post");

  if (isUnsupportedPost) {
    await prisma.instagramOAuthAccount.update({
      where: { id: post.accountId },
      data: { accountStatus: "SUSPENDED", lastError: "Conta não suporta publicação via API (conta pessoal ou sem permissão). Reconecte como conta Business/Creator." },
    });
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { retryCount: 6, errorMsg: "Conta não suporta publicação via API." } });
    await prisma.scheduledPost.updateMany({
      where: { accountId: post.accountId, status: "PENDING" },
      data: { status: "FAILED", retryCount: 6, errorMsg: "Conta não suporta publicação via API." },
    });
    await redistributeFailedToClone(post.accountId, now).catch(() => {});
    await sendPushToUser(post.userId, {
      title: "⚠️ Conta sem permissão de postagem",
      body: `@${accountName}: conta pessoal sem permissão — posts redistribuídos. Reconecte como Business/Creator.`,
      url: "/accounts",
    }).catch(() => {});
    return;
  }

  const isAppDeactivated = msgLower.includes("api access deactivated") || msgLower.includes("app not active");

  if (isAppDeactivated) {
    // The Meta App tied to this account had its API access revoked by Meta — not fixable by retrying.
    await prisma.instagramOAuthAccount.update({
      where: { id: post.accountId },
      data: { accountStatus: "SUSPENDED", lastError: "App Meta com acesso à API desativado pela Meta." },
    });
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { retryCount: 6, errorMsg: "App Meta desativado pela Meta — reatribua a conta a outro app." },
    });
    await prisma.scheduledPost.updateMany({
      where: { accountId: post.accountId, status: "PENDING" },
      data: { status: "FAILED", retryCount: 6, errorMsg: "App Meta desativado pela Meta — reatribua a conta a outro app." },
    });
    await sendPushToUser(post.userId, {
      title: "⚠️ App Meta desativado",
      body: `@${accountName}: o app Meta vinculado teve a API desativada. Reatribua a conta a outro app em Contas.`,
      url: "/accounts",
    });
    return;
  }

  const isSuspended =
    msgLower.includes("suspended") ||
    msgLower.includes("account has been disabled") ||
    msgLower.includes("account disabled") ||
    msgLower.includes("user has been disabled") ||
    (msgLower.includes("disabled") && msgLower.includes("account"));

  // Permanent API restriction — Instagram blocked this account from API publishing permanently.
  // Must be SUSPENDED (not QUARANTINE) so retry-failed/clone-fix don't re-enable it in a loop.
  const isPermanentRestricted =
    !isSuspended && msgLower.includes("user access is restricted");

  // Temporary restriction — rate limit, checkpoint, etc. — may recover after 24h cooldown.
  const isTemporaryRestricted =
    !isSuspended && !isPermanentRestricted && (
      msgLower.includes("action blocked") ||
      msgLower.includes("checkpoint") ||
      msgLower.includes("restricted") ||
      msgLower.includes("posting is blocked") ||
      msgLower.includes("please try again later")
    );

  const isRateLimit = msgLower.includes("too many actions") || msgLower.includes("rate limit");

  if (isSuspended || isPermanentRestricted) {
    const suspendMsg = isSuspended ? "Conta suspensa pelo Instagram." : "Conta com acesso à API restrito pelo Instagram — reconecte ou troque de conta.";
    await prisma.instagramOAuthAccount.update({ where: { id: post.accountId }, data: { accountStatus: "SUSPENDED", lastError: msg } });
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { retryCount: 6, errorMsg: suspendMsg } });
    await prisma.scheduledPost.updateMany({
      where: { accountId: post.accountId, status: "PENDING" },
      data: { status: "FAILED", retryCount: 6, errorMsg: suspendMsg },
    });
    await redistributeFailedToClone(post.accountId, now).catch(() => {});
    await sendPushToUser(post.userId, {
      title: isSuspended ? "⚠️ Conta suspensa" : "⚠️ Conta restrita pela API",
      body: isSuspended
        ? `@${accountName} foi suspensa pelo Instagram — posts redistribuídos automaticamente.`
        : `@${accountName} está com acesso à API restrito — posts redistribuídos. Reconecte a conta.`,
      url: "/contas-off",
    }).catch(() => {});
    return;
  }

  if (isTemporaryRestricted) {
    const quarantinedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await prisma.instagramOAuthAccount.update({
      where: { id: post.accountId },
      data: { accountStatus: "QUARANTINE", quarantinedUntil, lastError: msg },
    });
    await prisma.$executeRaw`
      UPDATE "ScheduledPost"
      SET "scheduledAt" = ${quarantinedUntil}::timestamp + (("scheduledAt" - NOW()) * 0.1)
      WHERE "accountId" = ${post.accountId} AND "status" = 'PENDING'
    `;
    await sendPushToUser(post.userId, {
      title: "🔒 Conta em quarentena",
      body: `@${accountName} está temporariamente restrita. Pausada por 24h e retomará automaticamente.`,
      url: "/accounts",
    }).catch(() => {});
    return;
  }

  const exhaustedRetries = newRetryCount >= 6;
  const round1Done = newRetryCount === 3;

  if (isRateLimit) {
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const recentCareMode = await prisma.scheduledPost.findFirst({
      where: { accountId: post.accountId, status: "FAILED", errorMsg: { contains: "too many actions" }, updatedAt: { gte: threeHoursAgo }, id: { not: post.id } },
    });
    if (!recentCareMode) {
      await prisma.$executeRaw`UPDATE "ScheduledPost" SET "scheduledAt" = "scheduledAt" + INTERVAL '4 hours' WHERE "accountId" = ${post.accountId} AND "status" = 'PENDING'`;
      await sendPushToUser(post.userId, {
        title: "Conta em modo de cuidado",
        body: `@${accountName} foi pausada por 4h (limite do Instagram). Posts reagendados automaticamente.`,
        url: "/schedule",
      });
    }
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { scheduledAt: new Date(now.getTime() + 4 * 60 * 60 * 1000) },
    });
  } else if (exhaustedRetries) {
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { scheduledAt: new Date(now.getTime() + 4 * 60 * 60 * 1000) },
    });
    await sendPushToUser(post.userId, {
      title: "Post falhou definitivamente",
      body: `@${accountName}: 6 tentativas sem sucesso. Verifique a conta e reagende. Erro: ${msg.slice(0, 70)}`,
      url: "/schedule",
    });
  } else if (round1Done) {
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { scheduledAt: new Date(now.getTime() + 4 * 60 * 60 * 1000) },
    });
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const validCron = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;

  let authorized = validCron;
  if (!authorized) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
      authorized = user?.email === adminEmail;
    } catch { /* ignore */ }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  waitUntil(runCron());
  return NextResponse.json({ ok: true, message: "Processing started" });
}
