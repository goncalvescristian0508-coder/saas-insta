import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  if (user.email !== adminEmail) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as { dryRun?: boolean };
  const dryRun = body.dryRun !== false;

  // Get all valid account usernames per user
  const accounts = await prisma.instagramOAuthAccount.findMany({
    select: { userId: true, username: true },
  });
  const validUsernames = new Set(accounts.map((a) => a.username.toLowerCase()));

  const userAccountMap = new Map<string, string[]>();
  for (const a of accounts) {
    if (!userAccountMap.has(a.userId)) userAccountMap.set(a.userId, []);
    userAccountMap.get(a.userId)!.push(a.username);
  }

  // Find ALL sales with bad or null igUsername (to recover nulled ones too)
  const badSales = await prisma.sale.findMany({
    where: {
      OR: [
        { igUsername: null },
        { igUsername: { not: null } },
      ],
    },
    select: { id: true, userId: true, igUsername: true, rawPayload: true },
  });

  const toFix = badSales.filter((s) =>
    !s.igUsername || !validUsernames.has(s.igUsername.toLowerCase())
  );

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      wouldFix: toFix.length,
      preview: toFix.slice(0, 20).map((s) => ({ id: s.id, igUsername: s.igUsername })),
    });
  }

  let fixed = 0;
  let nulled = 0;

  for (const sale of toFix) {
    const userAccounts = userAccountMap.get(sale.userId) ?? [];
    const userAccountsLower = userAccounts.map((u) => u.toLowerCase());

    // 1. Try utm_source from rawPayload
    let resolved: string | null = null;
    if (sale.rawPayload) {
      try {
        const payload = JSON.parse(sale.rawPayload) as Record<string, unknown>;
        const tracking = (payload.tracking ?? {}) as Record<string, unknown>;
        const utmSource = String(tracking.utm_source ?? "").replace("@", "").toLowerCase().trim();
        if (utmSource && userAccountsLower.includes(utmSource)) {
          resolved = userAccounts[userAccountsLower.indexOf(utmSource)];
        }
      } catch {}
    }

    // 2. Single-account fallback
    if (!resolved && userAccounts.length === 1) {
      resolved = userAccounts[0];
    }

    if (resolved) {
      await prisma.sale.update({ where: { id: sale.id }, data: { igUsername: resolved } });
      fixed++;
    } else {
      await prisma.sale.update({ where: { id: sale.id }, data: { igUsername: null } });
      nulled++;
    }
  }

  return NextResponse.json({ dryRun: false, fixed, nulled, total: toFix.length });
}
