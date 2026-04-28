import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { cleanVideo } from "@/lib/videoClean";

export const runtime = "nodejs";
export const maxDuration = 300;

function storageAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST /api/media/clean  { videoIds: string[] }
// Processes each video through FFmpeg: strip metadata + re-encode + micro-crop
export async function POST(request: Request) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { videoIds } = await request.json() as { videoIds?: string[] };
  if (!videoIds?.length) return NextResponse.json({ error: "videoIds obrigatório" }, { status: 400 });

  const videos = await prisma.libraryVideo.findMany({
    where: { id: { in: videoIds }, userId: user.id, mimeType: "video/mp4" },
  });

  const storage = storageAdmin();
  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const video of videos) {
    try {
      // Download current video from storage
      const { data, error: dlErr } = await storage.storage
        .from("library-videos")
        .download(video.storagePath);
      if (dlErr || !data) throw new Error(dlErr?.message ?? "Falha ao baixar vídeo");

      const inputBuffer = Buffer.from(await data.arrayBuffer());

      // Run through FFmpeg cleaner
      const cleanedBuffer = await cleanVideo(inputBuffer);

      // Re-upload to the same path (overwrite)
      const { error: upErr } = await storage.storage
        .from("library-videos")
        .upload(video.storagePath, cleanedBuffer, {
          contentType: "video/mp4",
          upsert: true,
        });
      if (upErr) throw new Error(upErr.message);

      // Update file size in DB (re-encoded file may differ slightly)
      await prisma.libraryVideo.update({
        where: { id: video.id },
        data: { sizeBytes: cleanedBuffer.length },
      });

      results.push({ id: video.id, ok: true });
    } catch (err) {
      results.push({ id: video.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const done = results.filter(r => r.ok).length;
  return NextResponse.json({ processed: done, total: videos.length, results });
}
