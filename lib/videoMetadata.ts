import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeInstaller from "ffprobe-static";

const ffprobePath = ffprobeInstaller.path;

export type FfprobeJson = {
  format?: {
    tags?: Record<string, string>;
    duration?: string;
    [key: string]: unknown;
  };
  streams?: Array<{ tags?: Record<string, string>; [key: string]: unknown }>;
  chapters?: unknown[];
};

/**
 * Mesmo comando pedido: cópia de streams sem reencode, sem metadados nem capítulos.
 */
export function stripVideoMetadataCopy(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const ff = ffmpegPath;
  if (!ff) {
    return Promise.reject(new Error("ffmpeg-static: binário não encontrado"));
  }

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ff, [
      "-i",
      inputPath,
      "-map_metadata",
      "-1",
      "-map_chapters",
      "-1",
      "-c:v",
      "copy",
      "-c:a",
      "copy",
      outputPath,
    ]);

    let stderr = "";
    ffmpeg.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `ffmpeg saiu com código ${code}${stderr ? `: ${stderr.slice(-500)}` : ""}`,
          ),
        );
    });
    ffmpeg.on("error", reject);
  });
}

export async function probeVideoMetadata(filePath: string): Promise<FfprobeJson> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffprobePath, [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      "-show_chapters",
      filePath,
    ]);
    let out = "";
    p.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    p.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe saiu com código ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(out) as FfprobeJson);
      } catch (e) {
        reject(e);
      }
    });
    p.on("error", reject);
  });
}

function formatTagKeys(meta: FfprobeJson): string[] {
  const tags = meta.format?.tags;
  if (!tags) return [];
  return Object.keys(tags);
}

function streamTagSummary(meta: FfprobeJson): { index: number; keys: string[] }[] {
  return (meta.streams ?? []).map((s, index) => ({
    index,
    keys: s.tags ? Object.keys(s.tags) : [],
  }));
}

/**
 * Registra no console o que foi eliminado ou reduzido após o strip.
 */
export function logMetadataStripResult(
  before: FfprobeJson,
  after: FfprobeJson,
): void {
  const bFmt = formatTagKeys(before);
  const aFmt = formatTagKeys(after);
  const removedFormatTags = bFmt.filter((k) => !aFmt.includes(k));
  const chaptersBefore = before.chapters?.length ?? 0;
  const chaptersAfter = after.chapters?.length ?? 0;

  const bStreams = streamTagSummary(before);
  const aStreams = streamTagSummary(after);
  const streamTagsRemoved: string[] = [];
  for (let i = 0; i < Math.max(bStreams.length, aStreams.length); i++) {
    const bk = bStreams[i]?.keys ?? [];
    const ak = aStreams[i]?.keys ?? [];
    const gone = bk.filter((k) => !ak.includes(k));
    if (gone.length)
      streamTagsRemoved.push(`stream[${i}]: ${gone.join(", ")}`);
  }

  console.log(
    "[stripVideoMetadata] Tags de format removidas ou ausentes após strip:",
    removedFormatTags.length ? removedFormatTags : "(nenhuma chave a mais no antes)",
  );
  console.log(
    "[stripVideoMetadata] Capítulos: antes=%s → depois=%s",
    chaptersBefore,
    chaptersAfter,
  );
  if (streamTagsRemoved.length) {
    console.log(
      "[stripVideoMetadata] Tags de stream removidas (resumo):",
      streamTagsRemoved,
    );
  }
}

export function summarizeStripDiff(before: FfprobeJson, after: FfprobeJson) {
  const bFmt = formatTagKeys(before);
  const aFmt = formatTagKeys(after);
  return {
    formatTagKeysBefore: bFmt,
    formatTagKeysAfter: aFmt,
    formatTagsRemoved: bFmt.filter((k) => !aFmt.includes(k)),
    chaptersBefore: before.chapters?.length ?? 0,
    chaptersAfter: after.chapters?.length ?? 0,
    streamTagCountsBefore: streamTagSummary(before).map((s) => ({
      index: s.index,
      count: s.keys.length,
    })),
    streamTagCountsAfter: streamTagSummary(after).map((s) => ({
      index: s.index,
      count: s.keys.length,
    })),
  };
}
