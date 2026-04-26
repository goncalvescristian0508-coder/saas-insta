import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const now = new Date();
  const oneHourAgo  = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo   = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const thirtySecAgo = new Date(now.getTime() - 30 * 1000);
  const fiveMinAgo  = new Date(now.getTime() - 5 * 60 * 1000);

  const [running, pending, postedLastHour, accounts, recentPosts] = await Promise.all([
    prisma.scheduledPost.count({ where: { userId: user.id, status: "RUNNING" } }),
    prisma.scheduledPost.count({ where: { userId: user.id, status: "PENDING" } }),
    prisma.scheduledPost.count({ where: { userId: user.id, status: "DONE", postedAt: { gte: oneHourAgo } } }),
    prisma.instagramOAuthAccount.findMany({
      where: { userId: user.id },
      select: { id: true, username: true },
    }),
    prisma.scheduledPost.findMany({
      where: { userId: user.id, updatedAt: { gte: oneDayAgo } },
      select: { accountId: true, status: true, errorMsg: true, scheduledAt: true },
    }),
  ]);

  // Posts past their scheduledAt by >30s still PENDING (overdue/jitter)
  const overdue = await prisma.scheduledPost.count({
    where: { userId: user.id, status: "PENDING", scheduledAt: { lte: thirtySecAgo } },
  });

  // Stuck RUNNING (>5min without completing)
  const stuckRunning = await prisma.scheduledPost.count({
    where: { userId: user.id, status: "RUNNING", updatedAt: { lte: fiveMinAgo } },
  });

  const accountMap = new Map(accounts.map(a => [a.id, a.username]));

  type AccStat = {
    username: string;
    postsOk: number;
    igErrors: number;
    rateLimitErrors: number;
    otherErrors: number;
  };
  const statsMap = new Map<string, AccStat>();

  for (const post of recentPosts) {
    const username = accountMap.get(post.accountId) ?? "?";
    if (!statsMap.has(post.accountId)) {
      statsMap.set(post.accountId, { username, postsOk: 0, igErrors: 0, rateLimitErrors: 0, otherErrors: 0 });
    }
    const s = statsMap.get(post.accountId)!;
    if (post.status === "DONE") {
      s.postsOk++;
    } else if (post.status === "FAILED") {
      const msg = (post.errorMsg ?? "").toLowerCase();
      if (msg.includes("rate") || msg.includes("limit") || msg.includes("spam") || msg.includes("cooldown")) {
        s.rateLimitErrors++;
      } else if (msg.includes("challenge") || msg.includes("checkpoint") || msg.includes("ig-9") || msg.includes("instagram")) {
        s.igErrors++;
      } else {
        s.otherErrors++;
      }
    }
  }

  // Quarantine: accounts whose last 5 completed posts are all FAILED
  const quarantined: string[] = [];
  for (const [accountId] of statsMap) {
    const last5 = await prisma.scheduledPost.findMany({
      where: { userId: user.id, accountId, status: { in: ["DONE", "FAILED"] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { status: true },
    });
    if (last5.length >= 5 && last5.every(p => p.status === "FAILED")) {
      quarantined.push(accountMap.get(accountId) ?? accountId);
    }
  }

  const accountStats = [...statsMap.values()].map(s => {
    const total = s.postsOk + s.igErrors + s.rateLimitErrors + s.otherErrors;
    return { ...s, total, successRate: total > 0 ? Math.round((s.postsOk / total) * 100) : 100 };
  }).sort((a, b) => b.total - a.total);

  // Global 24h totals
  const totals = accountStats.reduce(
    (acc, s) => ({
      postsOk: acc.postsOk + s.postsOk,
      igErrors: acc.igErrors + s.igErrors,
      rateLimitErrors: acc.rateLimitErrors + s.rateLimitErrors,
      otherErrors: acc.otherErrors + s.otherErrors,
    }),
    { postsOk: 0, igErrors: 0, rateLimitErrors: 0, otherErrors: 0 },
  );
  const totalAll = totals.postsOk + totals.igErrors + totals.rateLimitErrors + totals.otherErrors;
  const globalSuccessRate = totalAll > 0 ? Math.round((totals.postsOk / totalAll) * 100) : 100;

  return NextResponse.json({
    queue: { running, pending, postedLastHour, overdue, stuckRunning },
    totals: { ...totals, successRate: globalSuccessRate },
    accounts: accountStats,
    quarantined,
    lastUpdated: now.toISOString(),
  });
}

// Unlock stuck RUNNING posts → reset to PENDING
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const { count } = await prisma.scheduledPost.updateMany({
    where: { userId: user.id, status: "RUNNING", updatedAt: { lte: fiveMinAgo } },
    data: { status: "PENDING" },
  });

  return NextResponse.json({ unlocked: count });
}
