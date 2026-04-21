import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const schedule = await prisma.scheduledPost.findFirst({
    where: { id, userId: user.id },
  });
  if (!schedule) return NextResponse.json({ error: "Agendamento não encontrado" }, { status: 404 });

  await prisma.scheduledPost.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
