import { type RapidProfile, type RapidReel } from "./rapidApiScraper";
import {
  apifyScrapeProfileAndReels,
  getApifyTokensFromEnv,
} from "./apifyRotation";
import { prisma } from "./prisma";

export type ScraperProfile = RapidProfile;
export type ScraperReel = RapidReel;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

function cacheKey(username: string) {
  return `scraper_cache_${username.toLowerCase()}`;
}

export async function getCached(username: string): Promise<{ profile: ScraperProfile; reels: ScraperReel[] } | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: cacheKey(username) } });
    if (!row) return null;
    const data = JSON.parse(row.value) as { profile: ScraperProfile; reels: ScraperReel[]; cachedAt: number };
    if (Date.now() - data.cachedAt > CACHE_TTL_MS) return null;
    return { profile: data.profile, reels: data.reels };
  } catch {
    return null;
  }
}

export async function saveScraperCache(username: string, profile: ScraperProfile, reels: ScraperReel[]): Promise<void> {
  try {
    const value = JSON.stringify({ profile, reels, cachedAt: Date.now() });
    await prisma.appSetting.upsert({
      where: { key: cacheKey(username) },
      create: { key: cacheKey(username), value },
      update: { value },
    });
  } catch { /* silent */ }
}

/**
 * Busca perfil + reels. Usa cache de 6h para evitar chamadas repetidas ao Apify.
 * Sempre busca todos os reels do perfil (9999) e salva no cache — retorna slice(0, limit).
 */
export async function scrapeProfileAndReels(
  username: string,
  limit = 9999,
): Promise<{ profile: ScraperProfile; reels: ScraperReel[] }> {
  // Cache hit → retorna imediatamente sem custo
  const cached = await getCached(username);
  if (cached) {
    console.log(`[scraper] cache hit @${username}: ${cached.reels.length} reels`);
    return { profile: cached.profile, reels: cached.reels.slice(0, limit) };
  }

  // Cache miss → busca todos do Apify e salva
  const tokens = getApifyTokensFromEnv();
  if (tokens.length === 0) throw new Error("Apify: APIFY_TOKENS não configurado");

  console.log(`[scraper] cache miss @${username} — buscando todos os reels via Apify`);
  const result = await apifyScrapeProfileAndReels(username, 9999);

  // Salva tudo em cache (não usa await para não bloquear o return)
  void saveScraperCache(username, result.profile, result.reels);

  return { profile: result.profile, reels: result.reels.slice(0, limit) };
}

/** Limpa o cache de um perfil (força novo fetch na próxima chamada). */
export async function clearScraperCache(username: string): Promise<void> {
  try {
    await prisma.appSetting.deleteMany({ where: { key: cacheKey(username) } });
  } catch { /* silent */ }
}
