import { NextResponse } from "next/server";
import { getMetaOAuthConfig } from "@/lib/metaInstagramEnv";

/**
 * Inicia o Instagram Login em api.instagram.com (não graph.facebook.com).
 */
export async function GET() {
  const { appId } = getMetaOAuthConfig();
  const redirectUri = "https://saas-insta.vercel.app/api/instagram/oauth/callback";
  const base = "https://saas-insta.vercel.app";

  if (!appId) {
    return NextResponse.redirect(`${base}/accounts?error=oauth_config`);
  }

  const scope =
    "instagram_business_basic,instagram_business_content_publish";
  const url =
    `https://www.instagram.com/oauth/authorize` +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_type=code`;
  return NextResponse.redirect(url);
}
