import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ADMIN_EMAIL = "goncalvescristian0508@gmail.com";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const [pending, published, failed, total] = await Promise.all([
    prisma.scheduledPost.count({ where: { status: "PENDING" } }),
    prisma.scheduledPost.count({ where: { status: "DONE" } }),
    prisma.scheduledPost.count({ where: { status: "FAILED" } }),
    prisma.scheduledPost.count(),
  ]);

  const recentFailed = await prisma.scheduledPost.findMany({
    where: { status: "FAILED" },
    select: {
      id: true, errorMsg: true, updatedAt: true, retryCount: true,
      videoId: true, rawVideoUrl: true, cloneJobId: true,
      video: { select: { captionedUrl: true, storagePath: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  const recentPublished = await prisma.scheduledPost.findMany({
    where: { status: "DONE" },
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 3,
  });

  return NextResponse.json({ total, pending, published, failed, recentFailed, recentPublished });
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const validBearer = !!cronSecret && auth === `Bearer ${cronSecret}`;

  if (!validBearer) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(req.url);

  // ?migrate=1 → aplica colunas faltando no banco
  if (searchParams.get("migrate") === "1") {
    const stmts = [
      `ALTER TABLE "CloneJob" ADD COLUMN IF NOT EXISTS "intervalMinutes" INTEGER NOT NULL DEFAULT 60`,
    ];
    const results: string[] = [];
    for (const sql of stmts) {
      try {
        await prisma.$executeRawUnsafe(sql);
        results.push(`OK: ${sql.slice(0, 60)}`);
      } catch (e) {
        results.push(`ERR: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return NextResponse.json({ migrated: true, results });
  }

  // ?purgeAll=1 → deleta TUDO: todos os posts e todos os LibraryVideo (limpa do zero)
  if (searchParams.get("purgeAll") === "1") {
    const deletedPosts = await prisma.scheduledPost.deleteMany({});
    const deletedVideos = await prisma.libraryVideo.deleteMany({});
    return NextResponse.json({ deletedPosts: deletedPosts.count, deletedVideos: deletedVideos.count });
  }

  // ?purge=1 → deleta TODOS os posts (qualquer status) que referenciam vídeo sem legenda
  //             depois deleta os próprios LibraryVideo sem legenda
  if (searchParams.get("purge") === "1") {
    const uncaptioned = await prisma.libraryVideo.findMany({
      where: { OR: [{ captionedUrl: null }, { captionedUrl: "none" }] },
      select: { id: true },
    });
    const ids = uncaptioned.map(v => v.id);
    if (ids.length === 0) {
      return NextResponse.json({ uncaptionedVideos: 0, deletedPosts: 0, deletedVideos: 0 });
    }
    // Deleta todos os posts que referenciam esses vídeos (cascade não basta pq alguns posts têm videoId nulo)
    const deletedPosts = await prisma.scheduledPost.deleteMany({
      where: { videoId: { in: ids } },
    });
    // Deleta os próprios vídeos sem legenda
    const deletedVideos = await prisma.libraryVideo.deleteMany({
      where: { id: { in: ids } },
    });
    return NextResponse.json({ uncaptionedVideos: ids.length, deletedPosts: deletedPosts.count, deletedVideos: deletedVideos.count });
  }

  const now = new Date();

  // Reset ALL failed posts to pending, zeroing retryCount and scheduledAt so the cron picks them up immediately
  const result = await prisma.scheduledPost.updateMany({
    where: { status: "FAILED" },
    data: { status: "PENDING", errorMsg: null, retryCount: 0, scheduledAt: now, containerCreationId: null, containerCreatedAt: null },
  });

  // Reativa contas em quarentena (podem ter sido colocadas em quarentena durante o downtime do banco)
  await prisma.instagramOAuthAccount.updateMany({
    where: { accountStatus: "QUARANTINE" },
    data: { accountStatus: "ACTIVE", quarantinedUntil: null, lastError: null },
  });

  return NextResponse.json({ reset: result.count });
}
