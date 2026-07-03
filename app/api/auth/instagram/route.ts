import { NextResponse } from "next/server";
import { getMetaOAuthConfig, getMetaAppByKey, getInstagramOAuthBase } from "@/lib/metaInstagramEnv";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let appKey = (searchParams.get("app") || "").trim();

  // If no app key in query, use the one assigned to this user by the admin
  if (!appKey) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const assignedKey = user?.app_metadata?.metaAppKey as string | undefined;
    if (assignedKey) appKey = assignedKey;
  }

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

  const scope = "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights";
  // state encodes the appKey so the callback knows which credentials to use
  const state = appKey || "";

  const url =
    getInstagramOAuthBase(appKey) +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_type=code` +
    (state ? `&state=${encodeURIComponent(state)}` : "");

  return NextResponse.redirect(url);
}
