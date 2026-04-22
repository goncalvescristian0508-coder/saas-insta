import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { publishReelFromVideoUrl } from "@/lib/instagramGraphPublish";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const pending = await prisma.scheduledPost.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    include: { account: true, video: true },
    take: 10,
  });

  const results = [];

  for (const post of pending) {
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { status: "RUNNING" },
    });

    try {
      const accessToken = decryptAccountPassword(post.account.accessTokenEnc);

      const result = await publishReelFromVideoUrl({
        accessToken,
        igUserId: post.account.instagramUserId,
        videoUrl: post.video.publicUrl,
        caption: post.caption,
      });

      if (!result.ok) throw new Error(result.error);

      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: "DONE", postedAt: new Date(), errorMsg: null },
      });

      results.push({ id: post.id, status: "done" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: "FAILED", errorMsg: msg },
      });
      results.push({ id: post.id, status: "failed", error: msg });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
