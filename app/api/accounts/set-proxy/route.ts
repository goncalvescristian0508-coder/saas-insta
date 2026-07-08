import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isAdmin(email: string | undefined) {
  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  return email === adminEmail;
}

async function checkAuth(request: Request): Promise<boolean> {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  if (secret && secret === process.env.CRON_SECRET) return true;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return isAdmin(user?.email);
  } catch { return false; }
}

/**
 * POST /api/accounts/set-proxy?secret=CRON_SECRET
 *
 * Body (single):  { "username": "conta123", "proxyUrl": "http://user:pass@host:port" }
 * Body (batch):   [{ "username": "conta1", "proxyUrl": "..." }, ...]
 * Clear proxy:    { "username": "conta1", "proxyUrl": null }
 *
 * Called by the local automation to register the proxy used per account.
 * Instagram Graph API calls will then be routed through that proxy.
 */
export async function POST(request: Request) {
  if (!await checkAuth(request)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const entries = (Array.isArray(body) ? body : [body]) as {
    username?: string;
    proxyUrl?: string | null;
  }[];

  if (entries.length === 0) {
    return NextResponse.json({ error: "Nenhuma entrada recebida" }, { status: 400 });
  }

  const results: { username: string; updated: number; error?: string }[] = [];

  for (const entry of entries) {
    const { username, proxyUrl } = entry;
    if (!username) {
      results.push({ username: "(sem username)", updated: 0, error: "username obrigatório" });
      continue;
    }

    try {
      const r = await prisma.instagramOAuthAccount.updateMany({
        where: { username },
        data: { proxyUrl: proxyUrl ?? null },
      });
      results.push({ username, updated: r.count });
    } catch (e) {
      results.push({ username, updated: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const totalUpdated = results.reduce((s, r) => s + r.updated, 0);
  return NextResponse.json({ ok: true, totalUpdated, results });
}

/**
 * GET /api/accounts/set-proxy?secret=CRON_SECRET
 * Returns the current proxy mapping for all accounts.
 */
export async function GET(request: Request) {
  if (!await checkAuth(request)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const accounts = await prisma.instagramOAuthAccount.findMany({
    select: { username: true, proxyUrl: true, accountStatus: true },
    orderBy: { username: "asc" },
  });

  return NextResponse.json({
    total: accounts.length,
    withProxy: accounts.filter(a => a.proxyUrl).length,
    accounts: accounts.map(a => ({
      username: a.username,
      status: a.accountStatus,
      proxyUrl: a.proxyUrl ?? null,
    })),
  });
}
