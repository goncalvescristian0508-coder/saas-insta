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
  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  return email === adminEmail;
}

export async function GET() {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { data: authData } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  const authUsers = authData?.users ?? [];

  const [oauthAccounts, privateAccounts, recentPosts, videos, salesByUser, globalSales] = await Promise.all([
    prisma.instagramOAuthAccount.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.privateInstagramAccount.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.scheduledPost.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { account: true, video: true },
    }),
    prisma.libraryVideo.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.sale.groupBy({
      by: ["userId"],
      where: { status: "APPROVED" },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.sale.aggregate({
      where: { status: "APPROVED" },
      _sum: { amount: true },
      _count: { id: true },
    }),
  ]);

  const salesMap: Record<string, { revenue: number; count: number }> = {};
  for (const s of salesByUser) {
    salesMap[s.userId] = { revenue: s._sum.amount ?? 0, count: s._count.id };
  }

  const userMap: Record<string, {
    id: string; email: string; name: string | null; createdAt: string;
    adminMessage: string | null; adminMessageAt: string | null;
    approved: boolean | null;
    oauthAccounts: typeof oauthAccounts;
    privateAccounts: typeof privateAccounts;
    videoCount: number;
    postsTotal: number; postsDone: number; postsFailed: number;
    lastActivity: string | null;
    revenue: number; salesCount: number;
  }> = {};

  for (const u of authUsers) {
    userMap[u.id] = {
      id: u.id,
      email: u.email ?? "(sem email)",
      name: u.user_metadata?.name ?? null,
      createdAt: u.created_at,
      adminMessage: u.user_metadata?.adminMessage ?? null,
      adminMessageAt: u.user_metadata?.adminMessageAt ?? null,
      approved: u.app_metadata?.approved ?? null,
      oauthAccounts: [],
      privateAccounts: [],
      videoCount: 0,
      postsTotal: 0,
      postsDone: 0,
      postsFailed: 0,
      lastActivity: null,
      revenue: salesMap[u.id]?.revenue ?? 0,
      salesCount: salesMap[u.id]?.count ?? 0,
    };
  }

  for (const acc of oauthAccounts) {
    if (!userMap[acc.userId]) {
      userMap[acc.userId] = {
        id: acc.userId, email: "(desconhecido)", name: null, createdAt: acc.createdAt.toISOString(),
        adminMessage: null, adminMessageAt: null, approved: null,
        oauthAccounts: [], privateAccounts: [], videoCount: 0, postsTotal: 0,
        postsDone: 0, postsFailed: 0, lastActivity: null,
        revenue: salesMap[acc.userId]?.revenue ?? 0, salesCount: salesMap[acc.userId]?.count ?? 0,
      };
    }
    userMap[acc.userId].oauthAccounts.push(acc);
  }

  for (const acc of privateAccounts) {
    if (!acc.userId) continue;
    if (!userMap[acc.userId]) {
      userMap[acc.userId] = {
        id: acc.userId, email: "(desconhecido)", name: null, createdAt: acc.createdAt.toISOString(),
        adminMessage: null, adminMessageAt: null, approved: null,
        oauthAccounts: [], privateAccounts: [], videoCount: 0, postsTotal: 0,
        postsDone: 0, postsFailed: 0, lastActivity: null,
        revenue: salesMap[acc.userId]?.revenue ?? 0, salesCount: salesMap[acc.userId]?.count ?? 0,
      };
    }
    userMap[acc.userId].privateAccounts.push(acc);
  }

  for (const v of videos) {
    if (userMap[v.userId]) userMap[v.userId].videoCount++;
  }

  for (const p of recentPosts) {
    const uid = p.userId;
    if (!userMap[uid]) continue;
    userMap[uid].postsTotal++;
    if (p.status === "DONE") userMap[uid].postsDone++;
    if (p.status === "FAILED") userMap[uid].postsFailed++;
    if (!userMap[uid].lastActivity || p.createdAt.toISOString() > userMap[uid].lastActivity!) {
      userMap[uid].lastActivity = p.createdAt.toISOString();
    }
  }

  const stats = {
    totalUsers: authUsers.length,
    totalOAuthAccounts: oauthAccounts.length,
    totalPrivateAccounts: privateAccounts.length,
    totalVideos: videos.length,
    totalPostsDone: recentPosts.filter(p => p.status === "DONE").length,
    globalRevenue: globalSales._sum.amount ?? 0,
    globalSalesCount: globalSales._count.id,
  };

  return NextResponse.json({
    stats,
    users: Object.values(userMap).map(u => ({
      ...u,
      privateAccounts: u.privateAccounts.map(a => ({ id: a.id, username: a.username, lastError: a.lastError })),
      oauthAccounts: u.oauthAccounts.map(a => ({
        id: a.id, username: a.username, profilePictureUrl: a.profilePictureUrl,
        lastError: a.lastError, createdAt: a.createdAt,
      })),
    })),
    recentPosts: recentPosts.slice(0, 50).map(p => ({
      id: p.id,
      userId: p.userId,
      accountUsername: p.account.username,
      videoName: p.video?.originalName ?? "Reel clonado",
      caption: p.caption.slice(0, 60),
      status: p.status,
      scheduledAt: p.scheduledAt,
      postedAt: p.postedAt,
      errorMsg: p.errorMsg,
      createdAt: p.createdAt,
    })),
    privateAccounts: privateAccounts.map(a => ({
      id: a.id, username: a.username, lastError: a.lastError, createdAt: a.createdAt,
    })),
  });
}
