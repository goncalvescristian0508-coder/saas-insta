import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { publishReelFromVideoUrl } from "@/lib/instagramGraphPublish";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "crypto";
import { sendPushToUser } from "@/lib/sendPush";

function storageAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function rehostVideo(rawUrl: string): Promise<{ publicUrl: string; storagePath: string }> {
  const res = await fetch(rawUrl, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`Falha ao baixar vídeo clonado: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const storagePath = `_cloned/${randomUUID()}.mp4`;
  const admin = storageAdmin();
  const { error } = await admin.storage.from("library-videos").upload(storagePath, buffer, {
    contentType: "video/mp4",
    upsert: false,
  });
  if (error) throw new Error(`Falha ao salvar vídeo: ${error.message}`);
  const { data: pub } = admin.storage.from("library-videos").getPublicUrl(storagePath);
  return { publicUrl: pub.publicUrl, storagePath };
}

export const runtime = "nodejs";
export const maxDuration = 300;

async function runCron() {
  const now = new Date();

  // Reset posts stuck in RUNNING (cron crashed mid-execution) after 10 minutes
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  await prisma.scheduledPost.updateMany({
    where: { status: "RUNNING", updatedAt: { lte: tenMinutesAgo } },
    data: { status: "PENDING" },
  });

  // Retry failed posts up to 3 times (1 min interval). Rate-limit posts are protected — their scheduledAt is 4h ahead.
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  await prisma.scheduledPost.updateMany({
    where: {
      status: "FAILED",
      scheduledAt: { lte: now },
      retryCount: { lt: 3 },
      updatedAt: { lte: oneMinuteAgo },
    },
    data: { status: "PENDING", errorMsg: null },
  });

  // Load active warmup configs keyed by accountId
  const warmups = await prisma.accountWarmup.findMany({ where: { isActive: true } });
  const warmupMap = new Map(warmups.map((w) => [w.accountId, w]));

  // Find accounts already being processed in a concurrent cron run
  const runningPosts = await prisma.scheduledPost.findMany({
    where: { status: "RUNNING" },
    select: { accountId: true },
  });
  const busyAccountIds = new Set(runningPosts.map((p) => p.accountId));

  // Release quarantine on accounts whose quarantine period has ended
  await prisma.instagramOAuthAccount.updateMany({
    where: { accountStatus: "QUARANTINE", quarantinedUntil: { lte: now } },
    data: { accountStatus: "ACTIVE", quarantinedUntil: null },
  });

  // Process up to 30 posts per cron run, 1 per account, skip suspended/quarantined/busy
  const allPending = await prisma.scheduledPost.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: now },
      accountId: { notIn: [...busyAccountIds] },
      account: { accountStatus: "ACTIVE" },
    },
    include: { account: true, video: true },
    orderBy: { scheduledAt: "asc" },
    take: 150,
  });

  const seenAccounts = new Set<string>();
  const pending = allPending.filter((post) => {
    if (seenAccounts.has(post.accountId)) return false;
    seenAccounts.add(post.accountId);
    return true;
  }).slice(0, 30);

  const results: { id: string; status: string; error?: string }[] = [];

  // Process posts in parallel batches of 5
  async function processPost(post: typeof pending[number]) {
    // Warmup throttle
    const warmup = warmupMap.get(post.accountId);
    if (warmup?.lastPostedAt) {
      const msSinceLast = now.getTime() - warmup.lastPostedAt.getTime();
      const msRequired = warmup.intervalMinutes * 60 * 1000;
      if (msSinceLast < msRequired) {
        return { id: post.id, status: "skipped_warmup" };
      }
    }

    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { status: "RUNNING" },
    });

    let rehostPath: string | null = null;
    try {
      const accessToken = decryptAccountPassword(post.account.accessTokenEnc);

      let videoUrl: string;
      if (post.rawVideoUrl) {
        // 1. Check if background download already saved to library (by URL hash)
        const urlHash = createHash("md5").update(post.rawVideoUrl).digest("hex");
        const storagePath = `cloned/${post.userId}/${urlHash}.mp4`;
        const libVideo = await prisma.libraryVideo.findFirst({
          where: { userId: post.userId, storagePath },
        });
        if (libVideo) {
          // Relink post to library video and clear the expired CDN reference
          await prisma.scheduledPost.update({
            where: { id: post.id },
            data: { videoId: libVideo.id, rawVideoUrl: null },
          });
          videoUrl = libVideo.publicUrl;
        } else {
          // 2. Try to re-host from CDN (may fail if URL expired)
          try {
            const rehosted = await rehostVideo(post.rawVideoUrl);
            videoUrl = rehosted.publicUrl;
            rehostPath = rehosted.storagePath;
          } catch {
            if (post.video?.publicUrl) {
              videoUrl = post.video.publicUrl;
            } else {
              // CDN URL expired with no fallback — fail permanently to stop retry loop
              await prisma.scheduledPost.update({
                where: { id: post.id },
                data: {
                  status: "FAILED",
                  errorMsg: "Vídeo fonte expirado. Re-agende com um vídeo da biblioteca.",
                  retryCount: 3,
                },
              });
              return { id: post.id, status: "failed", error: "Vídeo fonte expirado" };
            }
          }
        }
      } else if (post.video?.publicUrl) {
        videoUrl = post.video.publicUrl;
      } else {
        throw new Error("Nenhuma URL de vídeo disponível para este post.");
      }

      const result = await publishReelFromVideoUrl({
        accessToken,
        igUserId: post.account.instagramUserId,
        videoUrl,
        caption: post.caption,
      });

      if (rehostPath) {
        await storageAdmin().storage.from("library-videos").remove([rehostPath]);
        rehostPath = null;
      }

      if (!result.ok) throw new Error(result.error);

      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: "DONE", postedAt: new Date(), errorMsg: null },
      });

      // Update warmup progress if account is in warmup mode
      if (warmup) {
        const newCount = warmup.completedPosts + 1;
        const finished = newCount >= warmup.targetPosts;
        await prisma.accountWarmup.update({
          where: { id: warmup.id },
          data: {
            completedPosts: newCount,
            lastPostedAt: now,
            isActive: !finished,
          },
        });
        warmup.completedPosts = newCount;
        warmup.lastPostedAt = now;
      }

      // After success, check if account was in care mode and has 2+ successes since last rate limit
      const lastRateLimit = await prisma.scheduledPost.findFirst({
        where: { accountId: post.accountId, status: "FAILED", errorMsg: { contains: "too many actions" } },
        orderBy: { updatedAt: "desc" },
      });
      if (lastRateLimit) {
        const successesSince = await prisma.scheduledPost.count({
          where: { accountId: post.accountId, status: "DONE", postedAt: { gte: lastRateLimit.updatedAt } },
        });
        if (successesSince >= 2) {
          // Restore normal timing: pull pending posts back 4h
          await prisma.$executeRaw`
            UPDATE "ScheduledPost"
            SET "scheduledAt" = "scheduledAt" - INTERVAL '4 hours'
            WHERE "accountId" = ${post.accountId}
              AND "status" = 'PENDING'
              AND "scheduledAt" > NOW()
          `;
          await sendPushToUser(post.userId, {
            title: "Conta recuperada",
            body: `@${post.account.username} voltou ao ritmo normal após 2 posts bem-sucedidos.`,
            url: "/schedule",
          });
        }
      }

      return { id: post.id, status: "done" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      const msgLower = msg.toLowerCase();
      const newRetryCount = post.retryCount + 1;
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: "FAILED", errorMsg: msg, retryCount: newRetryCount },
      });

      const accountName = post.account.username ?? "conta";
      const isRateLimit = msgLower.includes("too many actions") || msgLower.includes("rate limit");

      // Detect suspended account
      const isSuspended =
        msgLower.includes("suspended") ||
        msgLower.includes("account has been disabled") ||
        msgLower.includes("account disabled") ||
        msgLower.includes("user has been disabled") ||
        (msgLower.includes("disabled") && msgLower.includes("account"));

      // Detect posting restriction (quarantine)
      const isRestricted =
        !isSuspended && (
          msgLower.includes("user access is restricted") ||
          msgLower.includes("action blocked") ||
          msgLower.includes("checkpoint") ||
          msgLower.includes("restricted") ||
          msgLower.includes("posting is blocked") ||
          msgLower.includes("please try again later")
        );

      if (isSuspended) {
        await prisma.instagramOAuthAccount.update({
          where: { id: post.accountId },
          data: { accountStatus: "SUSPENDED", lastError: msg },
        });
        // Cancel all pending posts for this account
        await prisma.scheduledPost.updateMany({
          where: { accountId: post.accountId, status: "PENDING" },
          data: { status: "FAILED", errorMsg: "Conta suspensa pelo Instagram." },
        });
        await sendPushToUser(post.userId, {
          title: "⚠️ Conta suspensa",
          body: `@${accountName} foi suspensa pelo Instagram e movida para Contas OFF.`,
          url: "/contas-off",
        });
        return { id: post.id, status: "suspended" };
      }

      if (isRestricted) {
        const quarantinedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h
        await prisma.instagramOAuthAccount.update({
          where: { id: post.accountId },
          data: { accountStatus: "QUARANTINE", quarantinedUntil, lastError: msg },
        });
        // Reschedule pending posts to after quarantine ends
        await prisma.$executeRaw`
          UPDATE "ScheduledPost"
          SET "scheduledAt" = ${quarantinedUntil}::timestamp + (("scheduledAt" - NOW()) * 0.1)
          WHERE "accountId" = ${post.accountId}
            AND "status" = 'PENDING'
        `;
        await sendPushToUser(post.userId, {
          title: "🔒 Conta em quarentena",
          body: `@${accountName} está restrita de postar. Pausada por 24h e retomará automaticamente.`,
          url: "/accounts",
        });
        return { id: post.id, status: "quarantine" };
      }

      const exhaustedRetries = newRetryCount >= 3;

      if (isRateLimit) {
        // Check if care mode was already activated recently (last 3h) to avoid repeated triggers
        const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        const recentCareMode = await prisma.scheduledPost.findFirst({
          where: {
            accountId: post.accountId,
            status: "FAILED",
            errorMsg: { contains: "too many actions" },
            updatedAt: { gte: threeHoursAgo },
            id: { not: post.id },
          },
        });

        if (!recentCareMode) {
          // First activation: push all pending posts +4h
          await prisma.$executeRaw`
            UPDATE "ScheduledPost"
            SET "scheduledAt" = "scheduledAt" + INTERVAL '4 hours'
            WHERE "accountId" = ${post.accountId}
              AND "status" = 'PENDING'
          `;
          await sendPushToUser(post.userId, {
            title: "Conta em modo de cuidado",
            body: `@${accountName} foi pausada por 4h (limite do Instagram). Posts reagendados automaticamente.`,
            url: "/schedule",
          });
        }

        // Push the failed post's scheduledAt +4h so it's not retried until then
        await prisma.scheduledPost.update({
          where: { id: post.id },
          data: { scheduledAt: new Date(now.getTime() + 4 * 60 * 60 * 1000) },
        });
      } else if (exhaustedRetries) {
        // 3 consecutive failures — enter safety mode: delay post 4h and notify
        await prisma.scheduledPost.update({
          where: { id: post.id },
          data: { scheduledAt: new Date(now.getTime() + 4 * 60 * 60 * 1000) },
        });
        await sendPushToUser(post.userId, {
          title: "Modo segurança ativado",
          body: `@${accountName}: 3 tentativas falharam. Post adiado por 4h. Erro: ${msg.slice(0, 80)}`,
          url: "/schedule",
        });
      }
      // else: still has retries left — silent retry in 1 min, no notification spam

      return { id: post.id, status: "failed", error: msg };
    } finally {
      if (rehostPath) {
        await storageAdmin().storage.from("library-videos").remove([rehostPath]).catch(() => null);
      }
    }
  }

  // Run in parallel batches of 5
  const BATCH = 5;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map((post) => processPost(post)));
    results.push(...batchResults);
  }

}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Respond immediately so cron-job.org doesn't timeout (30s limit)
  // Processing continues in background via waitUntil
  waitUntil(runCron());
  return NextResponse.json({ ok: true, message: "Processing started" });
}
