import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import os from "os";
import fs from "fs";
import {
  logMetadataStripResult,
  probeVideoMetadata,
  stripVideoMetadataCopy,
} from "@/lib/videoMetadata";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { videoUrl, filename } = await request.json();

    if (!videoUrl) {
      return NextResponse.json(
        { error: "URL do vídeo é obrigatória" },
        { status: 400 },
      );
    }

    const videoResponse = await fetch(videoUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!videoResponse.ok) {
      return NextResponse.json(
        { error: "Falha ao baixar vídeo" },
        { status: 502 },
      );
    }

    const videoBuffer = await videoResponse.arrayBuffer();

    const tempDir = os.tmpdir();
    const tempId = uuidv4();
    const inputPath = path.join(tempDir, `input_${tempId}.mp4`);
    const outputPath = path.join(tempDir, `output_${tempId}.mp4`);

    fs.writeFileSync(inputPath, Buffer.from(videoBuffer));

    const metaBefore = await probeVideoMetadata(inputPath);
    await stripVideoMetadataCopy(inputPath, outputPath);
    const metaAfter = await probeVideoMetadata(outputPath);
    logMetadataStripResult(metaBefore, metaAfter);

    const processedVideo = fs.readFileSync(outputPath);

    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch (e) {
      console.error("Cleanup error", e);
    }

    return new NextResponse(processedVideo, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${filename || "video_sem_metadados.mp4"}"`,
        "Content-Length": String(processedVideo.length),
      },
    });
  } catch (error: unknown) {
    console.error("Download error:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
