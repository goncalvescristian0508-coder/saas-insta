import { ApifyClient, ApifyApiError } from "apify-client";
import { prisma } from "@/lib/prisma";

export const APIFY_SERVICE_UNAVAILABLE =
  "Serviço temporariamente indisponível";

const ACTORS_PREFLIGHT = [
  "apify/instagram-reel-scraper",
  "apify/instagram-profile-scraper",
] as const;

const DB_KEY = "apify_exhausted_tokens";

/** In-memory cache to avoid DB reads on every call within the same process. */
let cachedExhausted: Set<string> | null = null;

async function loadExhaustedTokens(): Promise<Set<string>> {
  if (cachedExhausted !== null) return cachedExhausted;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: DB_KEY } });
    const tokens: string[] = row ? JSON.parse(row.value) : [];
    cachedExhausted = new Set(tokens);
  } catch {
    cachedExhausted = new Set();
  }
  return cachedExhausted;
}

async function persistExhaustedToken(token: string): Promise<void> {
  const set = await loadExhaustedTokens();
  set.add(token);
  try {
    await prisma.appSetting.upsert({
      where: { key: DB_KEY },
      create: { key: DB_KEY, value: JSON.stringify([...set]) },
      update: { value: JSON.stringify([...set]) },
    });
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
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function isMonthlyCapError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "APIFY_MONTHLY_CAP"
  );
}

export function isQuotaOrBillingError(err: unknown): boolean {
  if (isMonthlyCapError(err)) return true;

  const msg = errorMessage(err).toLowerCase();
  const hints = [
    "billing",
    "quota",
    "limit exceeded",
    "usage limit",
    "credit",
    "payment required",
    "insufficient",
    "out of credits",
    "plan limit",
    "subscribe",
    "monthly",
    "exceeded your",
    "no credits",
  ];
  if (hints.some((h) => msg.includes(h))) return true;

  if (err instanceof ApifyApiError) {
    const code = err.statusCode;
    if (code === 402 || code === 429) return true;
    const t = (err.type ?? "").toLowerCase();
    if (
      t.includes("limit") ||
      t.includes("quota") ||
      t.includes("billing") ||
      t.includes("usage")
    ) {
      return true;
    }
  }
  return false;
}

function shouldTryNextToken(err: unknown): boolean {
  if (isQuotaOrBillingError(err)) return true;
  if (err instanceof ApifyApiError && err.statusCode === 401) return true;

  const msg = errorMessage(err).toLowerCase();
  if (
    msg.includes("unauthorized") ||
    msg.includes("invalid token") ||
    msg.includes("access denied")
  ) {
    return true;
  }
  return false;
}

type LimitsPayload = NonNullable<
  Awaited<ReturnType<ReturnType<ApifyClient["user"]>["limits"]>>
>;

function assertMonthlyHeadroom(limits: LimitsPayload): void {
  const max = limits.limits.maxMonthlyUsageUsd;
  if (max > 0 && limits.current.monthlyUsageUsd >= max) {
    const e = new Error("Monthly usage limit reached");
    (e as Error & { code?: string }).code = "APIFY_MONTHLY_CAP";
    throw e;
  }
}

export async function preflightApifyToken(client: ApifyClient): Promise<void> {
  await client.user().get();

  const lim = await client.user().limits();
  if (lim) assertMonthlyHeadroom(lim);

  await Promise.all(
    ACTORS_PREFLIGHT.map(async (id) => {
      const actor = await client.actor(id).get();
      if (!actor) throw new Error(`Actor não encontrado: ${id}`);
    }),
  );
}

/**
 * Executa uma operação com o primeiro token válido disponível.
 * Tokens esgotados são persistidos no banco para sobreviver a cold starts.
 */
export async function runWithApifyRotation<T>(
  operation: (client: ApifyClient) => Promise<T>,
): Promise<T> {
  const configured = getApifyTokensFromEnv();
  if (configured.length === 0) {
    throw new ApifyTokensNotConfiguredError();
  }

  const exhausted = await loadExhaustedTokens();
  const tokens = configured.filter((t) => !exhausted.has(t));

  if (tokens.length === 0) {
    throw new ApifyAllTokensExhaustedError();
  }

  let lastError: unknown;

  for (const token of tokens) {
    const client = new ApifyClient({ token });
    try {
      await preflightApifyToken(client);
      return await operation(client);
    } catch (err) {
      lastError = err;
      if (shouldTryNextToken(err)) {
        await persistExhaustedToken(token);
        console.warn(
          "[apifyRotation] token esgotado, persistindo e tentando próximo…",
          errorMessage(err),
        );
        continue;
      }
      throw err;
    }
  }

  console.error("[apifyRotation] todos os tokens falharam:", lastError);
  throw new ApifyAllTokensExhaustedError();
}
