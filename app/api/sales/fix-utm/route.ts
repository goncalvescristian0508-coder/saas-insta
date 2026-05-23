import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const accounts = await prisma.instagramOAuthAccount.findMany({
    where: { userId: user.id },
    select: { username: true },
  });
  const validUsernames = new Set(accounts.map((a) => a.username.toLowerCase()));

  const sales = await prisma.sale.findMany({
    where: { userId: user.id },
    select: { id: true, rawPayload: true, igUsername: true },
  });

  let fixed = 0;

  for (const sale of sales) {
    try {
      const payload = JSON.parse(sale.rawPayload ?? "{}") as Record<string, unknown>;
      const tracking = (payload.tracking ?? {}) as Record<string, unknown>;
      const utmSource = String(tracking.utm_source ?? "").replace("@", "").toLowerCase().trim();
      if (!utmSource || !validUsernames.has(utmSource)) continue;
      const correctUsername = accounts.find((a) => a.username.toLowerCase() === utmSource)?.username;
      if (!correctUsername || correctUsername === sale.igUsername) continue;
      await prisma.sale.update({ where: { id: sale.id }, data: { igUsername: correctUsername } });
      fixed++;
    } catch {
      continue;
    }
  }

  return NextResponse.json({ ok: true, fixed });
}
