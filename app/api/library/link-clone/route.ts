import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * POST /api/library/link-clone?secret=CRON_SECRET
 * Body: { sourceUsername: string }
 *
 * Links imported LibraryVideos to the ScheduledPosts of a CloneJob by:
 * 1. Finding all CloneJobs for sourceUsername
 * 2. Collecting PENDING/FAILED posts that have expired rawVideoUrl (matching by caption)
 * 3. Updating rawVideoUrl → LibraryVideo.publicUrl so the cron can download & FFmpeg-transform them
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");

  let userId: string;
  if (secret && secret === process.env.CRON_SECRET) {
    const acc = await prisma.instagramOAuthAccount.findFirst({ orderBy: { createdAt: "asc" } }).catch(() => null);
    userId = acc?.userId ?? "";
    if (!userId) return NextResponse.json({ error: "userId não encontrado" }, { status: 400 });
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    userId = user.id;
  }

  const { sourceUsername } = (await request.json().catch(() => ({}))) as { sourceUsername?: string };
  if (!sourceUsername) return NextResponse.json({ error: "sourceUsername obrigatório" }, { status: 400 });

  // Find all CloneJobs for this profile
  const jobs = await prisma.cloneJob.findMany({
    where: { userId, sourceUsername },
    select: { id: true },
  });
  if (jobs.length === 0) return NextResponse.json({ error: `Nenhum clone job encontrado para @${sourceUsername}` }, { status: 404 });

  const jobIds = jobs.map(j => j.id);

  // Get all imported LibraryVideos for this user (from cloned/ folder)
  const libraryVideos = await prisma.libraryVideo.findMany({
    where: {
      userId,
      storagePath: { startsWith: `cloned/${userId}/`, not: { contains: "/covers/" } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (libraryVideos.length === 0) {
    return NextResponse.json({ error: "Nenhum vídeo importado encontrado na biblioteca" }, { status: 400 });
  }

  // Get PENDING/FAILED posts that still have rawVideoUrl (possibly expired)
  const posts = await prisma.scheduledPost.findMany({
    where: {
      cloneJobId: { in: jobIds },
      status: { in: ["PENDING", "FAILED"] },
      rawVideoUrl: { not: null },
    },
    select: { id: true, rawVideoUrl: true, caption: true },
    orderBy: { scheduledAt: "asc" },
  });

  if (posts.length === 0) {
    return NextResponse.json({ ok: true, message: "Nenhum post pendente/falho encontrado", linked: 0 });
  }

  // Build a map: caption → LibraryVideo (for smart matching)
  const captionMap = new Map<string, typeof libraryVideos[0]>();
  for (const v of libraryVideos) {
    const key = v.originalName.slice(0, 60).toLowerCase().trim();
    if (key && !captionMap.has(key)) captionMap.set(key, v);
  }

  let linked = 0;
  let idx = 0; // fallback round-robin index

  for (const post of posts) {
    // Try to match by caption
    const captionKey = (post.caption ?? "").slice(0, 60).toLowerCase().trim();
    let video = captionMap.get(captionKey);

    // Fallback: round-robin through available library videos
    if (!video) {
      video = libraryVideos[idx % libraryVideos.length];
      idx++;
    }

    if (!video) continue;

    // Only update if rawVideoUrl is not already a Supabase URL
    const currentUrl = post.rawVideoUrl ?? "";
    if (currentUrl.includes("supabase.co")) continue; // already using Supabase

    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: {
        rawVideoUrl: video.publicUrl,
        status: "PENDING",
        retryCount: 0,
        errorMsg: null,
        containerCreationId: null,
        containerCreatedAt: null,
      },
    }).catch(() => {});

    linked++;
  }

  return NextResponse.json({
    ok: true,
    sourceUsername,
    totalPosts: posts.length,
    libraryVideos: libraryVideos.length,
    linked,
  });
}
