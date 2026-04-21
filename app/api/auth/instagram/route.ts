import { NextResponse } from "next/server";
import { getMetaOAuthConfig } from "@/lib/metaInstagramEnv";

/**
 * Inicia o Instagram Login em api.instagram.com (não graph.facebook.com).
 */
export async function GET() {
  const { appId, redirectUri } = getMetaOAuthConfig();
  console.log("=== AUTH START ===");
  console.log("redirect_uri enviado para Instagram:", redirectUri);
  console.log("APP_ID usado:", appId);
  console.log("REDIRECT_URI usado:", redirectUri);
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  if (!appId || !redirectUri) {
    return NextResponse.redirect(
      `${base}/accounts?error=oauth_config`,
    );
  }

  const scope =
    "instagram_business_basic,instagram_business_content_publish";
  const url =
    `https://api.instagram.com/oauth/authorize` +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_type=code`;
  return NextResponse.redirect(url);
}
