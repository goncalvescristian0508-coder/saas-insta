import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  const token = await prisma.connectToken.create({
    data: { userId: user.id, expiresAt },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const url = `${baseUrl}/connect/${token.id}`;

  return NextResponse.json({ url, expiresAt: token.expiresAt });
}
