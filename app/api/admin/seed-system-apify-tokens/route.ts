import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const SYSTEM_USER_ID = "system";

export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await request.json() as { tokens?: string[] };
  const tokens = (body?.tokens ?? []).filter(
    (t): t is string => typeof t === "string" && t.startsWith("apify_api_") && t.length >= 20
  );

  if (tokens.length === 0) {
    return NextResponse.json({ error: "Nenhum token válido enviado" }, { status: 400 });
  }

  const deleted = await prisma.userApifyToken.deleteMany({ where: { userId: SYSTEM_USER_ID } });
  const created = await prisma.userApifyToken.createMany({
    data: tokens.map((token) => ({ userId: SYSTEM_USER_ID, token, label: "system-auto", isActive: true })),
    skipDuplicates: true,
  });

  return NextResponse.json({
    ok: true,
    deleted: deleted.count,
    inserted: created.count,
  });
}

export async function GET(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const count = await prisma.userApifyToken.count({ where: { userId: SYSTEM_USER_ID, isActive: true } });
  return NextResponse.json({ systemTokens: count });
}
