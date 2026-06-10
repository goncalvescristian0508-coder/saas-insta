import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function classifyError(msg: string): "rateLimit" | "igError" | "other" {
  const m = msg.toLowerCase();
  if (
    m.includes("too many") || m.includes("many actions") ||
    m.includes("rate") || m.includes("spam") || m.includes("cooldown")
  ) return "rateLimit";
  if (
    m.includes("challenge") || m.includes("checkpoint") ||
    m.includes("token") || m.includes("oauth") || m.includes("expired") ||
    m.includes("suspended") || m.includes("disabled") || m.includes("inválido")
  ) return "igError";
  return "other";
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const now = new Date();
  const oneHourAgo   = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo    = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const thirtySecAgo = new Date(now.getTime() - 30 * 1000);
  const fiveMinAgo   = new Date(now.getTime() - 5 * 60 * 1000);

  // ── Live queue counts (no date filter — show all statuses) ─────────────────
  const [running, totalPending, postedLastHour, stuckRunning] = await Promise.all([
    prisma.scheduledPost.count({ where: { userId: user.id, status: "RUNNING" } }),
    prisma.scheduledPost.count({ where: { userId: user.id, status: "PENDING" } }),
    prisma.scheduledPost.count({ where: { userId: user.id, status: "DONE", postedAt: { gte: oneHourAgo } } }),
    prisma.scheduledPost.count({ where: { userId: user.id, status: "RUNNING", updatedAt: { lte: fiveMinAgo } } }),
  ]);
  const overdue = await prisma.scheduledPost.count({
    where: { userId: user.id, status: "PENDING", scheduledAt: { lte: thirtySecAgo } },
  });

  // ── All connected accounts ─────────────────────────────────────────────────
  const accounts = await prisma.instagramOAuthAccount.findMany({
    where: { userId: user.id },
    select: { id: true, username: true, accountStatus: true, quarantinedUntil: true },
  });

  // ── Pending count per account (efficient groupBy) ──────────────────────────
  const pendingGroups = await prisma.scheduledPost.groupBy({
    by: ["accountId"],
    where: { userId: user.id, status: "PENDING" },
    _count: { _all: true },
  });
  const pendingByAccount = new Map(pendingGroups.map(g => [g.accountId, g._count._all]));

  // ── 24h activity per account ───────────────────────────────────────────────
  const recentPosts = await prisma.scheduledPost.findMany({
    where: { userId: user.id, updatedAt: { gte: oneDayAgo } },
    select: { accountId: true, status: true, errorMsg: true },
  });

  type AccStat = {
    id: string; username: string; accountStatus: string;
    quarantinedUntil: Date | null;
    pendingCount: number;
    postsOk: number; igErrors: number; rateLimitErrors: number; otherErrors: number;
  };

  const statsMap = new Map<string, AccStat>();
  for (const acc of accounts) {
    statsMap.set(acc.id, {
      id: acc.id, username: acc.username, accountStatus: acc.accountStatus,
      quarantinedUntil: acc.quarantinedUntil,
      pendingCount: pendingByAccount.get(acc.id) ?? 0,
      postsOk: 0, igErrors: 0, rateLimitErrors: 0, otherErrors: 0,
    });
  }

  for (const post of recentPosts) {
    const s = statsMap.get(post.accountId);
    if (!s) continue;
    if (post.status === "DONE") {
      s.postsOk++;
    } else if (post.status === "FAILED") {
      const type = classifyError(post.errorMsg ?? "");
      if (type === "rateLimit") s.rateLimitErrors++;
      else if (type === "igError") s.igErrors++;
      else s.otherErrors++;
    }
  }

  const accountStats = [...statsMap.values()]
    .map(s => {
      const total = s.postsOk + s.igErrors + s.rateLimitErrors + s.otherErrors;
      return { ...s, total, successRate: total > 0 ? Math.round((s.postsOk / total) * 100) : 100 };
    })
    .filter(s => s.pendingCount > 0 || s.total > 0 || s.accountStatus !== "ACTIVE")
    .sort((a, b) => (b.pendingCount + b.total) - (a.pendingCount + a.total));

  // ── Global 24h totals ──────────────────────────────────────────────────────
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

  return NextResponse.json({
    queue: { running, pending: totalPending, postedLastHour, overdue, stuckRunning },
    totals: { ...totals, successRate: totalAll > 0 ? Math.round((totals.postsOk / totalAll) * 100) : 100 },
    accounts: accountStats,
    totalAccounts: accounts.length,
    lastUpdated: now.toISOString(),
  });
}

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
