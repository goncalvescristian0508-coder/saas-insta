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

  // content_publishing_limit requer instagram_business_content_publish
  const u = new URL(`${GRAPH}/${account.instagramUserId}/content_publishing_limit`);
  u.searchParams.set("fields", "config,quota_usage");
  u.searchParams.set("access_token", accessToken);

  const res = await fetch(u.toString());
  const data = await res.json();

  return NextResponse.json({
    igUserId: account.instagramUserId,
    username: account.username,
    apiStatus: res.status,
    apiResponse: data,
  });
}
