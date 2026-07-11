import ffmpegStaticPath from "ffmpeg-static";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import * as nodePath from "path";
import * as os from "os";
import { createClient } from "@supabase/supabase-js";

function storageAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

let cachedBin: string | null = null;

async function resolveBin(): Promise<string> {
  if (cachedBin) return cachedBin;
  const src = ffmpegStaticPath as string | null;
  if (!src) throw new Error("ffmpeg-static: binário não encontrado");
  const canExec = await fs
    .access(src, (fs.constants as { X_OK?: number }).X_OK ?? 1)
    .then(() => true)
    .catch(() => false);
  if (canExec) { cachedBin = src; return src; }
  const dst = nodePath.join(os.tmpdir(), "ffmpeg-cap-bin");
  await fs.copyFile(src, dst);
  await fs.chmod(dst, 0o755);
  cachedBin = dst;
  return dst;
}

async function runFfmpeg(args: string[]): Promise<void> {
  const bin = await resolveBin();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => { proc.kill("SIGKILL"); reject(new Error("FFmpeg timeout 240s")); },
      240_000,
    );
    const proc = spawn(bin, args);
    const stderr: string[] = [];
    proc.stderr.on("data", (d: Buffer) => stderr.push(d.toString()));
    proc.stdout.on("data", () => {});
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg ${code}: ${stderr.join("").slice(-600)}`));
    });
    proc.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
  });
}

interface WhisperWord { word: string; start: number; end: number; }

async function transcribeAudio(audioPath: string): Promise<WhisperWord[]> {
  const audioBuffer = await fs.readFile(audioPath);
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: "audio/wav" }), "audio.wav");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("language", "pt");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) throw new Error(`Whisper API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { words?: WhisperWord[] };
  return data.words ?? [];
}

// ─── font management ───────────────────────────────────────────────────────────
// Uses Roboto Bold downloaded from Google Fonts on first run.
// Falls back to FFmpeg built-in monospace if download fails.
let cachedFontPath: string | undefined = undefined;

async function getFontPath(): Promise<string | null> {
  if (cachedFontPath !== undefined) return cachedFontPath || null;
  const fontPath = nodePath.join(os.tmpdir(), "caption-font.ttf");
  const exists = await fs.access(fontPath).then(() => true).catch(() => false);
  if (exists) { cachedFontPath = fontPath; return fontPath; }
  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/google/fonts/main/apache/roboto/static/Roboto-Bold.ttf",
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fs.writeFile(fontPath, Buffer.from(await res.arrayBuffer()));
    cachedFontPath = fontPath;
    return fontPath;
  } catch (e) {
    console.warn("[captions] download de fonte falhou, sem fonte explícita:", e);
    cachedFontPath = "";
    return null;
  }
}

// ─── subtitle chunks ───────────────────────────────────────────────────────────
interface Chunk { text: string; start: number; end: number; }

const WORDS_PER_CHUNK = 4;

function wordsToChunks(words: WhisperWord[]): Chunk[] {
  const result: Chunk[] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
    const slice = words.slice(i, i + WORDS_PER_CHUNK);
    result.push({
      text: slice.map(w => w.word.trim().toUpperCase()).join(" "),
      start: slice[0].start,
      end: slice[slice.length - 1].end,
    });
  }
  return result;
}

function staticChunks(text: string, durationSecs: number): Chunk[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const groups: string[][] = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
    groups.push(words.slice(i, i + WORDS_PER_CHUNK));
  }
  const secPer = Math.max(1.5, durationSecs / Math.max(groups.length, 1));
  return groups.map((g, i) => ({
    text: g.map(w => w.toUpperCase()).join(" "),
    start: i * secPer,
    end: Math.min((i + 1) * secPer, durationSecs),
  }));
}

// ─── drawtext filter builder ───────────────────────────────────────────────────
// Escapes a string to use as drawtext text='...' value (inside single quotes).
// Only ' and % are special inside single-quoted drawtext text.
function dtText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "’")   // curly quote — looks identical, no escape needed
    .replace(/:/g, "∶")   // ratio colon — looks identical, no escape needed
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/%/g, "%%");
}

// Escapes a file path for use as drawtext fontfile='...' value.
function dtPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

// Colors alternate per chunk for a TikTok-style look.
const COLORS = ["white", "yellow", "cyan", "white", "yellow", "white", "cyan"];

function buildVf(chunks: Chunk[], fontPath: string | null): string {
  if (chunks.length === 0) return "scale=720:-2";

  const drawFilters = chunks.map((c, i) => {
    const color = COLORS[i % COLORS.length];
    const opts: string[] = [];
    if (fontPath) opts.push(`fontfile='${dtPath(fontPath)}'`);
    opts.push(`text='${dtText(c.text)}'`);
    // Commas inside enable='...' are safe — single-quoted in FFmpeg filter parser.
    opts.push(`enable='between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})'`);
    opts.push("fontsize=36");
    opts.push(`fontcolor=${color}`);
    opts.push("bordercolor=black@0.95");
    opts.push("borderw=3");
    opts.push("x=(w-text_w)/2");
    opts.push("y=h-130");
    return `drawtext=${opts.join(":")}`;
  });

  return `scale=720:-2,${drawFilters.join(",")}`;
}

// ─── video duration helper ─────────────────────────────────────────────────────
async function getVideoDuration(videoPath: string): Promise<number> {
  const bin = await resolveBin();
  return new Promise((resolve) => {
    const proc = spawn(bin, ["-i", videoPath]);
    const stderr: string[] = [];
    proc.stderr.on("data", (d: Buffer) => stderr.push(d.toString()));
    proc.on("close", () => {
      const m = stderr.join("").match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
      resolve(m ? parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]) : 30);
    });
    proc.on("error", () => resolve(30));
  });
}

// ─── main export ───────────────────────────────────────────────────────────────
export async function burnCaptionsOnVideo(
  videoPublicUrl: string,
  storagePath: string,
  libraryVideoId: string,
  fallbackText?: string,
): Promise<string | null> {
  const uid = `${Date.now().toString(36)}_${libraryVideoId.slice(-6)}`;
  const videoPath = nodePath.join(os.tmpdir(), `cap_in_${uid}.mp4`);
  const audioPath = nodePath.join(os.tmpdir(), `cap_audio_${uid}.wav`);
  const outPath   = nodePath.join(os.tmpdir(), `cap_out_${uid}.mp4`);

  const cleanup = () =>
    Promise.allSettled([videoPath, audioPath, outPath].map(p => fs.unlink(p).catch(() => {})));

  try {
    // 1. Download font + vídeo em paralelo
    const [fontPath] = await Promise.all([
      getFontPath(),
      (async () => {
        const res = await fetch(videoPublicUrl, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
        await fs.writeFile(videoPath, Buffer.from(await res.arrayBuffer()));
      })(),
    ]);

    // 2. Extrair áudio (pcm_s16le — sempre disponível no ffmpeg-static)
    let hasAudio = true;
    try {
      await runFfmpeg([
        "-i", videoPath,
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
        "-y", audioPath,
      ]);
    } catch (audioErr) {
      const msg = audioErr instanceof Error ? audioErr.message : String(audioErr);
      if (msg.includes("does not contain any stream") || msg.includes("Invalid argument")) {
        hasAudio = false;
        console.warn("[captions] sem stream de áudio em", libraryVideoId);
      } else {
        throw audioErr;
      }
    }

    // 3. Transcrever / gerar chunks
    let chunks: Chunk[];
    if (hasAudio) {
      const words = await transcribeAudio(audioPath);
      if (words.length === 0) {
        console.warn("[captions] sem fala detectada em", libraryVideoId);
        await cleanup();
        return null;
      }
      chunks = wordsToChunks(words);
    } else {
      const text = fallbackText?.trim() ||
        "Incrível segue para mais conteúdo viral trending reels fyp brasil";
      const duration = await getVideoDuration(videoPath);
      chunks = staticChunks(text, duration);
      if (chunks.length === 0) { await cleanup(); return null; }
    }

    // 4. Queimar legendas com drawtext (sem dependência de fontes do sistema)
    const vf = buildVf(chunks, fontPath);
    console.log("[captions] vf filter:", vf.slice(0, 200));

    await runFfmpeg([
      "-i", videoPath,
      "-vf", vf,
      "-c:v", "libx264", "-crf", "30", "-preset", "ultrafast",
      "-c:a", hasAudio ? "copy" : "an",
      "-movflags", "+faststart",
      "-y", outPath,
    ]);

    // 5. Upload Supabase
    const captionedPath = storagePath.replace(/\.mp4$/i, "_cap.mp4");
    const outBuf = await fs.readFile(outPath);
    const admin = storageAdmin();
    const { error } = await admin.storage
      .from("library-videos")
      .upload(captionedPath, outBuf, { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`Supabase upload: ${error.message}`);

    const { data: pub } = admin.storage.from("library-videos").getPublicUrl(captionedPath);
    await cleanup();
    return pub.publicUrl;
  } catch (err) {
    await cleanup();
    throw err;
  }
}
