import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { createReelContainer } from "@/lib/instagramGraphPublish";

export const runtime = "nodejs";

function isAdmin(email: string | undefined) {
  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  return email === adminEmail;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const testPost = searchParams.get("testPost") === "1";

  const now = new Date();
  const results: Record<string, unknown> = {};

  // 0. CRON_SECRET status
  results.cronSecretSet = !!process.env.CRON_SECRET;
  results.cronSecretPreview = process.env.CRON_SECRET
    ? `${process.env.CRON_SECRET.slice(0, 4)}...${process.env.CRON_SECRET.slice(-4)}`
    : "NOT SET";

  // 1. Check if containerCreationId column exists
  try {
    const colCheck = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'ScheduledPost' AND column_name = 'containerCreationId'
    `;
    results.containerCreationIdExists = colCheck.length > 0;
  } catch (e) {
    results.containerCreationIdExists = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  // 2. Check AccountWarmup table
  try {
    await prisma.$queryRaw`SELECT 1 FROM "AccountWarmup" LIMIT 1`;
    results.accountWarmupExists = true;
  } catch {
    results.accountWarmupExists = false;
  }

  // 3. Count pending posts past due
  try {
    const pending = await prisma.scheduledPost.count({
      where: { status: "PENDING", scheduledAt: { lte: now } },
    });
    results.pendingPastDue = pending;
  } catch (e) {
    results.pendingPastDue = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  // 4. Count running posts
  try {
    const running = await prisma.scheduledPost.count({ where: { status: "RUNNING" } });
    results.runningPosts = running;
  } catch (e) {
    results.runningPosts = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  // 5. Count accounts by status
  try {
    const active = await prisma.instagramOAuthAccount.count({ where: { accountStatus: "ACTIVE" } });
    const suspended = await prisma.instagramOAuthAccount.count({ where: { accountStatus: "SUSPENDED" } });
    const quarantine = await prisma.instagramOAuthAccount.count({ where: { accountStatus: "QUARANTINE" } });
    results.accounts = { active, suspended, quarantine };
  } catch (e) {
    results.accounts = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  // 6. Sample of pending posts with video info
  try {
    const sample = await prisma.scheduledPost.findMany({
      where: { status: "PENDING", scheduledAt: { lte: now } },
      include: {
        account: { select: { username: true, accountStatus: true } },
        video: { select: { publicUrl: true, storagePath: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    });
    results.samplePendingPosts = sample.map(p => ({
      id: p.id,
      scheduledAt: p.scheduledAt,
      accountUsername: p.account.username,
      accountStatus: p.account.accountStatus,
      retryCount: p.retryCount,
      errorMsg: p.errorMsg,
      hasVideoId: !!p.videoId,
      videoPublicUrl: p.video?.publicUrl?.slice(0, 80) ?? null,
      hasRawVideoUrl: !!p.rawVideoUrl,
    }));
  } catch (e) {
    results.samplePendingPosts = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  // 7. Recently failed posts with error messages
  try {
    const recentFailed = await prisma.scheduledPost.findMany({
      where: { status: "FAILED" },
      include: { account: { select: { username: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });
    results.recentFailedPosts = recentFailed.map(p => ({
      id: p.id,
      accountUsername: p.account.username,
      errorMsg: p.errorMsg,
      retryCount: p.retryCount,
      updatedAt: p.updatedAt,
    }));
  } catch (e) {
    results.recentFailedPosts = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  // 8. Schema fixes
  const schemaResults: Record<string, string> = {};
  const stmts: Record<string, string> = {
    addAppKey: `ALTER TABLE "InstagramOAuthAccount" ADD COLUMN IF NOT EXISTS "appKey" TEXT NOT NULL DEFAULT '1'`,
    addLastError: `ALTER TABLE "InstagramOAuthAccount" ADD COLUMN IF NOT EXISTS "lastError" TEXT`,
    addContainerCreationId: `ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "containerCreationId" TEXT`,
    addContainerCreatedAt: `ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "containerCreatedAt" TIMESTAMP(3)`,
    addRehostStoragePath: `ALTER TABLE "ScheduledPost" ADD COLUMN IF NOT EXISTS "rehostStoragePath" TEXT`,
  };
  for (const [key, sql] of Object.entries(stmts)) {
    try {
      await prisma.$executeRawUnsafe(sql);
      schemaResults[key] = "OK";
    } catch (e) {
      schemaResults[key] = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  results.schemaFixes = schemaResults;

  // 9. Optional: actually try to create a container for the first pending post
  if (testPost) {
    try {
      const post = await prisma.scheduledPost.findFirst({
        where: { status: "PENDING", scheduledAt: { lte: now }, account: { accountStatus: "ACTIVE" } },
        include: { account: true, video: true },
        orderBy: { scheduledAt: "asc" },
      });

      if (!post) {
        results.testPostResult = "Nenhum post pendente com conta ACTIVE encontrado";
      } else {
        const accessToken = decryptAccountPassword(post.account.accessTokenEnc);
        const videoUrl = post.video?.publicUrl ?? post.rawVideoUrl ?? null;

        if (!videoUrl) {
          results.testPostResult = {
            error: "Post sem URL de vídeo",
            postId: post.id,
            accountUsername: post.account.username,
          };
        } else {
          const containerResult = await createReelContainer({
            igUserId: post.account.instagramUserId,
            accessToken,
            videoUrl,
            caption: post.caption,
            coverUrl: post.video?.coverUrl ?? null,
          });

          results.testPostResult = {
            postId: post.id,
            accountUsername: post.account.username,
            videoUrl: videoUrl.slice(0, 80),
            containerResult,
          };

          // If successful, save the container ID so Phase 2 can pick it up
          if (containerResult.ok) {
            await prisma.scheduledPost.update({
              where: { id: post.id },
              data: {
                status: "RUNNING",
                containerCreationId: containerResult.containerId,
                containerCreatedAt: now,
              },
            });
            results.testPostResult = { ...results.testPostResult as object, savedToDb: true };
          }
        }
      }
    } catch (e) {
      results.testPostResult = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return NextResponse.json(results, { status: 200 });
}
