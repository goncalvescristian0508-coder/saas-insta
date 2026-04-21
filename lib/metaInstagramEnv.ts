/**
 * Instagram Login (api.instagram.com) — variáveis esperadas no .env.local
 */
export function getMetaOAuthConfig(): {
  appId: string | undefined;
  appSecret: string | undefined;
  redirectUri: string;
  publicBaseUrl: string;
} {
  const appId = process.env.META_APP_ID;
  
  const appSecret =
    process.env.META_APP_SECRET ||
    process.env.INSTAGRAM_APP_SECRET;

  const publicBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  const redirectUri = (process.env.META_REDIRECT_URI || "").trim();

  return { appId, appSecret, redirectUri, publicBaseUrl };
}