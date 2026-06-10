import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const presets = await prisma.schedulePreset.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ presets });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json() as { name?: string; description?: string; times?: string[]; caption?: string };
  const { name, description, times, caption } = body;

  if (!name?.trim() || !Array.isArray(times) || times.length === 0) {
    return NextResponse.json({ error: "Nome e horários são obrigatórios" }, { status: 400 });
  }

  const preset = await prisma.schedulePreset.create({
    data: {
      userId: user.id,
      name: name.trim(),
      description: description?.trim() || null,
      times,
      caption: caption?.trim() || null,
    },
  });

  return NextResponse.json({ preset });
}
