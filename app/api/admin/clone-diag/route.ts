import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 30;

function isAdmin(email: string | undefined) {
  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  return email === adminEmail || email === "sistemaauto@gmail.com";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  let authorized = !!(cronSecret && secretParam === cronSecret);

  if (!authorized) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      authorized = isAdmin(user?.email);
    } catch { /* ignore */ }
  }

  if (!authorized) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const now = new Date();

  // Last 3 clone jobs with status breakdown
  const jobs = await prisma.cloneJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, sourceUsername: true, totalReels: true, createdAt: true, errorMsg: true },
  });

  const jobDiags = await Promise.all(jobs.map(async (j) => {
    const counts = await prisma.scheduledPost.groupBy({
      by: ["status"],
      where: { cloneJobId: j.id },
      _count: { status: true },
    });

    const firstPending = await prisma.scheduledPost.findFirst({
      where: { cloneJobId: j.id, status: "PENDING" },
      orderBy: { scheduledAt: "asc" },
      select: { id: true, scheduledAt: true, videoId: true, rawVideoUrl: true, errorMsg: true, accountId: true },
    });

    const accountIds = (await prisma.scheduledPost.findMany({
      where: { cloneJobId: j.id },
      select: { accountId: true },
      distinct: ["accountId"],
    })).map(a => a.accountId);

    const accounts = await prisma.instagramOAuthAccount.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, username: true, accountStatus: true },
    });

    const statusMap = Object.fromEntries(counts.map(c => [c.status, c._count.status]));

    return {
      id: j.id,
      sourceUsername: j.sourceUsername,
      totalReels: j.totalReels,
      createdAt: j.createdAt,
      errorMsg: j.errorMsg,
      statusCounts: statusMap,
      firstPending: firstPending ? {
        id: firstPending.id,
        scheduledAt: firstPending.scheduledAt,
        isPastDue: firstPending.scheduledAt <= now,
        diffHours: Math.round((firstPending.scheduledAt.getTime() - now.getTime()) / 3600000 * 10) / 10,
        hasVideoId: !!firstPending.videoId,
        hasRawVideoUrl: !!firstPending.rawVideoUrl,
        errorMsg: firstPending.errorMsg,
        accountId: firstPending.accountId,
      } : null,
      accounts: accounts.map(a => ({ id: a.id, username: a.username, accountStatus: a.accountStatus })),
    };
  }));

  // Global cron health
  const lastPublished = await prisma.scheduledPost.findFirst({
    where: { status: "DONE" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, updatedAt: true, accountId: true },
  });

  const pendingPastDue = await prisma.scheduledPost.count({
    where: { status: "PENDING", scheduledAt: { lte: now } },
  });

  const runningCount = await prisma.scheduledPost.count({ where: { status: "RUNNING" } });

  // Sample of recent errors across all posts
  const recentErrors = await prisma.scheduledPost.findMany({
    where: { status: "FAILED", updatedAt: { gte: new Date(Date.now() - 24 * 3600000) } },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true, errorMsg: true, updatedAt: true, accountId: true },
  });

  return NextResponse.json({
    now: now.toISOString(),
    cronHealth: {
      lastPublishedAt: lastPublished?.updatedAt ?? null,
      lastPublishedHoursAgo: lastPublished
        ? Math.round((now.getTime() - lastPublished.updatedAt.getTime()) / 3600000 * 10) / 10
        : null,
      pendingPastDue,
      runningCount,
    },
    cloneJobs: jobDiags,
    recentErrors24h: recentErrors,
  });
}
