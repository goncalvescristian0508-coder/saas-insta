import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function maskToken(token: string): string {
  if (token.length <= 12) return token.slice(0, 4) + "…";
  return token.slice(0, 8) + "…" + token.slice(-4);
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const tokens = await prisma.userApifyToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, token: true, isActive: true, createdAt: true },
  });

  const active = tokens.filter((t) => t.isActive).length;

  return NextResponse.json({
    tokens: tokens.map((t) => ({ ...t, masked: maskToken(t.token), token: undefined })),
    activeCount: active,
    totalCount: tokens.length,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { token, label } = await request.json() as { token?: string; label?: string };
  if (!token?.trim()) return NextResponse.json({ error: "Token obrigatório" }, { status: 400 });

  const created = await prisma.userApifyToken.create({
    data: { userId: user.id, token: token.trim(), label: (label ?? "").trim() },
  });

  return NextResponse.json({ id: created.id, masked: maskToken(created.token), label: created.label, isActive: true });
}
