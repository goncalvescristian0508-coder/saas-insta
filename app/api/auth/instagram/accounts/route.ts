import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  attachRequestUserCookie,
  getOrCreateRequestUserId,
} from "@/lib/requestUser";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId, created } = await getOrCreateRequestUserId();
    const rows = await prisma.instagramOAuthAccount.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        instagramUserId: true,
        username: true,
        profilePictureUrl: true,
        tokenExpiresAt: true,
        lastError: true,
        createdAt: true,
      },
    });

    const response = NextResponse.json({ accounts: rows });
    if (created) attachRequestUserCookie(response, userId);
    return response;
  } catch (error: any) {
    console.error('Erro ao buscar contas:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
