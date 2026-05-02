import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getDateFilter(period: string): { gte?: Date; lt?: Date } | undefined {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "hoje":
      return { gte: startOfDay };
    case "ontem": {
      const yesterday = new Date(startOfDay.getTime() - 86_400_000);
      return { gte: yesterday, lt: startOfDay };
    }
    case "7dias":
      return { gte: new Date(now.getTime() - 7 * 86_400_000) };
    case "1mes":
      return { gte: new Date(now.getTime() - 30 * 86_400_000) };
    default:
      return undefined; // maximo = no date filter
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
  const period = searchParams.get("period") ?? "maximo";

  const dateFilter = getDateFilter(period);
  const periodWhere = dateFilter ? { createdAt: dateFilter } : {};

  const [periodSales, pendingSales, totalCount, topAccounts, topProducts, recent] = await Promise.all([
    prisma.sale.aggregate({
      where: { userId: user.id, status: "APPROVED", ...periodWhere },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.sale.count({ where: { userId: user.id, status: "PENDING", ...periodWhere } }),
    prisma.sale.count({ where: { userId: user.id, ...periodWhere } }),
    prisma.sale.groupBy({
      by: ["igUsername"],
      where: { userId: user.id, status: "APPROVED", igUsername: { not: null }, ...periodWhere },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    }).catch(() => []),
    prisma.sale.groupBy({
      by: ["planName"],
      where: { userId: user.id, status: "APPROVED", planName: { not: null }, ...periodWhere },
      _sum: { amount: true },
      _count: { id: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    }).catch(() => []),
    prisma.sale.findMany({
      where: { userId: user.id, ...periodWhere },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true, gateway: true, amount: true, status: true,
        customerName: true, igUsername: true, planName: true, createdAt: true,
      },
    }),
  ]);

  const uniqueAccountsInPeriod = topAccounts.length;

  return NextResponse.json({
    stats: {
      approvedCount: periodSales._count.id,
      approvedRevenue: periodSales._sum.amount ?? 0,
      pendingCount: pendingSales,
      totalCount,
      uniqueAccounts: uniqueAccountsInPeriod,
      // Legacy fields for backward compat
      todayCount: period === "hoje" ? periodSales._count.id : 0,
      todayRevenue: period === "hoje" ? (periodSales._sum.amount ?? 0) : 0,
      totalRevenue: periodSales._sum.amount ?? 0,
    },
    sales: recent,
    topAccounts: topAccounts.map((r) => ({
      igUsername: r.igUsername,
      count: r._count.id,
      revenue: r._sum.amount ?? 0,
    })),
    topProducts: topProducts.map((r) => ({
      planName: r.planName,
      count: r._count.id,
      revenue: r._sum.amount ?? 0,
    })),
  });
}
