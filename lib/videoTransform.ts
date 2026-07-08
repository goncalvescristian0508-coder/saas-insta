import ffmpegPath from "ffmpeg-static";
import Ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import * as nodePath from "path";
import * as os from "os";
import { createHash } from "crypto";

if (ffmpegPath) Ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Deterministic per-account FFmpeg params derived from accountId.
 * Same account → same transform for every video it posts.
 */
export function accountTransformParams(accountId: string): {
  trimSec: number;
  crf: number;
  volumeDb: number;
} {
  const h = Math.abs(accountId.split("").reduce((s, c) => s + c.charCodeAt(0), 0));
  return {
    trimSec:  ((h % 3) + 1) * 0.1,   // 0.1 | 0.2 | 0.3 s removed from start
    crf:       22 + (h % 5),           // 22 | 23 | 24 | 25 | 26
    volumeDb: ((h % 5) - 2) * 0.5,    // −1.0 | −0.5 | 0.0 | +0.5 | +1.0 dB
  };
}

/**
 * Re-encode a video with per-account parameters so each account gets a
 * distinct binary fingerprint (different trim, CRF, and audio volume).
 * Writes temp files to /tmp and cleans up after.
 * Throws if FFmpeg fails or exceeds the 50 s timeout.
 */
export async function transformVideoForAccount(
  inputBuffer: Buffer,
  accountId: string,
): Promise<Buffer> {
  const { trimSec, crf, volumeDb } = accountTransformParams(accountId);
  const id = createHash("md5")
    .update(accountId + String(Date.now()))
    .digest("hex")
    .slice(0, 14);
  const inPath  = nodePath.join(os.tmpdir(), `${id}_in.mp4`);
  const outPath = nodePath.join(os.tmpdir(), `${id}_out.mp4`);

  try {
    await fs.writeFile(inPath, inputBuffer);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("FFmpeg timeout após 50s")),
        50_000,
      );
      Ffmpeg(inPath)
        .setStartTime(trimSec)
        .videoCodec("libx264")
        .addOptions([
          `-crf ${crf}`,
          "-preset veryfast",
          "-profile:v high",
          "-level 4.0",
          "-pix_fmt yuv420p",
          "-movflags +faststart",
        ])
        .audioCodec("aac")
        .audioFrequency(44100)
        .audioBitrate("128k")
        .audioFilters(`volume=${volumeDb}dB`)
        .output(outPath)
        .on("end", () => { clearTimeout(timer); resolve(); })
        .on("error", (e: Error) => { clearTimeout(timer); reject(e); })
        .run();
    });

    return await fs.readFile(outPath);
  } finally {
    await fs.unlink(inPath).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }
}
