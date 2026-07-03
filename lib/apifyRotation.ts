import { prisma } from "@/lib/prisma";

export const APIFY_SERVICE_UNAVAILABLE = "Serviço temporariamente indisponível";

const APIFY_BASE = "https://api.apify.com/v2";
const DB_KEY = "apify_exhausted_tokens";

let cachedExhausted: Set<string> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("db-timeout")), ms)),
  ]);
}

export async function loadExhaustedTokens(): Promise<Set<string>> {
  if (cachedExhausted !== null) return cachedExhausted;
  try {
    const row = await withTimeout(
      prisma.appSetting.findUnique({ where: { key: DB_KEY } }),
      3000,
    );
    const tokens: string[] = row ? JSON.parse(row.value) : [];
    cachedExhausted = new Set(tokens);
  } catch {
    cachedExhausted = new Set();
  }
  return cachedExhausted;
}

export async function persistExhaustedToken(token: string): Promise<void> {
  const set = await loadExhaustedTokens();
  set.add(token);
  try {
    await withTimeout(
      prisma.appSetting.upsert({
        where: { key: DB_KEY },
        create: { key: DB_KEY, value: JSON.stringify([...set]) },
        update: { value: JSON.stringify([...set]) },
      }),
      3000,
    );
  } catch {
    /* falha silenciosa — in-memory ainda funciona */
  }
}

export async function clearExhaustedApifyTokens(): Promise<void> {
  cachedExhausted = new Set();
  try {
    await prisma.appSetting.deleteMany({ where: { key: DB_KEY } });
  } catch { /* ignore */ }
}

export class ApifyAllTokensExhaustedError extends Error {
  constructor() {
    super(APIFY_SERVICE_UNAVAILABLE);
    this.name = "ApifyAllTokensExhaustedError";
  }
}

export class ApifyTokensNotConfiguredError extends Error {
  constructor() {
    super("APIFY_TOKENS não configurada");
    this.name = "ApifyTokensNotConfiguredError";
  }
}

export function getApifyTokensFromEnv(): string[] {
  const raw = process.env.APIFY_TOKENS ?? process.env.APIFY_TOKEN ?? "";
  const extra = process.env.APIFY_TOKEN_EXTRA ?? "";
  return [raw, extra]
    .join(",")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function isQuotaOrBillingError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  // Erros de memória são transitórios — não marcar o token como esgotado
  if (msg.includes("memory limit") || msg.includes("exceed the memory") || msg.includes("16384")) {
    return false;
  }
  const hints = [
    "billing", "quota", "limit exceeded", "usage limit", "credit",
    "payment required", "insufficient", "out of credits", "plan limit",
    "subscribe", "monthly", "exceeded your", "no credits",
  ];
  if (hints.some((h) => msg.includes(h))) return true;
  if (typeof err === "object" && err !== null) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) return true;
    const code = (err as { code?: string }).code;
    if (code === "APIFY_MONTHLY_CAP") return true;
  }
  return false;
}

// ── Helpers para status de run individual ────────────────────────────────────

async function apifyGetRunStatus(
  token: string,
  runId: string,
): Promise<{ status: string; defaultDatasetId: string }> {
  const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json() as {
    data?: { status?: string; defaultDatasetId?: string };
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`Apify run status: ${json.error?.message ?? `HTTP ${res.status}`}`);
  return {
    status: json.data?.status ?? "UNKNOWN",
    defaultDatasetId: json.data?.defaultDatasetId ?? "",
  };
}

/** Inicia os dois actors e retorna os run IDs imediatamente (sem aguardar). */
export async function apifyStartScrapeRuns(
  username: string,
  limit: number,
): Promise<{ profileRunId: string; reelRunId: string }> {
  const tokens = getApifyTokensFromEnv();
  if (tokens.length === 0) throw new ApifyTokensNotConfiguredError();
  const token = tokens[0];

  const [profileRunId, reelRunId] = await Promise.all([
    apifyStartRun(token, "apify~instagram-profile-scraper", { usernames: [username] }),
    apifyStartRun(token, "apify~instagram-reel-scraper", {
      username: [username],
      resultsLimit: limit,
    }),
  ]);

  return { profileRunId, reelRunId };
}

/** Verifica se os runs terminaram; se sim, retorna os resultados parseados. */
export async function apifyPollScrapeRuns(
  profileRunId: string,
  reelRunId: string,
  username: string,
  limit: number,
): Promise<
  | { done: true; profile: ApifyScraperProfile; reels: ApifyScraperReel[] }
  | { done: false; runStatus: string }
> {
  const tokens = getApifyTokensFromEnv();
  if (tokens.length === 0) throw new ApifyTokensNotConfiguredError();
  const token = tokens[0];

  const [prof, reel] = await Promise.all([
    apifyGetRunStatus(token, profileRunId),
    apifyGetRunStatus(token, reelRunId),
  ]);

  const terminal = ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"];
  if (prof.status === "FAILED" || prof.status === "ABORTED") throw new Error(`Apify profile run: ${prof.status}`);
  if (reel.status === "FAILED" || reel.status === "ABORTED") throw new Error(`Apify reel run: ${reel.status}`);

  if (!terminal.includes(prof.status) || !terminal.includes(reel.status)) {
    return { done: false, runStatus: `${prof.status}/${reel.status}` };
  }

  const [profileItems, reelItems] = await Promise.all([
    apifyGetDataset(token, prof.defaultDatasetId),
    apifyGetDataset(token, reel.defaultDatasetId),
  ]);

  const p = (profileItems[0] ?? {}) as Record<string, unknown>;
  const id = String(p.id ?? p.pk ?? p.igId ?? p.userId ?? "");
  if (!id) throw new Error(`Apify: perfil não encontrado para @${username}`);

  const profile: ApifyScraperProfile = {
    id,
    username: String(p.username ?? username),
    fullName: String(p.fullName ?? p.full_name ?? ""),
    biography: String(p.biography ?? p.bio ?? ""),
    profilePicUrl: String(p.profilePicUrlHD ?? p.profilePicUrl ?? p.profile_pic_url ?? ""),
    followersCount: Number(p.followersCount ?? p.followers_count ?? p.followers ?? 0),
  };

  const reels: ApifyScraperReel[] = reelItems
    .filter((i) => !!(i.videoUrl ?? i.video_url))
    .slice(0, limit)
    .map((i) => {
      const images = Array.isArray(i.images) ? (i.images as string[]) : [];
      return {
        shortCode: String(i.shortCode ?? i.code ?? i.shortcode ?? ""),
        caption: String(i.caption ?? ""),
        videoUrl: String(i.videoUrl ?? i.video_url ?? ""),
        thumbnailUrl: images[0] ?? String(i.thumbnailUrl ?? i.displayUrl ?? i.thumbnail_url ?? ""),
        likes: Number(i.likesCount ?? i.like_count ?? 0),
        comments: Number(i.commentsCount ?? i.comment_count ?? 0),
        views: Number(i.viewsCount ?? i.videoViewCount ?? i.view_count ?? i.video_view_count ?? 0),
        timestamp: String(i.timestamp ?? ""),
      };
    });

  return { done: true, profile, reels };
}

// ── REST API helpers (sem dependência do apify-client SDK) ───────────────────

async function apifyStartRun(
  token: string,
  actorSlug: string,
  input: object,
): Promise<string> {
  const res = await fetch(`${APIFY_BASE}/acts/${actorSlug}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await res.json() as { data?: { id?: string }; error?: { message?: string } };
  if (!res.ok) {
    const msg = json.error?.message ?? `HTTP ${res.status}`;
    const e = Object.assign(new Error(`Apify start run: ${msg}`), { statusCode: res.status });
    throw e;
  }
  const runId = json.data?.id;
  if (!runId) throw new Error("Apify: run ID não retornado");
  return runId;
}

async function apifyWaitRun(
  token: string,
  runId: string,
  maxMs = 270_000, // 4.5 min — deixa 30s para o catch() rodar antes do Vercel cortar (limite 300s)
): Promise<string> {
  const deadline = maxMs > 0 ? Date.now() + maxMs : Infinity;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`, {
      signal: AbortSignal.timeout(15_000),
    });
    const json = await res.json() as {
      data?: { status?: string; defaultDatasetId?: string };
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(`Apify poll: ${json.error?.message ?? `HTTP ${res.status}`}`);
    const status = json.data?.status;
    if (status === "SUCCEEDED") return json.data?.defaultDatasetId ?? "";
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Apify run encerrado com status: ${status}`);
    }
  }
  throw new Error("Apify: timeout aguardando run completar");
}

async function apifyGetDataset(
  token: string,
  datasetId: string,
): Promise<Record<string, unknown>[]> {
  const res = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&format=json`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!res.ok) throw new Error(`Apify dataset: HTTP ${res.status}`);
  return res.json() as Promise<Record<string, unknown>[]>;
}

// ── Interfaces públicas ───────────────────────────────────────────────────────

export interface ApifyScraperProfile {
  id: string;
  username: string;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  followersCount: number;
}

export interface ApifyScraperReel {
  shortCode: string;
  caption: string;
  videoUrl: string;
  thumbnailUrl: string;
  likes: number;
  comments: number;
  views: number;
  timestamp: string;
}

export async function apifyScrapeProfileAndReels(
  username: string,
  limit = 9999,
): Promise<{ profile: ApifyScraperProfile; reels: ApifyScraperReel[] }> {
  const configured = getApifyTokensFromEnv();
  if (configured.length === 0) throw new ApifyTokensNotConfiguredError();

  const exhausted = await loadExhaustedTokens();
  const tokens = configured.filter((t) => !exhausted.has(t));
  if (tokens.length === 0) throw new ApifyAllTokensExhaustedError();

  let lastError: Error | null = null;

  for (const token of tokens) {
    try {
      // Inicia os dois actors em paralelo
      // profile-scraper: campo "usernames" (plural, array)
      // reel-scraper:    campo "username"  (singular, array)
      const [profileRunId, reelRunId] = await Promise.all([
        apifyStartRun(token, "apify~instagram-profile-scraper", { usernames: [username] }),
        apifyStartRun(token, "apify~instagram-reel-scraper", {
          username: [username],
          resultsLimit: limit,
        }),
      ]);

      // Aguarda ambos terminarem sem limite de tempo
      const [profileDatasetId, reelDatasetId] = await Promise.all([
        apifyWaitRun(token, profileRunId),
        apifyWaitRun(token, reelRunId),
      ]);

      // Busca os resultados
      const [profileItems, reelItems] = await Promise.all([
        apifyGetDataset(token, profileDatasetId),
        apifyGetDataset(token, reelDatasetId),
      ]);

      // Parse do perfil
      const p = (profileItems[0] ?? {}) as Record<string, unknown>;
      const id = String(p.id ?? p.pk ?? p.igId ?? p.userId ?? "");
      if (!id) throw new Error(`Apify: perfil não encontrado para @${username}`);

      const profile: ApifyScraperProfile = {
        id,
        username: String(p.username ?? username),
        fullName: String(p.fullName ?? p.full_name ?? ""),
        biography: String(p.biography ?? p.bio ?? ""),
        profilePicUrl: String(p.profilePicUrlHD ?? p.profilePicUrl ?? p.profile_pic_url ?? ""),
        followersCount: Number(p.followersCount ?? p.followers_count ?? p.followers ?? 0),
      };

      // Parse dos reels (aceita camelCase e snake_case)
      const reels: ApifyScraperReel[] = reelItems
        .filter((i) => !!(i.videoUrl ?? i.video_url))
        .slice(0, limit)
        .map((i) => {
          const images = Array.isArray(i.images) ? (i.images as string[]) : [];
          return {
            shortCode: String(i.shortCode ?? i.code ?? i.shortcode ?? ""),
            caption: String(i.caption ?? ""),
            videoUrl: String(i.videoUrl ?? i.video_url ?? ""),
            thumbnailUrl:
              images[0] ?? String(i.thumbnailUrl ?? i.displayUrl ?? i.thumbnail_url ?? ""),
            likes: Number(i.likesCount ?? i.like_count ?? 0),
            comments: Number(i.commentsCount ?? i.comment_count ?? 0),
            views: Number(
              i.viewsCount ?? i.videoViewCount ?? i.view_count ?? i.video_view_count ?? 0,
            ),
            timestamp: String(i.timestamp ?? ""),
          };
        });

      console.log(`[apify] @${username}: ${reels.length} reels`);
      return { profile, reels };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (isQuotaOrBillingError(err)) {
        await persistExhaustedToken(token);
        console.warn("[apifyRotation] token esgotado, tentando próximo:", errorMessage(err));
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new ApifyAllTokensExhaustedError();
}
