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
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import ffmpegStatic from "ffmpeg-static";
import Ffmpeg from "fluent-ffmpeg";

function storageAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function cleanVideoBuffer(input: Buffer): Promise<Buffer | null> {
  const id = randomUUID();
  const inputPath = join("/tmp", `${id}_in.mp4`);
  const outputPath = join("/tmp", `${id}_out.mp4`);
  try {
    await writeFile(inputPath, input);
    await new Promise<void>((resolve, reject) => {
      Ffmpeg(inputPath)
        .setFfmpegPath(ffmpegStatic!)
        .outputOptions([
          "-map_metadata -1", "-map_chapters -1",
          "-c:v libx264", "-crf 23", "-preset fast",
          "-vf scale=trunc(iw/2)*2:trunc(ih/2)*2",
          "-c:a aac", "-b:a 128k", "-ar 44100",
          "-movflags +faststart",
          "-metadata creation_time=", "-metadata encoder=",
          "-metadata:s:v handler_name=", "-metadata:s:v vendor_id=",
          "-metadata:s:a handler_name=",
        ])
        .save(outputPath)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err));
    });
    return await readFile(outputPath);
  } catch {
    return null;
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

async function rehostVideo(rawUrl: string): Promise<{ publicUrl: string; storagePath: string }> {
  const res = await fetch(rawUrl, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`Falha ao baixar vídeo clonado: HTTP ${res.status}`);
  const raw = Buffer.from(await res.arrayBuffer());
  const buffer = (await cleanVideoBuffer(raw)) ?? raw;
  const storagePath = `_cloned/${randomUUID()}.mp4`;
  const admin = storageAdmin();
  const { error } = await admin.storage.from("library-videos").upload(storagePath, buffer, {
    contentType: "video/mp4", upsert: false,
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
  await ensureSchema();
  const now = new Date();

  // Reset Phase-1 posts stuck in RUNNING (no container yet) after 5 min
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  await prisma.scheduledPost.updateMany({
    where: { status: "RUNNING", containerCreationId: null, updatedAt: { lte: fiveMinutesAgo } },
    data: { status: "PENDING" },
  });

  // Retry failed posts (up to 6 total retries, at least 1 min between retries)
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  await prisma.scheduledPost.updateMany({
    where: {
      status: "FAILED",
      scheduledAt: { lte: now },
      retryCount: { lt: 6 },
      updatedAt: { lte: oneMinuteAgo },
    },
    data: { status: "PENDING", errorMsg: null, containerCreationId: null, containerCreatedAt: null },
  });

  // Load warmup configs (table may not exist yet — fail silently)
  const warmups = await prisma.accountWarmup.findMany({ where: { isActive: true } }).catch(() => []);
  const warmupMap = new Map(warmups.map((w) => [w.accountId, w]));

  // Release quarantine
  await prisma.instagramOAuthAccount.updateMany({
    where: { accountStatus: "QUARANTINE", quarantinedUntil: { lte: now } },
    data: { accountStatus: "ACTIVE", quarantinedUntil: null },
  });

  // Accounts busy with Phase-1 (creating container right now)
  const phase1Running = await prisma.scheduledPost.findMany({
    where: { status: "RUNNING", containerCreationId: null },
    select: { accountId: true },
  });
  const busyPhase1 = new Set(phase1Running.map((p) => p.accountId));

  // ── PHASE 2: Publish containers that finished processing ─────────────────────
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const runningWithContainer = await prisma.scheduledPost.findMany({
    where: { status: "RUNNING", containerCreationId: { not: null } },
    include: { account: true, video: true },
    orderBy: { containerCreatedAt: "asc" },
    take: 30,
  });

  for (const post of runningWithContainer) {
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

          // Clean up temp rehosted video
          if (post.rehostStoragePath) {
            await storageAdmin().storage.from("library-videos").remove([post.rehostStoragePath]).catch(() => null);
            await prisma.scheduledPost.update({ where: { id: post.id }, data: { rehostStoragePath: null } });
          }

          // Warmup progress
          const warmup = warmupMap.get(post.accountId);
          if (warmup) {
            const newCount = warmup.completedPosts + 1;
            const finished = newCount >= warmup.targetPosts;
            await prisma.accountWarmup.update({
              where: { id: warmup.id },
              data: { completedPosts: newCount, lastPostedAt: now, isActive: !finished },
            });
          }

          // Push notification
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
        } else {
          await failPost(post, pubResult.error, now);
        }
      } else if (containerStatus === "ERROR" || containerStatus === "EXPIRED") {
        await failPost(post, `Container ${containerStatus.toLowerCase()} — vídeo inválido ou fora das especificações do Instagram`, now);
        if (post.rehostStoragePath) {
          await storageAdmin().storage.from("library-videos").remove([post.rehostStoragePath]).catch(() => null);
        }
      } else {
        // IN_PROGRESS — timeout check
        if (post.containerCreatedAt && post.containerCreatedAt < tenMinutesAgo) {
          await failPost(post, "Timeout: vídeo não processado pelo Instagram em 10 minutos", now);
          if (post.rehostStoragePath) {
            await storageAdmin().storage.from("library-videos").remove([post.rehostStoragePath]).catch(() => null);
          }
        }
        // else: still processing, will check next cron run
      }
    } catch (err) {
      await failPost(post, err instanceof Error ? err.message : "Erro desconhecido", now);
    }
  }

  // ── PHASE 1: Create containers for pending posts ──────────────────────────────
  const allPending = await prisma.scheduledPost.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: now },
      accountId: { notIn: [...busyPhase1] },
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
  }).slice(0, 5); // Create up to 5 containers per cron run

  for (const post of pending) {
    // Warmup throttle
    const warmup = warmupMap.get(post.accountId);
    if (warmup?.lastPostedAt) {
      const msSinceLast = now.getTime() - warmup.lastPostedAt.getTime();
      if (msSinceLast < warmup.intervalMinutes * 60 * 1000) continue;
    }

    await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: "RUNNING" } });

    let rehostPath: string | null = null;
    try {
      const accessToken = decryptAccountPassword(post.account.accessTokenEnc);

      let videoUrl: string;
      if (post.rawVideoUrl) {
        const urlHash = createHash("md5").update(post.rawVideoUrl).digest("hex");
        const storagePath = `cloned/${post.userId}/${urlHash}.mp4`;
        const libVideo = await prisma.libraryVideo.findFirst({ where: { userId: post.userId, storagePath } });

        if (libVideo) {
          await prisma.scheduledPost.update({ where: { id: post.id }, data: { videoId: libVideo.id, rawVideoUrl: null } });
          try {
            const libRes = await fetch(libVideo.publicUrl, { signal: AbortSignal.timeout(90_000) });
            if (libRes.ok) {
              const raw = Buffer.from(await libRes.arrayBuffer());
              const cleanBuf = await cleanVideoBuffer(raw);
              if (cleanBuf) {
                const tempPath = `_clean/${randomUUID()}.mp4`;
                const { error: upErr } = await storageAdmin().storage.from("library-videos").upload(tempPath, cleanBuf, { contentType: "video/mp4", upsert: false });
                if (!upErr) {
                  const { data: pub } = storageAdmin().storage.from("library-videos").getPublicUrl(tempPath);
                  videoUrl = pub.publicUrl;
                  rehostPath = tempPath;
                } else {
                  videoUrl = libVideo.publicUrl;
                }
              } else {
                videoUrl = libVideo.publicUrl;
              }
            } else {
              videoUrl = libVideo.publicUrl;
            }
          } catch {
            videoUrl = libVideo.publicUrl;
          }
        } else {
          try {
            const rehosted = await rehostVideo(post.rawVideoUrl);
            videoUrl = rehosted.publicUrl;
            rehostPath = rehosted.storagePath;
          } catch {
            if (post.video?.publicUrl) {
              videoUrl = post.video.publicUrl;
            } else {
              await prisma.scheduledPost.update({
                where: { id: post.id },
                data: { status: "FAILED", errorMsg: "Vídeo fonte expirado. Re-agende com um vídeo da biblioteca.", retryCount: 3 },
              });
              continue;
            }
          }
        }
      } else if (post.video?.publicUrl) {
        videoUrl = post.video.publicUrl;
      } else {
        throw new Error("Nenhuma URL de vídeo disponível para este post.");
      }

      const result = await createReelContainer({
        igUserId: post.account.instagramUserId,
        accessToken,
        videoUrl,
        caption: post.caption,
        coverUrl: post.video?.coverUrl ?? null,
      });

      if (!result.ok) {
        if (rehostPath) await storageAdmin().storage.from("library-videos").remove([rehostPath]).catch(() => null);
        await failPost(post, result.error, now);
        continue;
      }

      // Save container ID — Phase 2 will pick this up on the next cron run
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: {
          containerCreationId: result.containerId,
          containerCreatedAt: now,
          rehostStoragePath: rehostPath,
        },
      });
    } catch (err) {
      if (rehostPath) await storageAdmin().storage.from("library-videos").remove([rehostPath]).catch(() => null);
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      await failPost(post, msg, now);
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
    await sendPushToUser(post.userId, {
      title: "⚠️ Reconecte a conta",
      body: `@${accountName}: token expirado ou revogado pelo Instagram. Acesse Contas e reconecte.`,
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
