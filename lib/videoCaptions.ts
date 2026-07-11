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
  const canExec = await fs.access(src, (fs.constants as { X_OK?: number }).X_OK ?? 1).then(() => true).catch(() => false);
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
    const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("FFmpeg timeout 120s")); }, 120_000);
    const proc = spawn(bin, args);
    const stderr: string[] = [];
    proc.stderr.on("data", (d: Buffer) => stderr.push(d.toString()));
    proc.stdout.on("data", () => {});
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg ${code}: ${stderr.join("").slice(-400)}`));
    });
    proc.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
  });
}

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

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

function formatAssTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const cs = Math.round((secs % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

// ASS colors are &HAABBGGRR
const PALETTE = [
  "&H00FFFFFF", // branco
  "&H0000FFFF", // amarelo
  "&H00FF00FF", // magenta
  "&H00FFFF00", // ciano
  "&H0000A5FF", // laranja
];

function generateAss(words: WhisperWord[]): string {
  const CHUNK = 4;
  const chunks: WhisperWord[][] = [];
  for (let i = 0; i < words.length; i += CHUNK) {
    chunks.push(words.slice(i, i + CHUNK));
  }

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "WrapStyle: 0",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Alignment 2 = bottom center. OutlineColour preto, contorno 4px, sombra suave
    "Style: Default,Arial Black,54,&H00FFFFFF,&H0000FFFF,&H00000000,&HA0000000,-1,0,0,0,100,100,0.5,0,1,4,1,2,30,30,180,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");

  const dialogues = chunks.map((chunk, ci) => {
    const start = chunk[0].start;
    const end = chunk[chunk.length - 1].end;
    // Uma palavra por chunk recebe cor de destaque (rotaciona pelo palette)
    const highlightIdx = ci % chunk.length;
    const accentColor = PALETTE[(ci % (PALETTE.length - 1)) + 1];

    const text = chunk.map((w, wi) => {
      const word = w.word.trim().toUpperCase();
      const color = wi === highlightIdx ? accentColor : "&H00FFFFFF";
      return `{\\1c${color}}${word}`;
    }).join(" ");

    return `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${text}`;
  });

  return header + "\n" + dialogues.join("\n");
}

// Generate static ASS for videos without speech — shows text chunks across video duration
function generateStaticAss(text: string, durationSecs: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  const CHUNK = 4;
  const chunks: string[][] = [];
  for (let i = 0; i < words.length; i += CHUNK) chunks.push(words.slice(i, i + CHUNK));

  const secPerChunk = Math.max(1.5, durationSecs / chunks.length);

  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "WrapStyle: 0",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Default,Arial Black,54,&H00FFFFFF,&H0000FFFF,&H00000000,&HA0000000,-1,0,0,0,100,100,0.5,0,1,4,1,2,30,30,180,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");

  const dialogues = chunks.map((chunk, ci) => {
    const start = ci * secPerChunk;
    const end   = Math.min(start + secPerChunk, durationSecs);
    const accentColor = PALETTE[(ci % (PALETTE.length - 1)) + 1];
    const highlightIdx = ci % chunk.length;
    const text = chunk.map((w, wi) => {
      const color = wi === highlightIdx ? accentColor : "&H00FFFFFF";
      return `{\\1c${color}}${w.toUpperCase()}`;
    }).join(" ");
    return `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${text}`;
  });

  return header + "\n" + dialogues.join("\n");
}

// Get video duration in seconds via ffmpeg stderr output
async function getVideoDuration(videoPath: string): Promise<number> {
  const bin = await resolveBin();
  return new Promise((resolve) => {
    const proc = spawn(bin, ["-i", videoPath]);
    const stderr: string[] = [];
    proc.stderr.on("data", (d: Buffer) => stderr.push(d.toString()));
    proc.on("close", () => {
      const match = stderr.join("").match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
      if (match) {
        resolve(parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]));
      } else {
        resolve(30); // default 30s
      }
    });
    proc.on("error", () => resolve(30));
  });
}

export async function burnCaptionsOnVideo(
  videoPublicUrl: string,
  storagePath: string,
  libraryVideoId: string,
  fallbackText?: string,
): Promise<string | null> {
  const uid = `${Date.now().toString(36)}_${libraryVideoId.slice(-6)}`;
  const videoPath = nodePath.join(os.tmpdir(), `cap_in_${uid}.mp4`);
  const audioPath = nodePath.join(os.tmpdir(), `cap_audio_${uid}.wav`);
  const assPath   = nodePath.join(os.tmpdir(), `cap_${uid}.ass`);
  const outPath   = nodePath.join(os.tmpdir(), `cap_out_${uid}.mp4`);

  const cleanup = () => Promise.allSettled([videoPath, audioPath, assPath, outPath].map(p => fs.unlink(p).catch(() => {})));

  try {
    // 1. Download vídeo
    const res = await fetch(videoPublicUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
    await fs.writeFile(videoPath, Buffer.from(await res.arrayBuffer()));

    // 2. Extrair áudio para Whisper (MP3 mono 16kHz)
    let assContent = "";
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
        console.warn("[captions] sem áudio em", libraryVideoId, "— usando texto estático");
      } else {
        throw audioErr;
      }
    }

    if (hasAudio) {
      // 3a. Transcrever com Whisper
      const words = await transcribeAudio(audioPath);
      if (words.length === 0) {
        console.warn("[captions] sem fala detectada em", libraryVideoId);
        await cleanup();
        return null;
      }
      assContent = generateAss(words);
    } else {
      // 3b. Sem áudio → usar texto estático (legenda do post ou hashtags genéricas)
      const text = fallbackText?.trim() ||
        "Incrível 🔥 Segue para mais conteúdo #viral #trending #reels #fyp #brasil";
      const duration = await getVideoDuration(videoPath);
      assContent = generateStaticAss(text, duration);
      if (!assContent) {
        await cleanup();
        return null;
      }
    }

    // 4. Gerar arquivo ASS
    await fs.writeFile(assPath, assContent, "utf-8");

    // 5. Queimar legendas no vídeo
    const safeAss = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    await runFfmpeg([
      "-i", videoPath,
      "-vf", `ass='${safeAss}'`,
      "-c:v", "libx264", "-crf", "22", "-preset", "fast",
      "-c:a", hasAudio ? "copy" : "an",
      "-movflags", "+faststart",
      "-y", outPath,
    ]);

    // 6. Upload para Supabase
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
