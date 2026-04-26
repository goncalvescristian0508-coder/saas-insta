import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  await prisma.userApifyToken.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const { isActive } = await request.json() as { isActive?: boolean };

  const updated = await prisma.userApifyToken.updateMany({
    where: { id, userId: user.id },
    data: { isActive: isActive ?? true },
  });

  if (updated.count === 0) return NextResponse.json({ error: "Token não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
