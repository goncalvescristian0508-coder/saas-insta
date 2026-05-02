import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptAccountPassword } from "@/lib/accountCrypto";
import { getOrCreateRequestUserId, attachRequestUserCookie } from "@/lib/requestUser";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchInstagramProfile,
} from "@/lib/instagramGraphPublish";
import { getMetaAppByKey } from "@/lib/metaInstagramEnv";

const ACCOUNTS_URL = `${process.env.NEXT_PUBLIC_APP_URL}/accounts`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let code = searchParams.get("code");
  const error = searchParams.get("error");
  const rawState = searchParams.get("state") || "";

  // state formats:
  //   ""              → direct connect, default app
  //   "2"             → direct connect, app key "2"
  //   "{tokenId}"     → connect link, default app (legacy)
  //   "{tokenId}:{k}" → connect link, app key "k"
  let connectTokenState: string | null = null;
  let appKey = "";

  if (rawState.includes(":")) {
    const colonIdx = rawState.lastIndexOf(":");
    connectTokenState = rawState.slice(0, colonIdx) || null;
    appKey = rawState.slice(colonIdx + 1);
  } else if (rawState.length <= 3 && /^\d+$/.test(rawState)) {
    appKey = rawState;
  } else {
    connectTokenState = rawState || null;
  }

  const state = connectTokenState;

  if (code && code.endsWith("#_")) {
    code = code.slice(0, -2);
  }

  if (error || !code) {
    return NextResponse.redirect(`${ACCOUNTS_URL}?error=cancelled`, { status: 302 });
  }

  // Resolve userId — either from ConnectToken (shareable link) or Supabase session
  let userId: string | null = null;
  let connectTokenId: string | null = null;

  if (state) {
    const connectToken = await prisma.connectToken.findUnique({ where: { id: state } });
    if (connectToken && !connectToken.usedAt && connectToken.expiresAt >= new Date()) {
      userId = connectToken.userId;
      connectTokenId = connectToken.id;
    }
  }

  let created = false;
  if (!userId) {
    const result = await getOrCreateRequestUserId();
    userId = result.userId;
    created = result.created;
  }

  if (!userId || userId === "anonymous") {
    return NextResponse.redirect(`${ACCOUNTS_URL}?error=no_session`, { status: 302 });
  }

  try {
    const appCfg = appKey ? getMetaAppByKey(appKey) ?? undefined : undefined;
    const short = await exchangeCodeForShortLivedToken(code, appCfg);

    let accessToken = short.access_token;
    let tokenExpiresAt: Date | null = null;

    try {
      // Pass the correct app secret for the app used during OAuth
      const long = await exchangeForLongLivedToken(short.access_token, appCfg?.appSecret);
      accessToken = long.access_token;
      if (long.expires_in > 0) {
        tokenExpiresAt = new Date(Date.now() + long.expires_in * 1000);
      }
    } catch {
      // Short-lived token fallback — will expire in ~1h, force reconnect
      tokenExpiresAt = new Date(Date.now() + 50 * 60 * 1000);
    }

    const profile = await fetchInstagramProfile(accessToken, short.user_id || undefined);
    if (!profile.id || !profile.username) {
      throw new Error("Perfil Instagram incompleto.");
    }

    const accessTokenEnc = encryptAccountPassword(accessToken);

    await prisma.instagramOAuthAccount.upsert({
      where: { userId_instagramUserId: { userId, instagramUserId: profile.id } },
      create: {
        userId,
        instagramUserId: profile.id,
        username: profile.username,
        profilePictureUrl: profile.profile_picture_url ?? null,
        accessTokenEnc,
        tokenExpiresAt,
        appKey: appKey || "1",
        lastError: null,
        accountStatus: "ACTIVE",
        quarantinedUntil: null,
      },
      update: {
        username: profile.username,
        profilePictureUrl: profile.profile_picture_url ?? null,
        accessTokenEnc,
        tokenExpiresAt,
        appKey: appKey || "1",
        lastError: null,
        accountStatus: "ACTIVE",
        quarantinedUntil: null,
      },
    });

    // Mark connect token as used
    if (connectTokenId) {
      await prisma.connectToken.update({
        where: { id: connectTokenId },
        data: { usedAt: new Date() },
      });
    }

    const response = NextResponse.redirect(`${ACCOUNTS_URL}?success=true`, { status: 302 });
    if (created) attachRequestUserCookie(response, userId);
    return response;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    const q = new URLSearchParams({ error: "token_failed", detail: msg });
    return NextResponse.redirect(`${ACCOUNTS_URL}?${q.toString()}`);
  }
}
