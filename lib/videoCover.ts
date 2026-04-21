import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import ffmpegPath from "ffmpeg-static";

/** Primeiro frame do vídeo como JPEG (exigido por publish.video). */
export async function extractVideoCoverJpeg(
  videoBuffer: Buffer,
): Promise<Buffer> {
  const ff = ffmpegPath;
  if (!ff) throw new Error("ffmpeg-static não encontrado");

  const tmpDir = os.tmpdir();
  const id = uuidv4();
  const inputPath = path.join(tmpDir, `igvid_${id}.mp4`);
  const outputPath = path.join(tmpDir, `igcover_${id}.jpg`);

  fs.writeFileSync(inputPath, videoBuffer);

  await new Promise<void>((resolve, reject) => {
    const p = spawn(ff, [
      "-y",
      "-i",
      inputPath,
      "-vframes",
      "1",
      "-q:v",
      "2",
      outputPath,
    ]);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com ${code}`)),
    );
    p.on("error", reject);
  });

  const cover = fs.readFileSync(outputPath);
  try {
    fs.unlinkSync(inputPath);
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(outputPath);
  } catch {
    /* ignore */
  }
  return cover;
}
