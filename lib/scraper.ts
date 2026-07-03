import { type RapidProfile, type RapidReel } from "./rapidApiScraper";
import {
  apifyScrapeProfileAndReels,
  getApifyTokensFromEnv,
} from "./apifyRotation";

export type ScraperProfile = RapidProfile;
export type ScraperReel = RapidReel;

export async function scrapeProfileAndReels(
  username: string,
  limit = 9999,
): Promise<{ profile: ScraperProfile; reels: ScraperReel[] }> {
  const tokens = getApifyTokensFromEnv();
  if (tokens.length === 0) throw new Error("Apify: APIFY_TOKENS não configurado");

  const result = await apifyScrapeProfileAndReels(username, limit);
  return { profile: result.profile, reels: result.reels };
}
