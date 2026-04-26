import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const rows = await prisma.userIntegration.findMany({ where: { userId: user.id } });
  const result: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    try { result[row.type] = JSON.parse(row.config); } catch {}
  }
  return NextResponse.json({ integrations: result });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { type, config } = await request.json() as { type?: string; config?: Record<string, string> };
  if (!type || !config) return NextResponse.json({ error: "type e config obrigatórios" }, { status: 400 });

  await prisma.userIntegration.upsert({
    where: { userId_type: { userId: user.id, type } },
    create: { userId: user.id, type, config: JSON.stringify(config) },
    update: { config: JSON.stringify(config) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { type } = await request.json() as { type?: string };
  if (!type) return NextResponse.json({ error: "type obrigatório" }, { status: 400 });

  await prisma.userIntegration.deleteMany({ where: { userId: user.id, type } });
  return NextResponse.json({ ok: true });
}
