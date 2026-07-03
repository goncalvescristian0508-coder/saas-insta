import { rapidScrapeProfileAndReels, type RapidProfile, type RapidReel } from "./rapidApiScraper";
import {
  apifyScrapeProfileAndReels,
  ApifyTokensNotConfiguredError,
  ApifyAllTokensExhaustedError,
} from "./apifyRotation";
import { hikerScrapeProfileAndReels } from "./hikerApiScraper";

export type ScraperProfile = RapidProfile;
export type ScraperReel = RapidReel;

/**
 * Scrapes an Instagram profile and its reels using a fallback chain:
 * 1. RapidAPI (fastest, no per-call cost)
 * 2. Apify (token rotation, slower startup)
 * 3. HikerAPI (last resort)
 */
export async function scrapeProfileAndReels(
  username: string,
  limit = 9999,
  maxPages = 30,
): Promise<{ profile: ScraperProfile; reels: ScraperReel[] }> {
  const errors: string[] = [];

  // 1. RapidAPI
  if (process.env.RAPIDAPI_KEY) {
    try {
      const result = await rapidScrapeProfileAndReels(username, limit, maxPages);
      if (result.reels.length > 0) return result;
      console.log("[scraper] RapidAPI: 0 reels — tentando Apify...");
      errors.push("RapidAPI: 0 reels encontrados");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[scraper] RapidAPI falhou:", msg);
      errors.push(`RapidAPI: ${msg}`);
    }
  }

  // 2. Apify
  const apifyTokens = (process.env.APIFY_TOKENS ?? process.env.APIFY_TOKEN ?? "")
    .split(",").map((t) => t.trim()).filter(Boolean);
  if (apifyTokens.length > 0) {
    try {
      const result = await apifyScrapeProfileAndReels(username, limit);
      if (result.reels.length > 0) {
        return {
          profile: result.profile,
          reels: result.reels,
        };
      }
      console.log("[scraper] Apify: 0 reels — tentando HikerAPI...");
      errors.push("Apify: 0 reels encontrados");
    } catch (err) {
      if (err instanceof ApifyTokensNotConfiguredError || err instanceof ApifyAllTokensExhaustedError) {
        errors.push(`Apify: ${err.message}`);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[scraper] Apify falhou:", msg);
        errors.push(`Apify: ${msg}`);
      }
    }
  } else {
    errors.push("Apify: APIFY_TOKENS não configurado");
  }

  // 3. HikerAPI
  if (process.env.HIKERAPI_KEY) {
    try {
      const result = await hikerScrapeProfileAndReels(username, limit);
      return {
        profile: result.profile,
        reels: result.reels,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[scraper] HikerAPI falhou:", msg);
      errors.push(`HikerAPI: ${msg}`);
    }
  } else {
    errors.push("HikerAPI: HIKERAPI_KEY não configurado");
  }

  throw new Error(`Todos os scrapers falharam: ${errors.join(" | ")}`);
}
