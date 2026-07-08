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
import { randomUUID, createHash } from "crypto";
import { sendPushToUser } from "@/lib/sendPush";
import { stripMp4Metadata } from "@/lib/videoUtils";

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

export const runtime = "nodejs";
export const maxDuration = 300;

async function ensureSchema() {
  const stmts = [
    `ALTER TABLE "InstagramOAuthAccount" ADD COLUMN IF NOT EXISTS "appKey" TEXT NOT NULL DEFAULT '1'`,
    `ALTER TABLE "InstagramOAuthAccount" ADD COLUMN IF NOT EXISTS "lastError" TEXT`,
    `ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "containerCreationId" TEXT`,
    `ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "containerCreatedAt" TIMESTAMP(3)`,
    `ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "rehostStoragePath" TEXT`,
    `CREATE TABLE IF NOT EXISTS "AccountWarmup" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "accountId" TEXT NOT NULL,
      "targetPosts" INTEGER NOT NULL DEFAULT 30,
      "completedPosts" INTEGER NOT NULL DEFAULT 0,
      "intervalMinutes" INTEGER NOT NULL DEFAULT 120,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "lastPostedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AccountWarmup_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "AccountWarmup_accountId_key" ON "AccountWarmup"("accountId")`,
    `CREATE INDEX IF NOT EXISTS "AccountWarmup_userId_idx" ON "AccountWarmup"("userId")`,
    `CREATE TABLE IF NOT EXISTS "SchedulePreset" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "times" TEXT[] NOT NULL DEFAULT '{}',
      "caption" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SchedulePreset_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "SchedulePreset_userId_idx" ON "SchedulePreset"("userId")`,
  ];
  for (const sql of stmts) {
    await prisma.$executeRawUnsafe(sql).catch(() => {});
  }
}

async function runCron() {
  const now = new Date();

  // Guard: skip if another phase-1 invocation is actively running (started < 50s ago)
  const activePhase1 = await prisma.scheduledPost.count({
    where: { status: "RUNNING", containerCreationId: null, updatedAt: { gte: new Date(now.getTime() - 50_000) } },
  }).catch(() => 0);
  if (activePhase1 > 0) {
    console.log("[cron] skip — concurrent invocation active (phase1:", activePhase1, ")");
    return;
  }

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

  const phase1Running = await prisma.scheduledPost.findMany({
    where: { status: "RUNNING", containerCreationId: null },
    select: { accountId: true },
  }).catch(() => []);
  const busyPhase1 = new Set(phase1Running.map((p) => p.accountId));

  // ── PHASE 2: Publish containers (parallel, 15 at a time) ─────────────────────
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const runningWithContainer = await prisma.scheduledPost.findMany({
    where: { status: "RUNNING", containerCreationId: { not: null } },
    include: { account: true, video: true },
    orderBy: { containerCreatedAt: "asc" },
    take: 15,
  }).catch(() => []);

  console.log("[cron] phase2:", runningWithContainer.length, "containers to check");

  await Promise.all(runningWithContainer.map(async (post) => {
    try {
      const accessToken = decryptAccountPassword(post.account.accessTokenEnc);
      const containerStatus = await checkContainerStatus(post.containerCreationId!, accessToken);

      if (containerStatus === "FINISHED") {
        const pubResult = await publishMediaContainer(post.account.instagramUserId, accessToken, post.containerCreationId!);

        if (pubResult.ok) {
          await prisma.scheduledPost.update({
            where: { id: post.id },
            data: { status: "DONE", postedAt: now, errorMsg: null, containerCreationId: null, containerCreatedAt: null },
          });

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
  // Two-phase: load minimal data for up to 2000 eligible posts, dedup by account,
  // then random-sample 10 so all clones/accounts get fair processing (not just oldest backlog).
  const eligibleMinimal = await prisma.scheduledPost.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: now },
      accountId: { notIn: [...busyPhase1] },
      account: { accountStatus: "ACTIVE" },
    },
    select: { id: true, accountId: true },
    orderBy: { scheduledAt: "asc" },
    take: 2000,
  }).catch(() => [] as { id: string; accountId: string }[]);

  const seenAccounts = new Set<string>();
  const deduped = eligibleMinimal.filter((p) => {
    if (seenAccounts.has(p.accountId)) return false;
    seenAccounts.add(p.accountId);
    return true;
  });

  // Random selection so all clones (old and new) get a fair share of slots
  const selectedIds = deduped
    .sort(() => Math.random() - 0.5)
    .slice(0, 10)
    .map(p => p.id);

  const pending = selectedIds.length === 0 ? [] : await prisma.scheduledPost.findMany({
    where: { id: { in: selectedIds } },
    include: { account: true, video: true },
  }).catch(() => []);

  console.log("[cron] phase1:", pending.length, "pending to process (total eligible:", allPending.length, ")");

  if (pending.length === 0) {
    console.log("[cron] nothing to do");
    return;
  }

  await prisma.scheduledPost.updateMany({
    where: { id: { in: pending.map(p => p.id) } },
    data: { status: "RUNNING" },
  }).catch(e => console.error("[cron] mark RUNNING:", e));

  await Promise.all(pending.map(async (post) => {
    const warmup = warmupMap.get(post.accountId);
    if (warmup?.lastPostedAt) {
      const msSinceLast = now.getTime() - warmup.lastPostedAt.getTime();
      if (msSinceLast < warmup.intervalMinutes * 60 * 1000) {
        await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: "PENDING" } }).catch(() => {});
        return;
      }
    }

    try {
      const accessToken = decryptAccountPassword(post.account.accessTokenEnc);

      let videoUrl: string;
      if (post.rawVideoUrl) {
        const urlHash = createHash("md5").update(post.rawVideoUrl).digest("hex");
        const storagePath = `cloned/${post.userId}/${urlHash}.mp4`;
        const libVideo = await prisma.libraryVideo.findFirst({ where: { userId: post.userId, storagePath } }).catch(() => null);

        if (libVideo) {
          await prisma.scheduledPost.update({ where: { id: post.id }, data: { videoId: libVideo.id, rawVideoUrl: null } }).catch(() => {});
          videoUrl = libVideo.publicUrl;
        } else {
          // Try to download + strip metadata; fall back to raw URL if download fails
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
            // Download failed (URL expired or unavailable) — pass rawVideoUrl directly to Instagram
            console.warn("[cron] download failed, using raw URL directly:", dlErr instanceof Error ? dlErr.message : dlErr);
            videoUrl = post.rawVideoUrl;
          }
        }
      } else if (post.video?.publicUrl) {
        videoUrl = post.video.publicUrl;
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
      });

      if (!result.ok) {
        console.error(`[cron] container error @${post.account.username}: ${result.error}`);
        await failPost(post, result.error, now);
        return;
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
  }));

  console.log("[cron] done");
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
    await sendPushToUser(post.userId, {
      title: "⚠️ Reconecte a conta",
      body: `@${accountName}: token expirado ou revogado pelo Instagram. Acesse Contas e reconecte.`,
      url: "/accounts",
    });
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
    await sendPushToUser(post.userId, {
      title: "⚠️ Conta sem permissão de postagem",
      body: `@${accountName}: não é possível publicar (conta pessoal ou sem permissão). Reconecte como Business/Creator.`,
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

  const isRestricted =
    !isSuspended && (
      msgLower.includes("user access is restricted") ||
      msgLower.includes("action blocked") ||
      msgLower.includes("checkpoint") ||
      msgLower.includes("restricted") ||
      msgLower.includes("posting is blocked") ||
      msgLower.includes("please try again later")
    );

  const isRateLimit = msgLower.includes("too many actions") || msgLower.includes("rate limit");

  if (isSuspended) {
    await prisma.instagramOAuthAccount.update({ where: { id: post.accountId }, data: { accountStatus: "SUSPENDED", lastError: msg } });
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { retryCount: 6 } });
    await prisma.scheduledPost.updateMany({
      where: { accountId: post.accountId, status: "PENDING" },
      data: { status: "FAILED", retryCount: 6, errorMsg: "Conta suspensa pelo Instagram." },
    });
    await sendPushToUser(post.userId, {
      title: "⚠️ Conta suspensa",
      body: `@${accountName} foi suspensa pelo Instagram e movida para Contas OFF.`,
      url: "/contas-off",
    });
    return;
  }

  if (isRestricted) {
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
      body: `@${accountName} está restrita de postar. Pausada por 24h e retomará automaticamente.`,
      url: "/accounts",
    });
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
