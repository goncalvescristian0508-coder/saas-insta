import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

const TMP_DIR = join(process.cwd(), "tmp", "video-clean");

async function ensureTmp() {
  await mkdir(TMP_DIR, { recursive: true });
}

/**
 * Processes a video buffer to strip all metadata, re-encode, and apply
 * minor imperceptible variations so Instagram treats it as a brand-new video.
 */
export async function cleanVideo(inputBuffer: Buffer): Promise<Buffer> {
  await ensureTmp();

  const id = randomUUID();
  const inputPath  = join(TMP_DIR, `${id}_in.mp4`);
  const outputPath = join(TMP_DIR, `${id}_out.mp4`);

  await writeFile(inputPath, inputBuffer);

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        // ── strip every metadata atom ──────────────────────────────
        .outputOptions("-map_metadata", "-1")
        .outputOptions("-map_chapters", "-1")

        // ── video: re-encode H.264, crop 1px each side (new hash) ──
        .outputOptions("-c:v", "libx264")
        .outputOptions("-crf", "22")
        .outputOptions("-preset", "fast")
        .outputOptions("-profile:v", "high")
        .outputOptions("-level", "4.0")
        // crop 2px total (1px each side) — invisible but changes perceptual hash
        .outputOptions("-vf", "crop=iw-2:ih-2:1:1")

        // ── audio: re-encode AAC, standardize sample rate ──────────
        .outputOptions("-c:a", "aac")
        .outputOptions("-b:a", "128k")
        .outputOptions("-ar", "44100")
        .outputOptions("-ac", "2")

        // ── container: web-optimized, no encoder signature ─────────
        .outputOptions("-movflags", "+faststart")
        .outputOptions("-fflags", "+bitexact")
        .outputOptions("-flags:v", "+bitexact")
        .outputOptions("-flags:a", "+bitexact")

        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => null);
    await unlink(outputPath).catch(() => null);
  }
}
