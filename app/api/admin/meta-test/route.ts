import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";

export const runtime = "nodejs";

const GRAPH = "https://graph.instagram.com/v21.0";
const SECRET = "autopost-meta-test-2025";

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
