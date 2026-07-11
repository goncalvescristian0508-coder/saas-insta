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
      else reject(new Error(`FFmpeg ${code}: ${stderr.join("").slice(-800)}`));
    });
    proc.on("error", (e: Error) => { clearTimeout(timer); reject(e); });
  });
}

interface WhisperWord { word: string; start: number; end: number; }

async function transcribeAudio(audioPath: string): Promise<WhisperWord[]> {
  const audioBuffer = await fs.readFile(audioPath);
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), "audio.mp3");
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
// Uses CaptionFont.ttf (Impact) bundled in public/ — always present on Lambda.
const FONT_NAME = "Impact";

function getFontsDir(): string {
  // On Vercel Lambda: /var/task/public; locally: <cwd>/public
  return nodePath.join(process.cwd(), "public");
}

// ─── ASS subtitle generation ───────────────────────────────────────────────────
function formatAssTime(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const cs = Math.round((secs % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

// Colors: &HAABBGGRR in ASS
const PALETTE = [
  "&H00FFFFFF", // branco
  "&H0000FFFF", // amarelo
  "&H00FF00FF", // magenta
  "&H00FFFF00", // ciano
  "&H0000A5FF", // laranja
];

// PlayRes matches the actual 720p output so ASS coordinates are exact (no scaling).
function buildAssHeader(fontName: string): string {
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 720",
    "PlayResY: 1280",
    "WrapStyle: 0",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Alignment 2 = bottom-center; MarginV 100 = 100px from bottom in 1280px height
    `Style: Default,${fontName},48,&H00FFFFFF,&H0000FFFF,&H00000000,&HA0000000,-1,0,0,0,100,100,0,0,1,4,1,2,20,20,100,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");
}

interface Chunk { text: string; start: number; end: number; }

function wordsToChunks(words: WhisperWord[]): Chunk[] {
  const CHUNK = 4;
  const result: Chunk[] = [];
  for (let i = 0; i < words.length; i += CHUNK) {
    const slice = words.slice(i, i + CHUNK);
    result.push({
      text: slice.map(w => w.word.trim().toUpperCase()).join(" "),
      start: slice[0].start,
      end: slice[slice.length - 1].end,
    });
  }
  return result;
}

function generateAss(words: WhisperWord[], fontName: string): string {
  const chunks = wordsToChunks(words);
  const header = buildAssHeader(fontName);

  const dialogues = chunks.map((c, ci) => {
    const highlightIdx = ci % Math.max(c.text.split(" ").length, 1);
    const accentColor = PALETTE[(ci % (PALETTE.length - 1)) + 1];
    const wordParts = c.text.split(" ").map((w, wi) => {
      const color = wi === highlightIdx ? accentColor : "&H00FFFFFF";
      return `{\\1c${color}}${w}`;
    });
    return `Dialogue: 0,${formatAssTime(c.start)},${formatAssTime(c.end)},Default,,0,0,0,,${wordParts.join(" ")}`;
  });

  return header + "\n" + dialogues.join("\n");
}

// ─── (fallback estático removido — sem fala = marca "none", não legenda falsa) ──

// ─── main export ───────────────────────────────────────────────────────────────
export async function burnCaptionsOnVideo(
  videoPublicUrl: string,
  storagePath: string,
  libraryVideoId: string,
  fallbackText?: string,
): Promise<string | null> {
  const uid = `${Date.now().toString(36)}_${libraryVideoId.slice(-6)}`;
  const videoPath = nodePath.join(os.tmpdir(), `cap_in_${uid}.mp4`);
  const audioPath = nodePath.join(os.tmpdir(), `cap_audio_${uid}.mp3`); // re-encode MP3 — compatível com qualquer codec de entrada
  const assPath   = nodePath.join(os.tmpdir(), `cap_${uid}.ass`);
  const outPath   = nodePath.join(os.tmpdir(), `cap_out_${uid}.mp4`);

  const cleanup = () =>
    Promise.allSettled([videoPath, audioPath, assPath, outPath].map(p => fs.unlink(p).catch(() => {})));

  try {
    // 1. Download vídeo
    const res0 = await fetch(videoPublicUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res0.ok) throw new Error(`Download falhou: ${res0.status}`);
    await fs.writeFile(videoPath, Buffer.from(await res0.arrayBuffer()));

    const fontName = FONT_NAME; // Impact — bundled in public/CaptionFont.ttf

    // 2. Extrair áudio como MP3 (libmp3lame re-encode — aceita HE-AAC, VP9, qualquer codec)
    let hasAudioStream = true;
    let audioExtractErr = "";
    try {
      await runFfmpeg([
        "-i", videoPath,
        "-vn",
        "-c:a", "libmp3lame",
        "-ar", "16000",
        "-ac", "1",
        "-q:a", "5",
        "-y", audioPath,
      ]);
      const stat = await fs.stat(audioPath).catch(() => null);
      console.log("[captions] audio mp3 size:", stat?.size ?? 0, "bytes");
      if (!stat || stat.size < 500) {
        hasAudioStream = false;
        audioExtractErr = `mp3 extraído muito pequeno: ${stat?.size ?? 0} bytes`;
        console.warn("[captions]", audioExtractErr);
      }
    } catch (audioErr) {
      const msg = audioErr instanceof Error ? audioErr.message : String(audioErr);
      audioExtractErr = msg.slice(0, 300);
      if (msg.includes("does not contain any stream") || msg.includes("Invalid argument") || msg.includes("matches no streams")) {
        hasAudioStream = false;
        console.warn("[captions] sem stream de áudio em", libraryVideoId, "—", audioExtractErr);
      } else {
        throw audioErr;
      }
    }

    // 3. Transcrever com Whisper
    let assContent = "";
    if (hasAudioStream) {
      const words = await transcribeAudio(audioPath);
      console.log("[captions] whisper words:", words.length, "para", libraryVideoId);
      if (words.length === 0) {
        console.warn("[captions] 0 palavras detectadas em", libraryVideoId);
        await cleanup();
        // Throw com detalhes para o route poder diferenciar de erro de extração
        throw new Error(`SEM_FALA:0 palavras do Whisper`);
      }
      assContent = generateAss(words, fontName);
    } else {
      console.warn("[captions] sem áudio em", libraryVideoId, "—", audioExtractErr);
      throw new Error(`SEM_AUDIO:${audioExtractErr}`);
    }

    // 4. Gravar arquivo ASS
    await fs.writeFile(assPath, assContent, "utf-8");

    // 5. Queimar legendas com ASS — fontsdir aponta para public/ onde está CaptionFont.ttf
    const safeAss = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    const fontsDir = getFontsDir().replace(/\\/g, "/");
    const vf = `scale=720:-2,ass='${safeAss}':fontsdir='${fontsDir}'`;
    console.log("[captions] vf:", vf.slice(0, 200));
    console.log("[captions] fontsDir:", fontsDir);

    await runFfmpeg([
      "-i", videoPath,
      "-vf", vf,
      "-c:v", "libx264", "-crf", "30", "-preset", "ultrafast",
      "-c:a", "copy", // áudio original sempre preservado (chegou aqui = hasAudioStream=true)
      "-movflags", "+faststart",
      "-y", outPath,
    ]);

    // 6. Upload Supabase
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
