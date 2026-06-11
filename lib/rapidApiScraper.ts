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
  user_id?: string;
  username?: string;
  full_name?: string;
  fullName?: string;
  biography?: string;
  bio?: string;
  profile_pic_url?: string;
  profile_picture_url?: string;
  hd_profile_pic_url_info?: { url?: string };
  follower_count?: number;
  followers_count?: number;
  followers?: number;
}

interface ReelItem {
  code?: string;
  shortcode?: string;
  media_type?: number | string;
  is_video?: boolean;
  product_type?: string;
  caption?: { text?: string } | string | null;
  // /userposts/ fields (preferred — has thumbnail_url)
  video_url?: string;
  thumbnail_url?: string;
  image_versions?: { additional_items?: { first_frame?: { url?: string } } };
  // /userreels/ fields
  video_versions?: { url?: string }[];
  image_versions2?: { candidates?: { url?: string }[] };
  display_url?: string;
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
  // some APIs return posts directly as array at root
  [key: string]: unknown;
}

function parseReelItem(item: ReelItem): RapidReel | null {
  // video_url (userposts) takes priority, then video_versions[0].url (userreels)
  const videoUrl = item.video_url ?? item.video_versions?.[0]?.url ?? "";
  if (!videoUrl) return null; // no video URL = not a video, skip regardless of media_type
  // thumbnail_url (userposts) → first_frame → candidates[0]
  const thumbnailUrl =
    item.thumbnail_url ??
    item.image_versions?.additional_items?.first_frame?.url ??
    item.image_versions2?.candidates?.[0]?.url ??
    "";
  const captionText = typeof item.caption === "string" ? item.caption : item.caption?.text ?? "";
  return {
    shortCode: item.code ?? item.shortcode ?? "",
    caption: captionText,
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
  // Handle nesting: {data:{...}} or root-level or {user:{...}}
  const profileNested = (profileRaw.data ?? profileRaw.user ?? profileRaw) as ProfileData;
  const profileData = profileNested as ProfileData;
  const userId = String(profileData.id ?? profileData.pk ?? profileData.instagram_pk ?? profileData.user_id ?? "");
  if (!userId) throw new Error(`RapidAPI: perfil não encontrado para @${username}`);

  const profile: RapidProfile = {
    id: userId,
    username: profileData.username ?? username,
    fullName: profileData.full_name ?? profileData.fullName ?? "",
    biography: profileData.biography ?? profileData.bio ?? "",
    profilePicUrl: profileData.hd_profile_pic_url_info?.url ?? profileData.profile_pic_url ?? profileData.profile_picture_url ?? "",
    followersCount: profileData.follower_count ?? profileData.followers_count ?? profileData.followers ?? 0,
  };

  // Parse posts — handle array response, {items:[...]}, {data:{items:[...]}}
  function extractItems(res: unknown): ReelItem[] {
    if (Array.isArray(res)) return res as ReelItem[];
    const r = res as Record<string, unknown>;
    const inner = r.data ?? r;
    const obj = inner as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items as ReelItem[];
    if (Array.isArray(obj.reels)) return obj.reels as ReelItem[];
    if (Array.isArray(obj.posts)) return obj.posts as ReelItem[];
    if (Array.isArray(obj.medias)) return obj.medias as ReelItem[];
    return [];
  }

  const postItems = extractItems(postsRes);

  const reels: RapidReel[] = [];
  for (const item of postItems) {
    if (reels.length >= limit) break;
    const reel = parseReelItem(item);
    if (reel) reels.push(reel);
  }

  // Fallback to /userreels/ if userposts returned no videos
  if (reels.length === 0) {
    const reelsRes = await getJson(`/userreels/?username_or_id=${encodeURIComponent(username)}`);
    for (const item of extractItems(reelsRes)) {
      if (reels.length >= limit) break;
      const reel = parseReelItem(item);
      if (reel) reels.push(reel);
    }
  }

  return { profile, reels };
}
