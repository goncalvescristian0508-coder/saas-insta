import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await request.json() as {
    name?: string;
    description?: string;
    times?: string[];
    caption?: string;
  };

  const existing = await prisma.schedulePreset.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Preset não encontrado" }, { status: 404 });

  const preset = await prisma.schedulePreset.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name.trim() } : {}),
      description: body.description?.trim() || null,
      ...(body.times ? { times: body.times.sort() } : {}),
      caption: body.caption?.trim() || null,
    },
  });

  return NextResponse.json({ preset });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  await prisma.schedulePreset.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
