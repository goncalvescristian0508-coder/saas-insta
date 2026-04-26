import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMetaOAuthConfig } from "@/lib/metaInstagramEnv";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: tokenId } = await params;

  const BASE = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const invalid = NextResponse.redirect(`${BASE}/connect-error`, { status: 302 });

  try {
    const token = await prisma.connectToken.findUnique({ where: { id: tokenId } });

    if (!token || token.usedAt || token.expiresAt < new Date()) {
      return invalid;
    }

    const appKey = new URL(_req.url).searchParams.get("app") || "";
    let appId: string | undefined;
    let redirectUri: string;

    if (appKey) {
      const { getMetaAppByKey } = await import("@/lib/metaInstagramEnv");
      const cfg = getMetaAppByKey(appKey);
      if (!cfg) return invalid;
      appId = cfg.appId;
      redirectUri = cfg.redirectUri;
    } else {
      const cfg = getMetaOAuthConfig();
      appId = cfg.appId;
      redirectUri = cfg.redirectUri;
    }

    if (!appId || !redirectUri) return invalid;

    // state = "{tokenId}:{appKey}" so callback knows both
    const stateVal = appKey ? `${tokenId}:${appKey}` : tokenId;
    const scope = "instagram_business_basic,instagram_business_content_publish";
    const oauthUrl =
      `https://api.instagram.com/oauth/authorize` +
      `?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&response_type=code` +
      `&state=${encodeURIComponent(stateVal)}`;

    return NextResponse.redirect(oauthUrl, { status: 302 });
  } catch {
    return invalid;
  }
}
