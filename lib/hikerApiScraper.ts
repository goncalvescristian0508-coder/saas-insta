const BASE = "https://api.hikerapi.com/v1";

function getKey(): string {
  const key = process.env.HIKERAPI_KEY ?? "";
  if (!key) throw new Error("HIKERAPI_KEY não configurado");
  return key;
}

async function hikerGet(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { "x-access-key": getKey(), "Accept": "application/json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[hikerapi] error response:", res.status, body.slice(0, 300));
    throw new Error(`HikerAPI HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  console.log("[hikerapi] response keys:", path, JSON.stringify(Object.keys(data as object)).slice(0, 200));
  return data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pick(obj: any, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj?.[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

export interface HikerProfile {
  id: string;
  username: string;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  followersCount: number;
}

export interface HikerReel {
  shortCode: string;
  caption: string;
  videoUrl: string;
  thumbnailUrl: string;
  likes: number;
  comments: number;
  views: number;
  timestamp: string;
}

export async function hikerScrapeProfile(username: string): Promise<HikerProfile> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw = await hikerGet("/user/by/username", { username }) as any;

  // Some wrappers nest under .user or .data
  if (raw?.user) raw = raw.user;
  if (raw?.data) raw = raw.data;

  const id = String(pick(raw, "pk", "id", "user_id") ?? "");
  if (!id) throw new Error(`HikerAPI: user não encontrado para @${username}`);

  const followerCount = Number(pick(raw, "follower_count", "followers_count", "followers") ?? 0);
  const picUrl = String(
    pick(raw, "profile_pic_url_hd", "hd_profile_pic_url_info.url") ??
    raw?.hd_profile_pic_url_info?.url ??
    pick(raw, "profile_pic_url", "profile_picture_url") ?? ""
  );

  console.log("[hikerapi] profile:", id, raw?.username, "followers:", followerCount);

  return {
    id,
    username: String(raw?.username ?? username),
    fullName: String(pick(raw, "full_name", "fullName", "name") ?? ""),
    biography: String(pick(raw, "biography", "bio") ?? ""),
    profilePicUrl: picUrl,
    followersCount: followerCount,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractVideoUrl(item: any): string {
  // Try direct field first
  if (item?.video_url) return String(item.video_url);
  // Then video_versions array (private API format)
  if (Array.isArray(item?.video_versions) && item.video_versions.length > 0) {
    return String(item.video_versions[0]?.url ?? "");
  }
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractThumbnail(item: any): string {
  if (item?.thumbnail_url) return String(item.thumbnail_url);
  if (item?.display_url) return String(item.display_url);
  const candidates = item?.image_versions2?.candidates;
  if (Array.isArray(candidates) && candidates.length > 0) return String(candidates[0]?.url ?? "");
  return "";
}

export async function hikerScrapeReels(userId: string, limit = 9999): Promise<HikerReel[]> {
  const reels: HikerReel[] = [];
  let nextMaxId: string | undefined;
  const pageSize = 50;

  while (reels.length < limit) {
    const params: Record<string, string> = { user_id: userId, count: String(pageSize) };
    if (nextMaxId) params.max_id = nextMaxId;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = await hikerGet("/user/medias", params);

    // Handle different response shapes: array, {items}, {response}, {data:{items}}
    let items: unknown[];
    if (Array.isArray(data)) {
      items = data;
    } else if (Array.isArray(data?.items)) {
      items = data.items;
      nextMaxId = data.next_max_id ? String(data.next_max_id) : undefined;
    } else if (Array.isArray(data?.response)) {
      items = data.response;
    } else if (Array.isArray(data?.data?.items)) {
      items = data.data.items;
    } else {
      console.error("[hikerapi] unexpected medias shape:", JSON.stringify(data).slice(0, 300));
      break;
    }

    if (items.length === 0) break;
    console.log("[hikerapi] medias page:", items.length, "items, first type:", (items[0] as Record<string, unknown>)?.media_type);

    for (const raw of items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = raw as any;
      const mediaType = Number(item?.media_type ?? 0);
      if (mediaType !== 2) continue; // videos only

      const videoUrl = extractVideoUrl(item);
      if (!videoUrl) continue;

      const captionText = item?.caption?.text ?? item?.caption ?? "";
      const takenAt = Number(item?.taken_at ?? 0);

      reels.push({
        shortCode: String(item?.code ?? item?.shortcode ?? ""),
        caption: String(captionText),
        videoUrl,
        thumbnailUrl: extractThumbnail(item),
        likes: Number(item?.like_count ?? 0),
        comments: Number(item?.comment_count ?? 0),
        views: Number(item?.view_count ?? item?.play_count ?? item?.video_view_count ?? 0),
        timestamp: takenAt ? new Date(takenAt * 1000).toISOString() : "",
      });

      if (reels.length >= limit) break;
    }

    // Stop if no next page
    if (!nextMaxId && !Array.isArray(data)) break;
    if (Array.isArray(data) && data.length < pageSize) break;
    if (Array.isArray(data) && data.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const last = data[data.length - 1] as any;
      nextMaxId = last?.id ? String(last.id) : last?.pk ? String(last.pk) : undefined;
      if (!nextMaxId) break;
    }
  }

  return reels;
}

export async function hikerScrapeProfileAndReels(
  username: string,
  limit = 9999,
): Promise<{ profile: HikerProfile; reels: HikerReel[] }> {
  const profile = await hikerScrapeProfile(username);
  const reels = await hikerScrapeReels(profile.id, limit);
  return { profile, reels };
}
