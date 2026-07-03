const BASE = "https://instagram-scraper-20251.p.rapidapi.com";
const HOST = "instagram-scraper-20251.p.rapidapi.com";

function getKey(): string {
  const key = process.env.RAPIDAPI_KEY ?? "";
  if (!key) throw new Error("RAPIDAPI_KEY não configurado");
  return key;
}

async function getJson(path: string, retries = 3): Promise<unknown> {
  let lastErr: Error | null = null;
  const delays = [3000, 7000, 15000];
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, delays[attempt - 1] ?? 15000));
    }
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        "x-rapidapi-host": HOST,
        "x-rapidapi-key": getKey(),
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : delays[attempt] ?? 15000;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      lastErr = new Error("Limite de requisições da RapidAPI atingido (429). Aguarde alguns segundos e tente novamente.");
      break;
    }
    if (!res.ok) throw new Error(`RapidAPI HTTP ${res.status}`);
    const data = await res.json() as Record<string, unknown>;
    if (data.status === "error" || data.status === false) {
      throw new Error(String(data.message ?? data.error ?? "RapidAPI error"));
    }
    return data;
  }
  throw lastErr ?? new Error("RapidAPI: falha após múltiplas tentativas");
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
  shortCode?: string;
  media_type?: number | string;
  type?: string;
  is_video?: boolean;
  product_type?: string;
  caption?: { text?: string } | string | null;
  // snake_case format (Instagram private API / most RapidAPI scrapers)
  video_url?: string;
  thumbnail_url?: string;
  image_versions?: { additional_items?: { first_frame?: { url?: string } } };
  video_versions?: { url?: string }[];
  image_versions2?: { candidates?: { url?: string }[] };
  display_url?: string;
  like_count?: number;
  comment_count?: number;
  view_count?: number;
  play_count?: number;
  ig_play_count?: number;
  taken_at?: number;
  // camelCase format (Apify-style / some RapidAPI scrapers)
  videoUrl?: string;
  thumbnailUrl?: string;
  images?: string[];
  likesCount?: number;
  commentsCount?: number;
  viewsCount?: number;
  timestamp?: string;
}

interface ItemsData {
  count?: number;
  items?: ReelItem[];
  // some APIs return posts directly as array at root
  [key: string]: unknown;
}

function parseReelItem(item: ReelItem): RapidReel | null {
  // Support both snake_case (Instagram private API) and camelCase (Apify/some RapidAPI scrapers)
  const videoUrl = item.video_url ?? item.videoUrl ?? item.video_versions?.[0]?.url ?? "";
  if (!videoUrl) return null; // no video URL = not a video, skip regardless of media_type
  const thumbnailUrl =
    item.thumbnail_url ??
    item.thumbnailUrl ??
    item.images?.[0] ??
    item.image_versions?.additional_items?.first_frame?.url ??
    item.image_versions2?.candidates?.[0]?.url ??
    "";
  const captionText = typeof item.caption === "string" ? item.caption : item.caption?.text ?? "";
  const takenAtMs = item.taken_at ? item.taken_at * 1000 : null;
  return {
    shortCode: item.code ?? item.shortcode ?? item.shortCode ?? "",
    caption: captionText,
    videoUrl,
    thumbnailUrl,
    likes: item.like_count ?? item.likesCount ?? 0,
    comments: item.comment_count ?? item.commentsCount ?? 0,
    views: item.play_count ?? item.ig_play_count ?? item.view_count ?? item.viewsCount ?? 0,
    timestamp: takenAtMs ? new Date(takenAtMs).toISOString() : (item.timestamp ?? ""),
  };
}

export async function rapidScrapeProfileAndReels(
  username: string,
  limit = 9999,
  maxPages = 30,
): Promise<{ profile: RapidProfile; reels: RapidReel[] }> {
  // Use /userposts/ as primary (has thumbnail_url + video_url)
  // Fetch sequentially to avoid hitting rate limit simultaneously
  const profileRes = await getJson(`/userinfo/?username_or_id=${encodeURIComponent(username)}`);
  const postsRes = await getJson(`/userposts/?username_or_id=${encodeURIComponent(username)}`);

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

  function extractCursor(res: unknown): string | null {
    if (!res || typeof res !== "object") return null;
    const r = res as Record<string, unknown>;
    const inner = (r.data ?? r) as Record<string, unknown>;
    // common cursor field names used by RapidAPI Instagram scrapers
    const cursor =
      inner.next_max_id ??
      inner.next_cursor ??
      inner.pagination_token ??
      inner.end_cursor ??
      inner.nextCursor ??
      r.next_max_id ??
      r.next_cursor ??
      r.pagination_token;
    if (!cursor) return null;
    return String(cursor);
  }

  const reels: RapidReel[] = [];
  const MAX_PAGES = maxPages;

  // Paginate /userposts/
  let cursor: string | null = null;
  let page = 0;
  let firstRes = postsRes;
  while (page < MAX_PAGES && reels.length < limit) {
    const pageRes = page === 0 ? firstRes : await getJson(
      `/userposts/?username_or_id=${encodeURIComponent(username)}&max_id=${encodeURIComponent(cursor ?? "")}`
    );
    const items = extractItems(pageRes);
    if (page === 0 && items.length === 0) {
      console.log("[rapidApi] userposts returned 0 items. Raw keys:", Object.keys(pageRes as object), "| snippet:", JSON.stringify(pageRes).slice(0, 300));
    }
    for (const item of items) {
      if (reels.length >= limit) break;
      const reel = parseReelItem(item);
      if (reel) reels.push(reel);
    }
    cursor = extractCursor(pageRes);
    page++;
    if (!cursor || items.length === 0) break;
  }

  // Fallback to /userreels/ if userposts returned no videos
  if (reels.length === 0) {
    cursor = null;
    page = 0;
    while (page < MAX_PAGES && reels.length < limit) {
      const pageRes = await getJson(
        `/userreels/?username_or_id=${encodeURIComponent(username)}${cursor ? `&max_id=${encodeURIComponent(cursor)}` : ""}`
      );
      const items = extractItems(pageRes);
      for (const item of items) {
        if (reels.length >= limit) break;
        const reel = parseReelItem(item);
        if (reel) reels.push(reel);
      }
      cursor = extractCursor(pageRes);
      page++;
      if (!cursor || items.length === 0) break;
    }
  }

  return { profile, reels };
}
