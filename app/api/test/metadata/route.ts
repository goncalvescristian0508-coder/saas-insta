import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import os from "os";
import fs from "fs";
import {
  logMetadataStripResult,
  probeVideoMetadata,
  stripVideoMetadataCopy,
  summarizeStripDiff,
} from "@/lib/videoMetadata";

export const runtime = "nodejs";

/**
 * GET /api/test/metadata?videoUrl=...
 * Em produção exige METADATA_TEST_SECRET igual ao query param `secret`.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const expected = process.env.METADATA_TEST_SECRET;
    const url = new URL(request.url);
    if (!expected || url.searchParams.get("secret") !== expected) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const url = new URL(request.url);
  const videoUrl = url.searchParams.get("videoUrl");
  if (!videoUrl) {
    return NextResponse.json(
      { error: "Query obrigatória: videoUrl" },
      { status: 400 },
    );
  }

  let inputPath = "";
  let outputPath = "";

  try {
    const videoResponse = await fetch(videoUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!videoResponse.ok) {
      return NextResponse.json(
        { error: `Falha ao baixar vídeo: HTTP ${videoResponse.status}` },
        { status: 502 },
      );
    }

    const buf = Buffer.from(await videoResponse.arrayBuffer());
    const tempDir = os.tmpdir();
    const tempId = uuidv4();
    inputPath = path.join(tempDir, `test_in_${tempId}.mp4`);
    outputPath = path.join(tempDir, `test_out_${tempId}.mp4`);
    fs.writeFileSync(inputPath, buf);

    const before = await probeVideoMetadata(inputPath);
    await stripVideoMetadataCopy(inputPath, outputPath);
    const after = await probeVideoMetadata(outputPath);
    logMetadataStripResult(before, after);

    const summary = summarizeStripDiff(before, after);

    return NextResponse.json({
      ok: true,
      before,
      after,
      summary,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[test/metadata]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    try {
      if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch {
      /* ignore */
    }
  }
}
