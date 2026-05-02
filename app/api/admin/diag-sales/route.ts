import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  if (user.email !== adminEmail) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const igUsername = searchParams.get("ig") ?? "siqueiramonicaeduarda";

  const sales = await prisma.sale.findMany({
    where: { igUsername },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, gateway: true, amount: true, status: true,
      igUsername: true, trackingCode: true,
      customerName: true, customerEmail: true, createdAt: true,
      rawPayload: true,
    },
  });

  const parsed = sales.map((s) => {
    let tracking: Record<string, unknown> = {};
    let transaction: Record<string, unknown> = {};
    try {
      const body = JSON.parse(s.rawPayload ?? "{}") as Record<string, unknown>;
      tracking = (body.tracking ?? {}) as Record<string, unknown>;
      transaction = (body.transaction ?? {}) as Record<string, unknown>;
    } catch {}
    return {
      id: s.id, amount: s.amount, status: s.status,
      igUsername: s.igUsername, trackingCode: s.trackingCode,
      customerName: s.customerName, customerEmail: s.customerEmail,
      createdAt: s.createdAt,
      raw_utm_source: (tracking.utm_source as string) ?? null,
      raw_slug: (tracking.slug as string) ?? null,
      raw_sale_code: (transaction.sale_code as string) ?? null,
    };
  });

  const utmSources = [...new Set(parsed.map((s) => s.raw_utm_source).filter(Boolean))];
  const slugs = [...new Set(parsed.map((s) => s.raw_slug).filter(Boolean))];

  return NextResponse.json({ igUsername, total: sales.length, utmSourcesFound: utmSources, slugsFound: slugs, sales: parsed });
}

// POST: re-attribute sales from igUsername using utm_source from rawPayload
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  if (user.email !== adminEmail) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as { igUsername?: string; dryRun?: boolean };
  const igUsername = body.igUsername ?? "siqueiramonicaeduarda";
  const dryRun = body.dryRun !== false;

  const accounts = await prisma.instagramOAuthAccount.findMany({ select: { username: true } });
  const validUsernames = new Set(accounts.map((a) => a.username.toLowerCase()));

  const sales = await prisma.sale.findMany({
    where: { igUsername },
    select: { id: true, rawPayload: true, igUsername: true },
  });

  const changes: { id: string; from: string; to: string }[] = [];

  for (const sale of sales) {
    let newUsername: string | null = null;
    try {
      const payload = JSON.parse(sale.rawPayload ?? "{}") as Record<string, unknown>;
      const tracking = (payload.tracking ?? {}) as Record<string, unknown>;
      const utmSource = String(tracking.utm_source ?? "").replace("@", "").toLowerCase().trim();
      if (utmSource && validUsernames.has(utmSource) && utmSource !== igUsername.toLowerCase()) {
        newUsername = accounts.find((a) => a.username.toLowerCase() === utmSource)?.username ?? null;
      }
    } catch {}

    if (newUsername) {
      changes.push({ id: sale.id, from: sale.igUsername ?? "", to: newUsername });
      if (!dryRun) {
        await prisma.sale.update({ where: { id: sale.id }, data: { igUsername: newUsername } });
      }
    }
  }

  return NextResponse.json({ dryRun, igUsername, total: sales.length, changed: changes.length, changes: changes.slice(0, 50) });
}
