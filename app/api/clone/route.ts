import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { randomUUID } from "crypto";

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
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${token}&timeout=120&memory=256`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(130_000),
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

// Downloads a video from Instagram URL and saves it to Supabase storage permanently.
// Returns the LibraryVideo id and publicUrl, or null if download fails.
async function downloadReelToLibrary(
  videoUrl: string,
  userId: string,
  caption: string,
  index: number,
): Promise<{ id: string; publicUrl: string } | null> {
  try {
    const res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const storagePath = `cloned/${userId}/${randomUUID()}.mp4`;
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

  // Download each unique reel video to Supabase immediately so URLs don't expire.
  // We download in parallel batches of 5 to stay within timeout.
  const libraryVideos: Array<{ id: string; publicUrl: string } | null> = [];
  const BATCH = 5;
  for (let i = 0; i < reelsRaw.length; i += BATCH) {
    const batch = reelsRaw.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((reel, j) => downloadReelToLibrary(reel.videoUrl, user.id, reel.caption, i + j))
    );
    libraryVideos.push(...results);
  }

  // Only keep reels that were successfully downloaded
  const reels = reelsRaw
    .map((reel, i) => ({ ...reel, library: libraryVideos[i] }))
    .filter((r) => r.library !== null) as Array<{ videoUrl: string; caption: string; library: { id: string; publicUrl: string } }>;

  if (reels.length === 0) return NextResponse.json({ error: "Falha ao baixar os vídeos. Tente novamente." }, { status: 500 });

  const start = new Date(startAt);
  const intervalMs = intervalMinutes * 60 * 1000;

  const cloneJob = await prisma.cloneJob.create({
    data: {
      userId: user.id,
      sourceUsername: cleanUsername,
      profilePicUrl: profilePicUrl || null,
      accountUsernames: accounts.map((a) => a.username),
      totalReels: reels.length,
      clonedBio: cloneBio && !!biography,
      clonedPhoto: false,
    },
  });

  await Promise.all(
    reels.flatMap((reel, i) =>
      accounts.map((account, accountIdx) =>
        prisma.scheduledPost.create({
          data: {
            userId: user.id,
            accountId: account.id,
            videoId: reel.library.id,
            rawVideoUrl: null,
            caption: reel.caption,
            scheduledAt: new Date(start.getTime() + i * intervalMs + accountIdx * 60_000),
            cloneJobId: cloneJob.id,
          },
        })
      )
    )
  );

  if (cloneBio && biography) {
    await Promise.all(
      accounts.map(async (account) => {
        const accessToken = decryptAccountPassword(account.accessTokenEnc);
        return updateBio(accessToken, account.instagramUserId, biography);
      })
    );
  }

  const [storiesSaved, highlightsSaved] = await Promise.all([
    cloneStories ? scrapeAndSaveMedia(tokens[0], cleanUsername, user.id, "stories") : Promise.resolve(0),
    cloneHighlights ? scrapeAndSaveMedia(tokens[0], cleanUsername, user.id, "highlights") : Promise.resolve(0),
  ]);

  const lastAt = new Date(start.getTime() + (reels.length - 1) * intervalMs);

  return NextResponse.json({
    created: reels.length * accounts.length,
    reels: reels.length,
    accounts: accounts.length,
    firstPost: start.toISOString(),
    lastPost: lastAt.toISOString(),
    storiesSaved,
    highlightsSaved,
  });
}
