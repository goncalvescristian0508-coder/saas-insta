import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateRequestUserId } from "@/lib/requestUser";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { userId } = await getOrCreateRequestUserId();
  const { id } = await context.params;
  try {
    const result = await prisma.instagramOAuthAccount.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0) {
      return NextResponse.json(
        { error: "Conta não encontrada." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Conta não encontrada." },
      { status: 404 },
    );
  }
}
