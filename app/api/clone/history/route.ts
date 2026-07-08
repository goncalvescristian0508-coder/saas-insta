import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// DELETE (no id) — bulk cancel: deletes all PENDING/FAILED posts, keeps jobs + DONE posts
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const jobs = await prisma.cloneJob.findMany({ where: { userId: user.id }, select: { id: true } });
  const jobIds = jobs.map((j) => j.id);

  const { count } = await prisma.scheduledPost.deleteMany({
    where: { cloneJobId: { in: jobIds }, status: { in: ["PENDING", "FAILED"] } },
  });

  return NextResponse.json({ ok: true, cancelled: count });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const jobs = await prisma.cloneJob.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      sourceUsername: true,
      profilePicUrl: true,
      accountUsernames: true,
      totalReels: true,
      clonedBio: true,
      clonedPhoto: true,
      errorMsg: true,
      createdAt: true,
    },
  });

  if (jobs.length === 0) return NextResponse.json({ jobs: [] });

  // Use groupBy instead of fetching all posts — avoids loading 10k+ rows
  const jobIds = jobs.map((j) => j.id);
  const statusCounts = await prisma.scheduledPost.groupBy({
    by: ["cloneJobId", "status"],
    where: { cloneJobId: { in: jobIds } },
    _count: { status: true },
  });

  const countMap = new Map<string, { total: number; done: number; failed: number; pending: number }>();
  for (const { cloneJobId, status, _count } of statusCounts) {
    if (!countMap.has(cloneJobId)) countMap.set(cloneJobId, { total: 0, done: 0, failed: 0, pending: 0 });
    const entry = countMap.get(cloneJobId)!;
    entry.total += _count.status;
    if (status === "DONE") entry.done += _count.status;
    else if (status === "FAILED") entry.failed += _count.status;
    else entry.pending += _count.status;
  }

  const result = jobs.map((job) => {
    const counts = countMap.get(job.id) ?? { total: 0, done: 0, failed: 0, pending: 0 };
    return {
      id: job.id,
      sourceUsername: job.sourceUsername,
      profilePicUrl: job.profilePicUrl,
      accountUsernames: job.accountUsernames,
      totalReels: job.totalReels,
      clonedBio: job.clonedBio,
      clonedPhoto: job.clonedPhoto,
      errorMsg: job.errorMsg ?? null,
      createdAt: job.createdAt,
      posts: counts,
    };
  });

  return NextResponse.json({ jobs: result });
}
