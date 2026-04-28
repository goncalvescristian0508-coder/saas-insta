import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { randomUUID, createHash } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300;

const GRAPH = "https://graph.instagram.com/v21.0";

function storageAdmin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function apifyRun(token: string, actorId: string, input: object): Promise<Record<string, unknown>[]> {
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${token}&timeout=240&memory=512`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(250_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `Apify HTTP ${res.status}`);
  }
  return res.json() as Promise<Record<string, unknown>[]>;
}

async function updateBio(accessToken: string, igUserId: string, biography: string): Promise<{ ok: boolean }> {
  try {
    const url = new URL(`${GRAPH}/${igUserId}`);
    url.searchParams.set("biography", biography);
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url.toString(), { method: "POST" });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

// Downloads a video from URL and saves it to Supabase storage permanently.
// Returns the LibraryVideo id and publicUrl, or null if download fails.
async function downloadReelToLibrary(
  videoUrl: string,
  userId: string,
  caption: string,
  index: number,
): Promise<{ id: string; publicUrl: string } | null> {
  try {
    const urlHash = createHash("md5").update(videoUrl).digest("hex");
    const storagePath = `cloned/${userId}/${urlHash}.mp4`;

    const existing = await prisma.libraryVideo.findFirst({
      where: { userId, storagePath },
    });
    if (existing) return { id: existing.id, publicUrl: existing.publicUrl };

    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());

    const admin = storageAdmin();
    const { error } = await admin.storage
      .from("library-videos")
      .upload(storagePath, buffer, { contentType: "video/mp4", upsert: false });
    if (error) return null;
    const { data: pub } = admin.storage.from("library-videos").getPublicUrl(storagePath);
    const shortCaption = caption.slice(0, 60) || `Reel ${index + 1}`;
    const record = await prisma.libraryVideo.create({
      data: {
        userId,
        filename: storagePath.split("/").pop()!,
        originalName: shortCaption,
        storagePath,
        publicUrl: pub.publicUrl,
        sizeBytes: buffer.length,
        mimeType: "video/mp4",
      },
    });
    return { id: record.id, publicUrl: pub.publicUrl };
  } catch {
    return null;
  }
}

async function scrapeAndSaveMedia(
  token: string,
  username: string,
  userId: string,
  type: "stories" | "highlights",
): Promise<number> {
  try {
    const actorId = type === "stories"
      ? "apify/instagram-story-scraper"
      : "apify/instagram-highlights-scraper";
    const items = await apifyRun(token, actorId, { usernames: [username] });
    let saved = 0;
    for (const item of items.slice(0, 40)) {
      const videoUrl = String(item.videoUrl ?? item.video_url ?? "");
      const imageUrl = String(item.displayUrl ?? item.imageUrl ?? item.image_url ?? item.url ?? "");
      const isVideo = !!videoUrl;
      const mediaUrl = isVideo ? videoUrl : imageUrl;
      if (!mediaUrl || mediaUrl === "undefined") continue;
      const label = type === "stories" ? "Story" : "Destaque";
      const name = `@${username} - ${label} ${saved + 1}`;
      const ext = isVideo ? "mp4" : "jpg";
      const mimeType = isVideo ? "video/mp4" : "image/jpeg";
      try {
        const r = await fetch(mediaUrl, { signal: AbortSignal.timeout(30_000) });
        if (!r.ok) continue;
        const buffer = Buffer.from(await r.arrayBuffer());
        const storagePath = `cloned/${userId}/${randomUUID()}.${ext}`;
        const admin = storageAdmin();
        const { error } = await admin.storage.from("library-videos").upload(storagePath, buffer, { contentType: mimeType, upsert: false });
        if (error) continue;
        const { data: pub } = admin.storage.from("library-videos").getPublicUrl(storagePath);
        await prisma.libraryVideo.create({
          data: { userId, filename: storagePath.split("/").pop()!, originalName: name, storagePath, publicUrl: pub.publicUrl, sizeBytes: buffer.length, mimeType },
        });
        saved++;
      } catch { continue; }
    }
    return saved;
  } catch {
    return 0;
  }
}

// Downloads videos to library in background and updates posts with videoId.
// Posts are already created with rawVideoUrl so the cron can post them immediately.
async function downloadVideosBackground(
  reels: Array<{ videoUrl: string; caption: string }>,
  userId: string,
  cloneJobId: string,
) {
  const BATCH = 3;
  for (let i = 0; i < reels.length; i += BATCH) {
    const batch = reels.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (reel, j) => {
        const lib = await downloadReelToLibrary(reel.videoUrl, userId, reel.caption, i + j);
        if (lib) {
          await prisma.scheduledPost.updateMany({
            where: { cloneJobId, rawVideoUrl: reel.videoUrl, status: "PENDING" },
            data: { videoId: lib.id, rawVideoUrl: null },
          });
        }
      })
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json() as {
    username?: string;
    accountIds?: string[];
    intervalMinutes?: number;
    postLimit?: number | null;
    cloneBio?: boolean;
    cloneStories?: boolean;
    cloneHighlights?: boolean;
    startAt?: string;
  };

  const { username, accountIds, intervalMinutes = 10, postLimit, cloneBio = false, cloneStories = false, cloneHighlights = false, startAt } = body;
  if (!username || !accountIds?.length || !startAt) {
    return NextResponse.json({ error: "Campos obrigatórios: username, accountIds, startAt" }, { status: 400 });
  }

  const tokens = (process.env.APIFY_TOKENS ?? process.env.APIFY_TOKEN ?? "")
    .split(",").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return NextResponse.json({ error: "Token Apify não configurado" }, { status: 500 });

  const accounts = await prisma.instagramOAuthAccount.findMany({
    where: { id: { in: accountIds }, userId: user.id },
  });
  if (accounts.length === 0) return NextResponse.json({ error: "Nenhuma conta válida" }, { status: 404 });

  const cleanUsername = username.replace("@", "").trim();

  let reelsItems: Record<string, unknown>[] = [];
  let profileItems: Record<string, unknown>[] = [];
  let token = tokens[0];
  let apifyError = "";
  for (const t of tokens) {
    try {
      [reelsItems, profileItems] = await Promise.all([
        apifyRun(t, "apify/instagram-reel-scraper", { username: [cleanUsername], resultsLimit: postLimit ?? 9999 }),
        apifyRun(t, "apify/instagram-profile-scraper", { usernames: [cleanUsername] }),
      ]);
      token = t;
      apifyError = "";
      break;
    } catch (err) {
      apifyError = err instanceof Error ? err.message : String(err);
      const msg = apifyError.toLowerCase();
      if (msg.includes("monthly") || msg.includes("limit") || msg.includes("billing") || msg.includes("quota") || msg.includes("credit") || msg.includes("401") || msg.includes("402")) {
        continue;
      }
      return NextResponse.json({ error: apifyError }, { status: 500 });
    }
  }
  if (apifyError) return NextResponse.json({ error: `Todos os tokens falharam: ${apifyError}` }, { status: 503 });

  const profileItem = (profileItems[0] ?? {}) as Record<string, unknown>;
  const biography = String(profileItem.biography ?? profileItem.bio ?? "");
  const profilePicUrl = String(profileItem.profilePicUrlHD ?? profileItem.profilePicUrl ?? "");

  const seenUrls = new Set<string>();
  const reelsRaw = reelsItems
    .filter((p) => p.videoUrl)
    .map((p) => ({ videoUrl: String(p.videoUrl), caption: String(p.caption ?? "") }))
    .filter((r) => { if (seenUrls.has(r.videoUrl)) return false; seenUrls.add(r.videoUrl); return true; })
    .slice(0, postLimit ?? undefined);

  if (reelsRaw.length === 0) return NextResponse.json({ error: "Nenhum reel encontrado para este perfil" }, { status: 404 });

  const start = new Date(startAt);
  const intervalMs = intervalMinutes * 60 * 1000;

  const cloneJob = await prisma.cloneJob.create({
    data: {
      userId: user.id,
      sourceUsername: cleanUsername,
      profilePicUrl: profilePicUrl || null,
      accountUsernames: accounts.map((a) => a.username),
      totalReels: reelsRaw.length,
      clonedBio: cloneBio && !!biography,
      clonedPhoto: false,
    },
  });

  // Create all posts immediately with rawVideoUrl — no download needed before responding.
  // The execute cron downloads the video at post time via rehostVideo().
  // Background task below will replace rawVideoUrl with a stable library videoId.
  await prisma.scheduledPost.createMany({
    data: reelsRaw.flatMap((reel, i) =>
      accounts.map((account, accountIdx) => ({
        userId: user.id,
        accountId: account.id,
        videoId: null,
        rawVideoUrl: reel.videoUrl,
        caption: reel.caption,
        scheduledAt: new Date(start.getTime() + i * intervalMs + accountIdx * 60_000),
        cloneJobId: cloneJob.id,
      }))
    ),
  });

  if (cloneBio && biography) {
    await Promise.all(
      accounts.map(async (account) => {
        const accessToken = decryptAccountPassword(account.accessTokenEnc);
        return updateBio(accessToken, account.instagramUserId, biography);
      })
    );
  }

  // Download videos to library in background — posts will post via rawVideoUrl in the meantime
  waitUntil(
    Promise.all([
      downloadVideosBackground(reelsRaw, user.id, cloneJob.id),
      cloneStories ? scrapeAndSaveMedia(token, cleanUsername, user.id, "stories") : Promise.resolve(0),
      cloneHighlights ? scrapeAndSaveMedia(token, cleanUsername, user.id, "highlights") : Promise.resolve(0),
    ])
  );

  const lastAt = new Date(start.getTime() + (reelsRaw.length - 1) * intervalMs);

  return NextResponse.json({
    created: reelsRaw.length * accounts.length,
    reels: reelsRaw.length,
    accounts: accounts.length,
    firstPost: start.toISOString(),
    lastPost: lastAt.toISOString(),
    storiesSaved: 0,
    highlightsSaved: 0,
  });
}
