import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { publishReelFromVideoUrl } from "@/lib/instagramGraphPublish";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
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

  // Reset failed posts to PENDING after 5 minutes
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  await prisma.scheduledPost.updateMany({
    where: {
      status: "FAILED",
      scheduledAt: { lte: now },
      updatedAt: { lte: fiveMinutesAgo },
    },
    data: { status: "PENDING", errorMsg: null },
  });

  // Load active warmup configs keyed by accountId
  const warmups = await prisma.accountWarmup.findMany({ where: { isActive: true } });
  const warmupMap = new Map(warmups.map((w) => [w.accountId, w]));

  // Process up to 10 posts per cron run, but at most 1 per account to avoid rate limits
  const allPending = await prisma.scheduledPost.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    include: { account: true, video: true },
    orderBy: { scheduledAt: "asc" },
    take: 50,
  });

  const seenAccounts = new Set<string>();
  const pending = allPending.filter((post) => {
    if (seenAccounts.has(post.accountId)) return false;
    seenAccounts.add(post.accountId);
    return true;
  }).slice(0, 10);

  const results = [];

  for (const post of pending) {
    // Warmup throttle: skip if account is in warmup and interval hasn't passed yet
    const warmup = warmupMap.get(post.accountId);
    if (warmup) {
      if (warmup.lastPostedAt) {
        const msSinceLast = now.getTime() - warmup.lastPostedAt.getTime();
        const msRequired = warmup.intervalMinutes * 60 * 1000;
        if (msSinceLast < msRequired) {
          results.push({ id: post.id, status: "skipped_warmup" });
          continue;
        }
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
        const rehosted = await rehostVideo(post.rawVideoUrl);
        videoUrl = rehosted.publicUrl;
        rehostPath = rehosted.storagePath;
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

      results.push({ id: post.id, status: "done" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: "FAILED", errorMsg: msg },
      });

      const accountName = post.account.username ?? "conta";
      const isRateLimit = msg.toLowerCase().includes("too many actions") || msg.toLowerCase().includes("rate limit");

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
      } else {
        await sendPushToUser(post.userId, {
          title: "Falha no agendamento",
          body: `@${accountName}: ${msg.slice(0, 100)}`,
          url: "/schedule",
        });
      }

      results.push({ id: post.id, status: "failed", error: msg });
    } finally {
      if (rehostPath) {
        await storageAdmin().storage.from("library-videos").remove([rehostPath]).catch(() => null);
      }
    }
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
