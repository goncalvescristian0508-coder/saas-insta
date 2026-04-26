import { NextResponse } from "next/server";
import { getMetaOAuthConfig, getMetaAppByKey } from "@/lib/metaInstagramEnv";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const appKey = (searchParams.get("app") || "").trim();

  let appId: string | undefined;
  let redirectUri: string;

  if (appKey) {
    const cfg = getMetaAppByKey(appKey);
    if (!cfg) {
      return NextResponse.json({ error: `App "${appKey}" não configurado.` }, { status: 400 });
    }
    appId = cfg.appId;
    redirectUri = cfg.redirectUri;
  } else {
    const cfg = getMetaOAuthConfig();
    appId = cfg.appId;
    redirectUri = cfg.redirectUri;
  }

  if (!appId || !redirectUri) {
    return NextResponse.json({ error: "META_APP_ID ou META_REDIRECT_URI não configurados." }, { status: 500 });
  }

  const scope = "instagram_business_basic,instagram_business_content_publish";
  // state encodes the appKey so the callback knows which credentials to use
  const state = appKey || "";

  const url =
    `https://api.instagram.com/oauth/authorize` +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_type=code` +
    (state ? `&state=${encodeURIComponent(state)}` : "");

  return NextResponse.redirect(url);
}
