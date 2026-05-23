import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptAccountPassword } from "@/lib/accountCrypto";
import {
  attachRequestUserCookie,
  getOrCreateRequestUserId,
} from "@/lib/requestUser";
import { loginViaApi } from "@/lib/storyApi";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  const { userId, created } = await getOrCreateRequestUserId();
  const [privateRows, oauthRows] = await Promise.all([
    prisma.privateInstagramAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        lastError: true,
        sessionJson: true,
        createdAt: true,
      },
    }),
    prisma.instagramOAuthAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        profilePictureUrl: true,
        lastError: true,
        tokenExpiresAt: true,
        appKey: true,
        accountStatus: true,
        quarantinedUntil: true,
        createdAt: true,
      },
    }),
  ]);

  const now = new Date();
  const oauthMapped = oauthRows.map((r) => ({
    id: r.id,
    username: r.username,
    hasSession: true,
    source: "oauth" as const,
    profilePicUrl: r.profilePictureUrl ?? undefined,
    lastError: r.lastError,
    tokenExpiresAt: r.tokenExpiresAt?.toISOString() ?? null,
    tokenExpired: r.tokenExpiresAt ? r.tokenExpiresAt < now : false,
    appKey: r.appKey ?? "1",
    accountStatus: r.accountStatus ?? "ACTIVE",
    quarantinedUntil: r.quarantinedUntil?.toISOString() ?? null,
    createdAt: r.createdAt,
  }));

  const privateMapped = privateRows.map((r) => ({
    id: r.id,
    username: r.username,
    hasSession: Boolean(r.sessionJson),
    source: "private" as const,
    lastError: r.lastError,
    createdAt: r.createdAt,
  }));

  const accounts = [...oauthMapped, ...privateMapped].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  const response = NextResponse.json({ accounts });
  if (created) attachRequestUserCookie(response, userId);
  return response;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = body?.username;
    const password = body?.password;
    const proxyUrl = body?.proxyUrl ? String(body.proxyUrl).trim() : null;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username e senha são obrigatórios." },
        { status: 400 },
      );
    }

    const u = String(username).replace("@", "").trim();
    if (!u) {
      return NextResponse.json({ error: "Username inválido." }, { status: 400 });
    }

    const result = await loginViaApi({
      username: u,
      password: String(password),
      proxyUrl: proxyUrl ?? undefined,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Erro ao fazer login.", debug: result.error },
        { status: 400 },
      );
    }

    const sessionJson = JSON.stringify(result.session);
    const passwordEnc = encryptAccountPassword(String(password));

    const { userId } = await getOrCreateRequestUserId();
    const acc = await prisma.privateInstagramAccount.upsert({
      where: { username: u },
      create: { userId, username: u, passwordEnc, sessionJson, proxyUrl },
      update: { userId, passwordEnc, sessionJson, lastError: null, proxyUrl },
    });

    return NextResponse.json({
      ok: true,
      id: acc.id,
      username: acc.username,
    });
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : String(error);
    console.error("[private-ig/accounts POST]", raw);
    return NextResponse.json(
      { error: raw, debug: raw },
      { status: 400 },
    );
  }
}
