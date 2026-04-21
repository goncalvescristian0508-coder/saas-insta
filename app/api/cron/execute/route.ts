import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { publishReelFromBuffer } from "@/lib/instagramGraphPublish";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const pending = await prisma.scheduledPost.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: now },
    },
    include: {
      account: true,
      video: true,
    },
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

      const videoRes = await fetch(post.video.publicUrl);
      if (!videoRes.ok) throw new Error("Falha ao baixar vídeo da biblioteca");
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

      await publishReelFromBuffer({
        accessToken,
        igUserId: post.account.instagramUserId,
        videoBuffer,
        caption: post.caption,
        publicBaseUrl: process.env.NEXT_PUBLIC_APP_URL!,
        username: post.account.username,
      });

      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: "DONE", postedAt: new Date(), errorMsg: null },
      });

      results.push({ id: post.id, status: "done" });
    } catch (err: any) {
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: "FAILED", errorMsg: err?.message ?? "Erro desconhecido" },
      });
      results.push({ id: post.id, status: "failed", error: err?.message });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
