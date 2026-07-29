import ffmpegStaticPath from "ffmpeg-static";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import * as nodePath from "path";
import * as os from "os";
import { createHash } from "crypto";

/**
 * Deterministic per-account FFmpeg params derived from accountId.
 * Same account → same transform for every video it posts.
 * Uses three independent hash values for maximum combination spread.
 */
export function accountTransformParams(accountId: string): {
  trimSec: number;
  speed: number;
  cropOffX: number;
  cropOffY: number;
  cropTotalW: number;
  cropTotalH: number;
  hue: number;
  saturation: number;
  crf: number;
  volumeDb: number;
} {
  const bytes = Buffer.from(accountId, "utf8");
  let h1 = 0, h2 = 0, h3 = 0;
  for (let i = 0; i < bytes.length; i++) {
    h1 = ((h1 + bytes[i] * (i + 1)) >>> 0);
    h2 = ((h2 ^ (bytes[i] << (i % 8))) >>> 0);
    h3 = ((h3 * 31 + bytes[i]) >>> 0);
  }

  return {
    trimSec:    parseFloat((((h2 % 5) + 1) * 0.1).toFixed(1)),        // 0.1–0.5 s
    speed:      parseFloat((0.990 + (h1 % 21) * 0.001).toFixed(3)),   // 0.990–1.010x  ← quebra phash por frame
    cropOffX:   h2 % 4,                                                 // 0–3 px da esquerda
    cropOffY:   (h2 >> 4) % 4,                                         // 0–3 px do topo
    cropTotalW: 2 + h3 % 3,                                            // 2–4 px removidos na largura
    cropTotalH: 2 + (h3 >> 3) % 3,                                    // 2–4 px removidos na altura
    hue:        (h1 % 9) - 4,                                          // −4° a +4°
    saturation: parseFloat((0.96 + (h2 % 9) * 0.01).toFixed(2)),      // 0.96–1.04
    crf:        22 + h3 % 7,                                           // 22–28
    volumeDb:   parseFloat((((h1 % 7) - 3) * 0.5).toFixed(1)),        // −1.5 a +1.5 dB
  };
}

// Resolves the ffmpeg binary path, copying it to /tmp so it's executable in Lambda.
let cachedBin: string | null = null;

async function resolveBin(): Promise<string> {
  if (cachedBin) return cachedBin;

  const src = ffmpegStaticPath as string | null;
  console.log("[ffmpeg] ffmpegStaticPath:", src);

  if (!src) throw new Error("ffmpeg-static não encontrou o binário");

  // Check if original path is directly executable
  const canExecOriginal = await fs
    .access(src, fs.constants?.X_OK ?? 1)
    .then(() => true)
    .catch(() => false);

  if (canExecOriginal) {
    console.log("[ffmpeg] original binary is executable:", src);
    cachedBin = src;
    return src;
  }

  // Copy to /tmp and chmod (Lambda has read-only /var/task but writable /tmp)
  const dst = nodePath.join(os.tmpdir(), "ffmpeg-bin");
  console.log("[ffmpeg] copying binary to /tmp:", dst);
  await fs.copyFile(src, dst);
  await fs.chmod(dst, 0o755);
  cachedBin = dst;
  console.log("[ffmpeg] binary ready at:", dst);
  return dst;
}

/**
 * Run ffmpeg with given args. Logs stderr on failure.
 */
async function runFfmpeg(args: string[]): Promise<void> {
  const bin = await resolveBin();
  console.log("[ffmpeg] spawn:", bin, args.join(" "));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("FFmpeg timeout após 50s"));
    }, 50_000);

    const proc = spawn(bin, args);
    const stderrChunks: string[] = [];

    proc.stderr.on("data", (d: Buffer) => stderrChunks.push(d.toString()));
    proc.stdout.on("data", () => {}); // drain stdout

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        const detail = stderrChunks.join("").slice(-600);
        console.error("[ffmpeg] exit", code, "stderr:", detail);
        reject(new Error(`FFmpeg saiu com código ${code}: ${detail.slice(0, 200)}`));
      }
    });

    proc.on("error", (e: Error) => {
      clearTimeout(timer);
      console.error("[ffmpeg] spawn error:", e.message);
      reject(new Error(`FFmpeg spawn error: ${e.message}`));
    });
  });
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
  const { trimSec, speed, cropOffX, cropOffY, cropTotalW, cropTotalH, hue, saturation, crf, volumeDb } = accountTransformParams(accountId);
  const id = createHash("md5")
    .update(accountId + String(Date.now()))
    .digest("hex")
    .slice(0, 14);
  const inPath  = nodePath.join(os.tmpdir(), `${id}_in.mp4`);
  const outPath = nodePath.join(os.tmpdir(), `${id}_out.mp4`);

  try {
    await fs.writeFile(inPath, inputBuffer);

    // Video: crop (remove border pixels, scale back to original size) + hue/saturation + speed
    // Audio: speed (atempo) + optional volume
    // Speed variation quebra o phash por frame — mais eficaz que CRF sozinho
    const audioFilters = [`atempo=${speed}`, ...(volumeDb !== 0 ? [`volume=${volumeDb}dB`] : [])];
    const filterComplex = [
      `[0:v]crop=iw-${cropTotalW}:ih-${cropTotalH}:${cropOffX}:${cropOffY}`,
      `scale=iw+${cropTotalW}:ih+${cropTotalH}`,
      `hue=h=${hue}:s=${saturation}`,
      `setpts=PTS/${speed}[v]`,
      `;[0:a]${audioFilters.join(",")}[a]`,
    ].join(",");

    await runFfmpeg([
      "-y",
      "-ss", String(trimSec),
      "-i", inPath,
      "-filter_complex", filterComplex,
      "-map", "[v]",
      "-map", "[a]",
      "-c:v", "libx264",
      "-crf", String(crf),
      "-preset", "veryfast",
      "-profile:v", "high",
      "-level", "4.0",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-ar", "44100",
      "-b:a", "128k",
      outPath,
    ]);

    return await fs.readFile(outPath);
  } finally {
    await fs.unlink(inPath).catch(() => {});
    await fs.unlink(outPath).catch(() => {});
  }
}
