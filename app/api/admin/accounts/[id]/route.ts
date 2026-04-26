import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function isAdmin(email: string | undefined) {
  return email === (process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com");
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { id: accountId } = await params;
  if (!accountId) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  try {
    await prisma.instagramOAuthAccount.delete({ where: { id: accountId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
  }
}
