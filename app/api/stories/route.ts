import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 90;

function storageAdmin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function apifyRun(token: string, actorId: string, input: object): Promise<Record<string, unknown>[]> {
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${token}&timeout=60&memory=1024`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(70_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `Apify HTTP ${res.status}`);
  }
  return res.json() as Promise<Record<string, unknown>[]>;
}


// Ordered attempts: stories URL first, then fallbacks
function storyAttempts(username: string): Array<{ actorId: string; input: object }> {
  return [
    // Direct stories URL — forces scraper to navigate to the stories page
    {
      actorId: "apify/instagram-scraper",
      input: {
        directUrls: [`https://www.instagram.com/stories/${username}/`],
        resultsType: "stories",
        resultsLimit: 50,
      },
    },
    // Stories URL without resultsType filter
    {
      actorId: "apify/instagram-scraper",
      input: {
        directUrls: [`https://www.instagram.com/stories/${username}/`],
        resultsLimit: 50,
      },
    },
    // Profile URL with stories type (last resort)
    {
      actorId: "apify/instagram-scraper",
      input: {
        directUrls: [`https://www.instagram.com/${username}/`],
        resultsType: "stories",
        resultsLimit: 50,
      },
    },
  ];
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const usernameFilter = searchParams.get("username");
  const prefix = usernameFilter
    ? `stories/${user.id}/${usernameFilter}/`
    : `stories/${user.id}/`;

  const stories = await prisma.libraryVideo.findMany({
    where: { userId: user.id, storagePath: { startsWith: prefix } },
    orderBy: { createdAt: "desc" },
    select: { id: true, originalName: true, publicUrl: true, sizeBytes: true, mimeType: true, storagePath: true, createdAt: true },
  });

  return NextResponse.json({ stories });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json() as { username?: string };
  const raw = body.username?.trim() ?? "";
  // Accept full URLs like instagram.com/stories/user/ or instagram.com/user/
  const fromUrl = raw.match(/instagram\.com\/(?:stories\/)?([A-Za-z0-9_.]+)/i)?.[1];
  const cleanUsername = (fromUrl ?? raw.replace(/^@/, "")).trim();
  if (!cleanUsername) return NextResponse.json({ error: "Username obrigatório" }, { status: 400 });

  const dbTokens = await prisma.userApifyToken.findMany({ where: { userId: user.id, isActive: true } });
  const tokens = [
    ...dbTokens.map(t => t.token),
    ...(process.env.APIFY_TOKENS ?? process.env.APIFY_TOKEN ?? "").split(",").map(t => t.trim()).filter(Boolean),
  ];
  if (tokens.length === 0) {
    return NextResponse.json({ error: "Adicione um token Apify em Inspirações para usar esta função" }, { status: 400 });
  }

  let rawItems: Record<string, unknown>[] = [];
  let lastError = "";
  const attempts = storyAttempts(cleanUsername);

  outer:
  for (const token of tokens) {
    for (const attempt of attempts) {
      try {
        rawItems = await apifyRun(token, attempt.actorId, attempt.input);
        lastError = "";
        break outer;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        const msg = lastError.toLowerCase();
        // Actor not found or access denied → try next actor variation
        if (msg.includes("not found") || msg.includes("actor") || msg.includes("does not exist")) continue;
        // Quota/billing → skip to next token
        if (msg.includes("monthly") || msg.includes("limit") || msg.includes("billing") || msg.includes("quota") || msg.includes("credit") || msg.includes("401") || msg.includes("402")) break;
        // Hard error → stop
        return NextResponse.json({ error: lastError }, { status: 500 });
      }
    }
  }

  if (lastError) return NextResponse.json({ error: `Não foi possível buscar stories: ${lastError}` }, { status: 503 });

  if (rawItems.length === 0) {
    return NextResponse.json({ error: `@${cleanUsername} não tem stories ativos ou o perfil é privado` }, { status: 404 });
  }

  const admin = storageAdmin();
  let saved = 0;
  const errors: string[] = [];

  for (const item of rawItems) {
    const videoUrl = String(item.videoUrl ?? item.video_url ?? item.video ?? "");
    const imageUrl = String(item.displayUrl ?? item.imageUrl ?? item.image_url ?? item.thumbnailUrl ?? "");
    const isVideo = !!videoUrl && videoUrl !== "undefined" && videoUrl.startsWith("http");
    const isImg   = !!imageUrl && imageUrl !== "undefined" && imageUrl.startsWith("http") && !imageUrl.includes("instagram.com/stories/");
    const mediaUrl = isVideo ? videoUrl : (isImg ? imageUrl : "");
    if (!mediaUrl) {
      errors.push(`no_url: keys=${Object.keys(item).join(",")}`);
      continue;
    }

    const ext = isVideo ? "mp4" : "jpg";
    const mimeType = isVideo ? "video/mp4" : "image/jpeg";
    const storagePath = `stories/${user.id}/${cleanUsername}/${randomUUID()}.${ext}`;
    const name = `@${cleanUsername} · Story ${saved + 1}`;

    try {
      const r = await fetch(mediaUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          "Referer": "https://www.instagram.com/",
          "Accept": "video/mp4,image/jpeg,*/*",
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) { errors.push(`fetch_${r.status}: ${mediaUrl.slice(0, 80)}`); continue; }
      const buffer = Buffer.from(await r.arrayBuffer());
      const { error: upErr } = await admin.storage.from("library-videos").upload(storagePath, buffer, { contentType: mimeType, upsert: false });
      if (upErr) { errors.push(`upload: ${upErr.message}`); continue; }
      const { data: pub } = admin.storage.from("library-videos").getPublicUrl(storagePath);
      await prisma.libraryVideo.create({
        data: {
          userId: user.id,
          filename: storagePath.split("/").pop()!,
          originalName: name,
          storagePath,
          publicUrl: pub.publicUrl,
          sizeBytes: buffer.length,
          mimeType,
        },
      });
      saved++;
    } catch (e) { errors.push(`exception: ${e instanceof Error ? e.message : String(e)}`); continue; }
  }

  if (saved === 0) {
    const detail = errors.slice(0, 3).join(" | ");
    return NextResponse.json({ error: `Não foi possível baixar os stories. Detalhe: ${detail || "desconhecido"}` }, { status: 500 });
  }
  return NextResponse.json({ saved });
}
