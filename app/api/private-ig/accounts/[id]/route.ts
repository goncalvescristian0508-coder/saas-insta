import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteCtx) {
  const { id } = await context.params;
  try {
    await prisma.privateInstagramAccount.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
  }
}
