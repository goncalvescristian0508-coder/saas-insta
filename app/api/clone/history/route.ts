import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const jobs = await prisma.cloneJob.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      posts: {
        select: { status: true },
      },
    },
  });

  const result = jobs.map((job) => {
    const total = job.posts.length;
    const done = job.posts.filter((p) => p.status === "DONE").length;
    const failed = job.posts.filter((p) => p.status === "FAILED").length;
    const pending = job.posts.filter((p) => p.status === "PENDING" || p.status === "RUNNING").length;

    return {
      id: job.id,
      sourceUsername: job.sourceUsername,
      profilePicUrl: job.profilePicUrl,
      accountUsernames: job.accountUsernames,
      totalReels: job.totalReels,
      clonedBio: job.clonedBio,
      clonedPhoto: job.clonedPhoto,
      createdAt: job.createdAt,
      posts: { total, done, failed, pending },
    };
  });

  return NextResponse.json({ jobs: result });
}
