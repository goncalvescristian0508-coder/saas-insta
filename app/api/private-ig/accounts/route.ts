import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptAccountPassword } from "@/lib/accountCrypto";
import {
  attachRequestUserCookie,
  getOrCreateRequestUserId,
} from "@/lib/requestUser";
import {
  mapInstagramError,
  validateLoginAndSerialize,
} from "@/lib/instagramService";

export const runtime = "nodejs";

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
        createdAt: true,
      },
    }),
  ]);

  const oauthMapped = oauthRows.map((r) => ({
    id: r.id,
    username: r.username,
    hasSession: true,
    source: "oauth" as const,
    profilePicUrl: r.profilePictureUrl ?? undefined,
    lastError: r.lastError,
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

    const sessionJson = await validateLoginAndSerialize(u, String(password));
    const passwordEnc = encryptAccountPassword(String(password));

    const { userId } = await getOrCreateRequestUserId();
    const acc = await prisma.privateInstagramAccount.upsert({
      where: { username: u },
      create: { userId, username: u, passwordEnc, sessionJson },
      update: { userId, passwordEnc, sessionJson, lastError: null },
    });

    return NextResponse.json({
      ok: true,
      id: acc.id,
      username: acc.username,
    });
  } catch (error: unknown) {
    const raw = error instanceof Error ? `[${error.constructor.name}] ${error.message}` : String(error);
    console.error("[private-ig/accounts POST]", raw);
    return NextResponse.json(
      { error: mapInstagramError(error), debug: raw },
      { status: 400 },
    );
  }
}
