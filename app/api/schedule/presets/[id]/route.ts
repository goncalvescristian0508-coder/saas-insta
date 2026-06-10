import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await request.json() as { name?: string; description?: string; times?: string[]; caption?: string };
  const { name, description, times, caption } = body;

  if (!name?.trim() || !Array.isArray(times) || times.length === 0) {
    return NextResponse.json({ error: "Nome e horários são obrigatórios" }, { status: 400 });
  }

  const existing = await prisma.schedulePreset.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Preset não encontrado" }, { status: 404 });

  const preset = await prisma.schedulePreset.update({
    where: { id },
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      times,
      caption: caption?.trim() || null,
    },
  });

  return NextResponse.json({ preset });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.schedulePreset.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Preset não encontrado" }, { status: 404 });

  await prisma.schedulePreset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
