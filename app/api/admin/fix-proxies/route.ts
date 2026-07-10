import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ProxyAgent } from "undici";

export const runtime = "nodejs";
export const maxDuration = 120;

const MB_API_KEY = process.env.MARKETBET_API_KEY ?? "";
const MB_URL = "https://checker.marketbet.com.br/api/v1/proxy/gerar.php";

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  return !!secret && auth === `Bearer ${secret}`;
}

async function testProxy(proxyUrl: string): Promise<boolean> {
  try {
    const dispatcher = new ProxyAgent(proxyUrl);
    const res = await fetch("https://graph.instagram.com/", {
      // @ts-expect-error undici dispatcher
      dispatcher,
      signal: AbortSignal.timeout(8_000),
    });
    return res.status < 600;
  } catch {
    return false;
  }
}

function parseMbProxy(raw: string): string {
  // Formato MB: "host:port:user:senha"
  const firstColon = raw.indexOf(":");
  const secondColon = raw.indexOf(":", firstColon + 1);
  const lastColon = raw.lastIndexOf(":");
  const host = raw.slice(0, firstColon);
  const port = raw.slice(firstColon + 1, secondColon);
  const user = raw.slice(secondColon + 1, lastColon);
  const pass = raw.slice(lastColon + 1);
  return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
}

async function generateProxies(quantidade: number): Promise<string[]> {
  const res = await fetch(MB_URL, {
    method: "POST",
    headers: { Authorization: MB_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ quantidade, tipo: "fixo", country: "br" }),
  });
  const data = await res.json() as { success: boolean; data?: { proxies: string[] } };
  if (!data.success || !data.data?.proxies?.length) throw new Error(`MB API: ${JSON.stringify(data)}`);
  return data.data.proxies.map(parseMbProxy);
}

// GET → lista contas com proxy e seu status
export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = await prisma.instagramOAuthAccount.findMany({
    where: { proxyUrl: { not: null } },
    select: { id: true, username: true, proxyUrl: true, accountStatus: true },
  });

  if (accounts.length === 0) return NextResponse.json({ message: "Nenhuma conta com proxy.", accounts: [] });

  const results = await Promise.all(
    accounts.map(async (acc) => {
      const ok = await testProxy(acc.proxyUrl!);
      return { id: acc.id, username: acc.username, accountStatus: acc.accountStatus, proxyUrl: acc.proxyUrl, proxyOk: ok };
    })
  );

  return NextResponse.json({
    total: results.length,
    ok: results.filter(r => r.proxyOk).length,
    invalid: results.filter(r => !r.proxyOk).length,
    accounts: results,
  });
}

// POST → substitui proxies inválidos por novos via MarketBet
export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = await prisma.instagramOAuthAccount.findMany({
    where: { proxyUrl: { not: null } },
    select: { id: true, username: true, proxyUrl: true, accountStatus: true },
  });

  if (accounts.length === 0) return NextResponse.json({ message: "Nenhuma conta com proxy." });

  const testResults = await Promise.all(
    accounts.map(async (acc) => ({ ...acc, ok: await testProxy(acc.proxyUrl!) }))
  );

  const invalid = testResults.filter(r => !r.ok);

  if (invalid.length === 0) return NextResponse.json({ message: "Todos os proxies estão funcionando.", fixed: 0 });

  const newProxies = await generateProxies(invalid.length);
  const updated: { username: string; old: string; new: string }[] = [];

  for (let i = 0; i < invalid.length; i++) {
    const acc = invalid[i];
    const newProxy = newProxies[i];
    if (!newProxy) continue;
    await prisma.instagramOAuthAccount.update({
      where: { id: acc.id },
      data: { proxyUrl: newProxy },
    });
    updated.push({ username: acc.username, old: acc.proxyUrl!, new: newProxy });
  }

  return NextResponse.json({
    checked: accounts.length,
    invalidFound: invalid.length,
    fixed: updated.length,
    updates: updated,
  });
}
