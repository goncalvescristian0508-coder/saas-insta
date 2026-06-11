import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const GRAPH = "https://graph.instagram.com/v21.0";

interface MediaItem {
  id: string;
  like_count?: number;
  comments_count?: number;
  video_views?: number;
  timestamp?: string;
  media_type?: string;
}

interface AccountInsight {
  id: string;
  username: string;
  profilePicUrl: string | null;
  followers: number;
  mediaCount: number;
  avgLikes: number;
  avgComments: number;
  avgViews: number;
  totalLikes: number;
  totalComments: number;
  totalViews: number;
  engagementRate: number;
  postsAnalyzed: number;
  lastPostAt: string | null;
  status: "ok" | "error";
  error?: string;
}

async function fetchAccountEngagement(
  accessToken: string,
  igUserId: string,
): Promise<Omit<AccountInsight, "id" | "username" | "profilePicUrl">> {
  const [profileRes, mediaRes] = await Promise.all([
    fetch(
      `${GRAPH}/${igUserId}?fields=followers_count,media_count&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(15_000) }
    ),
    fetch(
      `${GRAPH}/${igUserId}/media?fields=id,like_count,comments_count,video_views,timestamp,media_type&limit=50&access_token=${accessToken}`,
      { signal: AbortSignal.timeout(15_000) }
    ),
  ]);

  if (!profileRes.ok) {
    const err = await profileRes.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `HTTP ${profileRes.status}`);
  }

  const profile = await profileRes.json() as { followers_count?: number; media_count?: number };
  const followers = profile.followers_count ?? 0;
  const mediaCount = profile.media_count ?? 0;

  let posts: MediaItem[] = [];
  if (mediaRes.ok) {
    const mediaData = await mediaRes.json() as { data?: MediaItem[] };
    posts = (mediaData.data ?? []).filter((p) => p.media_type !== "STORY");
  }

  if (posts.length === 0) {
    return { followers, mediaCount, avgLikes: 0, avgComments: 0, avgViews: 0, totalLikes: 0, totalComments: 0, totalViews: 0, engagementRate: 0, postsAnalyzed: 0, lastPostAt: null, status: "ok" };
  }

  const totalLikes = posts.reduce((s, p) => s + (p.like_count ?? 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.comments_count ?? 0), 0);
  const totalViews = posts.reduce((s, p) => s + (p.video_views ?? 0), 0);
  const avgLikes = Math.round(totalLikes / posts.length);
  const avgComments = Math.round(totalComments / posts.length);
  const avgViews = Math.round(totalViews / posts.length);
  const engagementRate = followers > 0
    ? Math.round(((totalLikes + totalComments) / posts.length / followers) * 1000) / 10
    : 0;

  const lastPostAt = posts[0]?.timestamp ?? null;

  return { followers, mediaCount, avgLikes, avgComments, avgViews, totalLikes, totalComments, totalViews, engagementRate, postsAnalyzed: posts.length, lastPostAt, status: "ok" };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const accounts = await prisma.instagramOAuthAccount.findMany({
    where: { userId: user.id, accountStatus: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      profilePictureUrl: true,
      instagramUserId: true,
      accessTokenEnc: true,
      tokenExpiresAt: true,
    },
  });

  const now = new Date();

  const results = await Promise.all(
    accounts.map(async (account): Promise<AccountInsight> => {
      // Skip expired tokens
      if (account.tokenExpiresAt && account.tokenExpiresAt < now) {
        return {
          id: account.id,
          username: account.username,
          profilePicUrl: account.profilePictureUrl ?? null,
          followers: 0, mediaCount: 0, avgLikes: 0, avgComments: 0, avgViews: 0,
          totalLikes: 0, totalComments: 0, totalViews: 0,
          engagementRate: 0, postsAnalyzed: 0, lastPostAt: null,
          status: "error",
          error: "Token expirado — reconecte a conta",
        };
      }

      try {
        const accessToken = decryptAccountPassword(account.accessTokenEnc);
        const data = await fetchAccountEngagement(accessToken, account.instagramUserId);
        return {
          id: account.id,
          username: account.username,
          profilePicUrl: account.profilePictureUrl ?? null,
          ...data,
        };
      } catch (err) {
        return {
          id: account.id,
          username: account.username,
          profilePicUrl: account.profilePictureUrl ?? null,
          followers: 0, mediaCount: 0, avgLikes: 0, avgComments: 0, avgViews: 0,
          totalLikes: 0, totalComments: 0, totalViews: 0,
          engagementRate: 0, postsAnalyzed: 0, lastPostAt: null,
          status: "error",
          error: err instanceof Error ? err.message : "Erro desconhecido",
        };
      }
    })
  );

  // Sort by engagement rate descending
  results.sort((a, b) => b.engagementRate - a.engagementRate);

  return NextResponse.json({ accounts: results });
}
