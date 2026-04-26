import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";
import { getMetaOAuthConfig } from "@/lib/metaInstagramEnv";

export const runtime = "nodejs";

const GRAPH = "https://graph.instagram.com/v21.0";
const SECRET = "autopost-meta-test-2025";

// GET /api/admin/meta-test?secret=autopost-meta-test-2025
// Shows current OAuth config and tests credentials with a fake code
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("secret") !== SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const appKey = searchParams.get("app") || "";
  let effectiveAppId: string;
  let effectiveSecret: string;
  let effectiveRedirectUri: string;

  if (appKey) {
    const { getMetaAppByKey } = await import("@/lib/metaInstagramEnv");
    const cfg = getMetaAppByKey(appKey);
    effectiveAppId = cfg?.appId || "";
    effectiveSecret = cfg?.appSecret || "";
    effectiveRedirectUri = cfg?.redirectUri || "";
  } else {
    const { appId, appSecret, redirectUri } = getMetaOAuthConfig();
    effectiveAppId = appId || "1990801641474298";
    effectiveSecret = appSecret || "";
    effectiveRedirectUri = redirectUri || "";
  }

  const body = new URLSearchParams();
  body.append("client_id", effectiveAppId);
  body.append("client_secret", effectiveSecret);
  body.append("grant_type", "authorization_code");
  body.append("redirect_uri", effectiveRedirectUri);
  body.append("code", "FAKE_TEST_CODE_123");

  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json();

  return NextResponse.json({
    status: res.status,
    config: {
      appId: effectiveAppId,
      secretPrefix: effectiveSecret.slice(0, 8),
      redirectUri: effectiveRedirectUri || "(não definido)",
    },
    instagramResponse: data,
  });
}

export async function POST(request: Request) {
  const { secret } = await request.json().catch(() => ({ secret: "" }));
  if (secret !== SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const account = await prisma.instagramOAuthAccount.findFirst({
    where: { username: "_limacvell" },
  });

  if (!account) {
    return NextResponse.json({ error: "Conta _limacvell não encontrada no banco" }, { status: 404 });
  }

  let accessToken: string;
  try {
    accessToken = decryptAccountPassword(account.accessTokenEnc);
  } catch (e) {
    return NextResponse.json({ error: "Falha ao decriptar token: " + String(e) }, { status: 500 });
  }

  // GET content_publishing_limit (usa instagram_business_content_publish)
  const limitUrl = new URL(`${GRAPH}/${account.instagramUserId}/content_publishing_limit`);
  limitUrl.searchParams.set("fields", "config,quota_usage");
  limitUrl.searchParams.set("access_token", accessToken);
  const limitRes = await fetch(limitUrl.toString());
  const limitData = await limitRes.json();

  // GET media list (usa instagram_business_basic + content_publish)
  const mediaUrl = new URL(`${GRAPH}/${account.instagramUserId}/media`);
  mediaUrl.searchParams.set("fields", "id,media_type,timestamp");
  mediaUrl.searchParams.set("access_token", accessToken);
  const mediaRes = await fetch(mediaUrl.toString());
  const mediaData = await mediaRes.json();

  return NextResponse.json({
    igUserId: account.instagramUserId,
    username: account.username,
    token: accessToken,
    contentPublishLimit: { status: limitRes.status, data: limitData },
    mediaList: { status: mediaRes.status, data: mediaData },
  });
}
