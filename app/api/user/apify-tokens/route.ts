import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const tokens = await prisma.userApifyToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, isActive: true, createdAt: true, token: true },
  });

  // Mask token for display (show only first 8 and last 4 chars)
  const masked = tokens.map((t) => ({
    id: t.id,
    label: t.label,
    isActive: t.isActive,
    createdAt: t.createdAt,
    tokenMasked: t.token.length > 12
      ? `${t.token.slice(0, 8)}...${t.token.slice(-4)}`
      : "***",
  }));

  return NextResponse.json({ tokens: masked });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json() as { token?: string; label?: string };
  const token = body?.token?.trim();
  const label = body?.label?.trim() ?? "";

  if (!token) return NextResponse.json({ error: "Token obrigatório" }, { status: 400 });

  // Validate token against Apify API
  try {
    const res = await fetch(`https://api.apify.com/v2/users/me?token=${token}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return NextResponse.json({ error: "Token inválido ou expirado" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Não foi possível validar o token" }, { status: 400 });
  }

  const record = await prisma.userApifyToken.create({
    data: { userId: user.id, token, label, isActive: true },
  });

  return NextResponse.json({ ok: true, id: record.id });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await request.json() as { id?: string };
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  await prisma.userApifyToken.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id, isActive } = await request.json() as { id?: string; isActive?: boolean };
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  await prisma.userApifyToken.updateMany({
    where: { id, userId: user.id },
    data: { isActive: Boolean(isActive) },
  });
  return NextResponse.json({ ok: true });
}
