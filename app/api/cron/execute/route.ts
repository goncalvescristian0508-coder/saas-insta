import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { publishReelFromVideoUrl } from "@/lib/instagramGraphPublish";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

function storageAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function rehostVideo(rawUrl: string): Promise<{ publicUrl: string; storagePath: string }> {
  const res = await fetch(rawUrl, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`Falha ao baixar vídeo clonado: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const storagePath = `_cloned/${randomUUID()}.mp4`;
  const admin = storageAdmin();
  const { error } = await admin.storage.from("library-videos").upload(storagePath, buffer, {
    contentType: "video/mp4",
    upsert: false,
  });
  if (error) throw new Error(`Falha ao salvar vídeo: ${error.message}`);
  const { data: pub } = admin.storage.from("library-videos").getPublicUrl(storagePath);
  return { publicUrl: pub.publicUrl, storagePath };
}

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Reset ALL failed posts to PENDING so they're retried automatically on next run
  // Permanent failures (bad video, disconnected account) will keep failing and can be manually deleted
  await prisma.scheduledPost.updateMany({
    where: {
      status: "FAILED",
      scheduledAt: { lte: now },
    },
    data: { status: "PENDING", errorMsg: null },
  });

  // Process up to 5 posts per cron run
  const pending = await prisma.scheduledPost.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    include: { account: true, video: true },
    orderBy: { scheduledAt: "asc" },
    take: 5,
  });

  const results = [];

  for (const post of pending) {
    await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { status: "RUNNING" },
    });

    let rehostPath: string | null = null;
    try {
      const accessToken = decryptAccountPassword(post.account.accessTokenEnc);

      let videoUrl: string;
      if (post.rawVideoUrl) {
        const rehosted = await rehostVideo(post.rawVideoUrl);
        videoUrl = rehosted.publicUrl;
        rehostPath = rehosted.storagePath;
      } else if (post.video?.publicUrl) {
        videoUrl = post.video.publicUrl;
      } else {
        throw new Error("Nenhuma URL de vídeo disponível para este post.");
      }

      const result = await publishReelFromVideoUrl({
        accessToken,
        igUserId: post.account.instagramUserId,
        videoUrl,
        caption: post.caption,
      });

      if (rehostPath) {
        await storageAdmin().storage.from("library-videos").remove([rehostPath]);
        rehostPath = null;
      }

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
    } finally {
      if (rehostPath) {
        await storageAdmin().storage.from("library-videos").remove([rehostPath]).catch(() => null);
      }
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
