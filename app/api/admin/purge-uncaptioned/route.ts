import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  return !!secret && auth === `Bearer ${secret}`;
}

// DELETE all PENDING posts whose linked video is NOT captioned (captionedUrl null or "none").
// Keeps only posts that will definitely post a captioned video.
export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find IDs of library videos that are NOT captioned
  const uncaptioned = await prisma.libraryVideo.findMany({
    where: {
      OR: [{ captionedUrl: null }, { captionedUrl: "none" }],
    },
    select: { id: true },
  });

  const uncaptionedIds = uncaptioned.map(v => v.id);

  if (uncaptionedIds.length === 0) {
    return NextResponse.json({ deleted: 0, message: "Nenhum vídeo sem legenda encontrado." });
  }

  // Delete PENDING posts referencing uncaptioned videos
  const deleted = await prisma.scheduledPost.deleteMany({
    where: {
      status: "PENDING",
      videoId: { in: uncaptionedIds },
    },
  });

  // Also reset any RUNNING posts that slipped through
  const resetRunning = await prisma.scheduledPost.updateMany({
    where: {
      status: "RUNNING",
      videoId: { in: uncaptionedIds },
    },
    data: { status: "FAILED", errorMsg: "Removido: vídeo sem legenda" },
  });

  return NextResponse.json({
    uncaptionedVideos: uncaptionedIds.length,
    deletedPending: deleted.count,
    failedRunning: resetRunning.count,
  });
}

// GET: preview — how many would be deleted
export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const uncaptioned = await prisma.libraryVideo.findMany({
    where: {
      OR: [{ captionedUrl: null }, { captionedUrl: "none" }],
    },
    select: { id: true },
  });

  const uncaptionedIds = uncaptioned.map(v => v.id);

  const [wouldDelete, wouldKeep] = await Promise.all([
    prisma.scheduledPost.count({
      where: { status: "PENDING", videoId: { in: uncaptionedIds } },
    }),
    prisma.scheduledPost.count({
      where: { status: "PENDING", videoId: { notIn: uncaptionedIds } },
    }),
  ]);

  return NextResponse.json({
    uncaptionedVideos: uncaptionedIds.length,
    pendingToDelete: wouldDelete,
    pendingToKeep: wouldKeep,
  });
}
