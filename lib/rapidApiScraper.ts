const BASE = "https://instagram-scraper-20251.p.rapidapi.com";
const HOST = "instagram-scraper-20251.p.rapidapi.com";

function getKey(): string {
  const key = process.env.RAPIDAPI_KEY ?? "";
  if (!key) throw new Error("RAPIDAPI_KEY não configurado");
  return key;
}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "x-rapidapi-host": HOST,
      "x-rapidapi-key": getKey(),
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`RapidAPI HTTP ${res.status}`);
  const data = await res.json() as Record<string, unknown>;
  if (data.status === "error" || data.status === false) {
    throw new Error(String(data.message ?? data.error ?? "RapidAPI error"));
  }
  return data;
}

export interface RapidProfile {
  id: string;
  username: string;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  followersCount: number;
}

export interface RapidReel {
  shortCode: string;
  caption: string;
  videoUrl: string;
  thumbnailUrl: string;
  likes: number;
  comments: number;
  views: number;
  timestamp: string;
}

interface ProfileData {
  id?: string;
  pk?: string;
  instagram_pk?: string;
  username?: string;
  full_name?: string;
  biography?: string;
  profile_pic_url?: string;
  hd_profile_pic_url_info?: { url?: string };
  follower_count?: number;
}

interface ReelItem {
  code?: string;
  media_type?: number;
  caption?: { text?: string } | null;
  // /userposts/ fields (preferred — has thumbnail_url)
  video_url?: string;
  thumbnail_url?: string;
  image_versions?: { additional_items?: { first_frame?: { url?: string } } };
  // /userreels/ fields
  video_versions?: { url?: string }[];
  image_versions2?: { candidates?: { url?: string }[] };
  like_count?: number;
  comment_count?: number;
  view_count?: number;
  play_count?: number;
  ig_play_count?: number;
  taken_at?: number;
}

interface ItemsData {
  count?: number;
  items?: ReelItem[];
}

function parseReelItem(item: ReelItem): RapidReel | null {
  if (item.media_type !== 2) return null;
  // video_url (userposts) takes priority, then video_versions[0].url (userreels)
  const videoUrl = item.video_url ?? item.video_versions?.[0]?.url ?? "";
  if (!videoUrl) return null;
  // thumbnail_url (userposts) → first_frame → candidates[0]
  const thumbnailUrl =
    item.thumbnail_url ??
    item.image_versions?.additional_items?.first_frame?.url ??
    item.image_versions2?.candidates?.[0]?.url ??
    "";
  return {
    shortCode: item.code ?? "",
    caption: item.caption?.text ?? "",
    videoUrl,
    thumbnailUrl,
    likes: item.like_count ?? 0,
    comments: item.comment_count ?? 0,
    views: item.play_count ?? item.ig_play_count ?? item.view_count ?? 0,
    timestamp: item.taken_at ? new Date(item.taken_at * 1000).toISOString() : "",
  };
}

export async function rapidScrapeProfileAndReels(
  username: string,
  limit = 9999,
): Promise<{ profile: RapidProfile; reels: RapidReel[] }> {
  // Use /userposts/ as primary (has thumbnail_url + video_url)
  // Fetch profile and posts in parallel
  const [profileRes, postsRes] = await Promise.all([
    getJson(`/userinfo/?username_or_id=${encodeURIComponent(username)}`),
    getJson(`/userposts/?username_or_id=${encodeURIComponent(username)}`),
  ]);

  // Parse profile — some responses nest under .data, others return at root level
  const profileRaw = profileRes as Record<string, unknown>;
  const profileData = (profileRaw.data ?? profileRaw) as ProfileData;
  const userId = String(profileData.id ?? profileData.pk ?? profileData.instagram_pk ?? "");
  if (!userId) throw new Error(`RapidAPI: perfil não encontrado para @${username}`);

  const profile: RapidProfile = {
    id: userId,
    username: profileData.username ?? username,
    fullName: profileData.full_name ?? "",
    biography: profileData.biography ?? "",
    profilePicUrl: profileData.hd_profile_pic_url_info?.url ?? profileData.profile_pic_url ?? "",
    followersCount: profileData.follower_count ?? 0,
  };

  // Parse posts (filter media_type === 2 for videos only)
  const postsRaw = postsRes as Record<string, unknown>;
  const postsData = (postsRaw.data ?? postsRaw) as ItemsData;
  const postItems = postsData.items ?? [];

  const reels: RapidReel[] = [];
  for (const item of postItems) {
    if (reels.length >= limit) break;
    const reel = parseReelItem(item);
    if (reel) reels.push(reel);
  }

  // Fallback to /userreels/ if userposts returned no videos
  if (reels.length === 0) {
    const reelsRes = await getJson(`/userreels/?username_or_id=${encodeURIComponent(username)}`);
    const reelsRaw2 = reelsRes as Record<string, unknown>;
    const reelsData = (reelsRaw2.data ?? reelsRaw2) as ItemsData;
    for (const item of reelsData.items ?? []) {
      if (reels.length >= limit) break;
      const reel = parseReelItem(item);
      if (reel) reels.push(reel);
    }
  }

  return { profile, reels };
}
