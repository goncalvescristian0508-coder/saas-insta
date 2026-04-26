/**
 * Instagram Login (api.instagram.com) — variáveis esperadas no .env.local
 *
 * Multi-app: configure META_APP_1_ID, META_APP_1_SECRET, META_APP_1_NAME
 *                       META_APP_2_ID, META_APP_2_SECRET, META_APP_2_NAME  ...
 * O app padrão continua sendo META_APP_ID / META_APP_SECRET.
 */

export type MetaAppConfig = {
  key: string;
  name: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
  publicBaseUrl: string;
};

export function getMetaOAuthConfig(): {
  appId: string | undefined;
  appSecret: string | undefined;
  redirectUri: string;
  publicBaseUrl: string;
} {
  const appId = (process.env.META_APP_ID || "").trim() || undefined;

  const appSecret = (
    process.env.META_APP_SECRET ||
    process.env.INSTAGRAM_APP_SECRET ||
    ""
  ).trim() || undefined;

  const publicBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const redirectUri = (process.env.META_REDIRECT_URI || "").trim();

  return { appId, appSecret, redirectUri, publicBaseUrl };
}

export function getMetaAppByKey(key: string): MetaAppConfig | null {
  const appId = (process.env[`META_APP_${key}_ID`] || "").trim();
  const appSecret = (process.env[`META_APP_${key}_SECRET`] || "").trim();
  const name = (process.env[`META_APP_${key}_NAME`] || `App ${key}`).trim();
  const redirectUri = (process.env.META_REDIRECT_URI || "").trim();
  const publicBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  if (!appId || !appSecret) return null;
  return { key, name, appId, appSecret, redirectUri, publicBaseUrl };
}

export function listMetaApps(): Array<{ key: string; name: string; appId: string }> {
  const apps: Array<{ key: string; name: string; appId: string }> = [];
  for (let i = 1; i <= 10; i++) {
    const appId = (process.env[`META_APP_${i}_ID`] || "").trim();
    const name = (process.env[`META_APP_${i}_NAME`] || `App ${i}`).trim();
    if (appId) apps.push({ key: String(i), name, appId });
  }
  return apps;
}
