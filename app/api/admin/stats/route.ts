import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function isAdmin(email: string | undefined) {
  return email === (process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com");
}

function getDateFilter(period: string): { gte?: Date; lt?: Date } | undefined {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case "hoje": return { gte: startOfDay };
    case "ontem": {
      const y = new Date(startOfDay.getTime() - 86_400_000);
      return { gte: y, lt: startOfDay };
    }
    case "7dias": return { gte: new Date(now.getTime() - 7 * 86_400_000) };
    case "1mes": return { gte: new Date(now.getTime() - 30 * 86_400_000) };
    default: return undefined;
  }
}

export async function GET(request: Request) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "maximo";

  const now = new Date();
  const dateFilter = getDateFilter(period);
  const periodWhere = dateFilter ? { createdAt: dateFilter } : {};

  const startOfMonth     = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth   = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysAgo     = new Date(now.getTime() - 7  * 86_400_000);
  const thirtyDaysAgo    = new Date(now.getTime() - 30 * 86_400_000);

  const [
    periodApproved,
    periodRefunded,
    allPending,
    mrrData,
    lastMrrData,
    gatewayBreakdown,
    planBreakdown,
    topAccounts,
    recentSales,
    postsInPeriod,
    activeIds7d,
    activeIds30d,
    allIdsWithPosts,
    usersWithAccountsRaw,
    authData,
  ] = await Promise.all([
    prisma.sale.aggregate({ where: { status: "APPROVED", ...periodWhere }, _sum: { amount: true }, _count: { id: true } }),
    prisma.sale.aggregate({ where: { status: "REFUNDED",  ...periodWhere }, _sum: { amount: true } }),
    prisma.sale.aggregate({ where: { status: "PENDING"  }, _sum: { amount: true }, _count: { id: true } }),
    prisma.sale.aggregate({ where: { status: "APPROVED", createdAt: { gte: startOfMonth } }, _sum: { amount: true } }),
    prisma.sale.aggregate({ where: { status: "APPROVED", createdAt: { gte: startOfLastMonth, lt: endOfLastMonth } }, _sum: { amount: true } }),
    prisma.sale.groupBy({ by: ["gateway"], where: { status: "APPROVED", ...periodWhere }, _sum: { amount: true }, _count: { id: true }, orderBy: { _sum: { amount: "desc" } } }).catch(() => []),
    prisma.sale.groupBy({ by: ["planName"], where: { status: "APPROVED", planName: { not: null }, ...periodWhere }, _sum: { amount: true }, _count: { id: true }, orderBy: { _sum: { amount: "desc" } } }).catch(() => []),
    prisma.sale.groupBy({ by: ["igUsername"], where: { status: "APPROVED", igUsername: { not: null }, ...periodWhere }, _sum: { amount: true }, _count: { id: true }, orderBy: { _sum: { amount: "desc" } }, take: 8 }).catch(() => []),
    prisma.sale.findMany({ where: { ...periodWhere }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, gateway: true, amount: true, status: true, customerName: true, igUsername: true, planName: true, createdAt: true } }),
    prisma.scheduledPost.groupBy({ by: ["status"], where: { ...periodWhere }, _count: { id: true } }).catch(() => []),
    prisma.scheduledPost.groupBy({ by: ["userId"], where: { createdAt: { gte: sevenDaysAgo  } } }).catch(() => []),
    prisma.scheduledPost.groupBy({ by: ["userId"], where: { createdAt: { gte: thirtyDaysAgo } } }).catch(() => []),
    prisma.scheduledPost.groupBy({ by: ["userId"] }).catch(() => []),
    prisma.instagramOAuthAccount.groupBy({ by: ["userId"] }).catch(() => []),
    adminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const authUsers  = authData.data?.users ?? [];
  const totalUsers = authUsers.length;

  // New users in period
  const periodStart = dateFilter?.gte;
  const periodEnd   = dateFilter?.lt;
  const newInPeriod = authUsers.filter(u => {
    const c = new Date(u.created_at);
    if (periodStart && c < periodStart) return false;
    if (periodEnd   && c >= periodEnd)  return false;
    return !periodStart; // if no filter, count none (maximo shows all-time)
  }).length;

  const usersWithAccounts = new Set(usersWithAccountsRaw.map(a => a.userId));
  const withNoAccounts    = authUsers.filter(u => !usersWithAccounts.has(u.id)).length;

  const usersWithAnyPost = new Set(allIdsWithPosts.map(p => p.userId));
  const whoNeverPosted   = authUsers.filter(u => !usersWithAnyPost.has(u.id)).length;

  const activeSet30d = new Set(activeIds30d.map(p => p.userId));
  const churn30d     = [...usersWithAnyPost].filter(uid => !activeSet30d.has(uid)).length;

  const mrr             = mrrData._sum.amount ?? 0;
  const lastMrr         = lastMrrData._sum.amount ?? 0;
  const approvedRevenue = periodApproved._sum.amount ?? 0;
  const approvedCount   = periodApproved._count.id;
  const mrrGrowth       = lastMrr > 0 ? ((mrr - lastMrr) / lastMrr) * 100 : 0;

  const postsByStatus: Record<string, number> = {};
  for (const p of postsInPeriod) postsByStatus[p.status] = p._count.id;
  const totalPosts  = Object.values(postsByStatus).reduce((s, n) => s + n, 0);
  const donePosts   = postsByStatus["DONE"]   ?? 0;
  const failedPosts = postsByStatus["FAILED"] ?? 0;

  return NextResponse.json({
    revenue: {
      approvedRevenue,
      approvedCount,
      pendingCount:    allPending._count.id,
      pendingRevenue:  allPending._sum.amount ?? 0,
      refundedRevenue: periodRefunded._sum.amount ?? 0,
      mrr,
      lastMrr,
      arr: mrr * 12,
      ticketMedio: approvedCount > 0 ? approvedRevenue / approvedCount : 0,
      mrrGrowth,
    },
    users: {
      total: totalUsers,
      newInPeriod,
      activeUsers7d:  activeIds7d.length,
      activeUsers30d: activeIds30d.length,
      withNoAccounts,
      whoNeverPosted,
      churn30d,
    },
    posts: {
      totalInPeriod: totalPosts,
      doneInPeriod:  donePosts,
      failedInPeriod: failedPosts,
      successRate: totalPosts > 0 ? (donePosts / totalPosts) * 100 : 0,
    },
    gateways: gatewayBreakdown.map(g => ({ gateway: g.gateway, count: g._count.id, revenue: g._sum.amount ?? 0 })),
    topAccounts: topAccounts.map(a => ({ igUsername: a.igUsername!, count: a._count.id, revenue: a._sum.amount ?? 0 })),
    plans: planBreakdown.map(p => ({ planName: p.planName!, count: p._count.id, revenue: p._sum.amount ?? 0 })),
    recentSales,
  });
}
