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

  // All auth users
  const { data: authData } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  const authUsers = authData?.users ?? [];

  // All accounts + recent posts
  const [oauthAccounts, privateAccounts, recentPosts, videos] = await Promise.all([
    prisma.instagramOAuthAccount.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.privateInstagramAccount.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.scheduledPost.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { account: true, video: true },
    }),
    prisma.libraryVideo.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  // Build per-user summary
  const userMap: Record<string, {
    id: string; email: string; createdAt: string;
    oauthAccounts: typeof oauthAccounts;
    privateAccounts: typeof privateAccounts;
    videoCount: number;
    postsTotal: number; postsDone: number; postsFailed: number;
    lastActivity: string | null;
  }> = {};

  for (const u of authUsers) {
    userMap[u.id] = {
      id: u.id,
      email: u.email ?? "(sem email)",
      createdAt: u.created_at,
      oauthAccounts: [],
      privateAccounts: [],
      videoCount: 0,
      postsTotal: 0,
      postsDone: 0,
      postsFailed: 0,
      lastActivity: null,
    };
  }

  for (const acc of oauthAccounts) {
    if (!userMap[acc.userId]) {
      userMap[acc.userId] = {
        id: acc.userId, email: "(desconhecido)", createdAt: acc.createdAt.toISOString(),
        oauthAccounts: [], privateAccounts: [], videoCount: 0, postsTotal: 0, postsDone: 0, postsFailed: 0, lastActivity: null,
      };
    }
    userMap[acc.userId].oauthAccounts.push(acc);
  }

  for (const acc of privateAccounts) {
    if (!acc.userId) continue;
    if (!userMap[acc.userId]) {
      userMap[acc.userId] = {
        id: acc.userId, email: "(desconhecido)", createdAt: acc.createdAt.toISOString(),
        oauthAccounts: [], privateAccounts: [], videoCount: 0, postsTotal: 0, postsDone: 0, postsFailed: 0, lastActivity: null,
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
  };

  return NextResponse.json({
    stats,
    users: Object.values(userMap).map(u => ({
      ...u,
      privateAccounts: u.privateAccounts.map(a => ({ id: a.id, username: a.username, lastError: a.lastError })),
      oauthAccounts: u.oauthAccounts.map(a => ({ id: a.id, username: a.username, profilePictureUrl: a.profilePictureUrl, lastError: a.lastError, createdAt: a.createdAt })),
    })),
    recentPosts: recentPosts.slice(0, 30).map(p => ({
      id: p.id,
      userId: p.userId,
      accountUsername: p.account.username,
      videoName: p.video.originalName,
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
