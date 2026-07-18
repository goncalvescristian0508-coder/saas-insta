import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const SETTING_KEY = "meta_apps_list";

type AppEntry = { key: string; name: string; appId: string; accountKey: string };

function authOk(req: Request): boolean {
  const secret = (process.env.INTEGRATION_SECRET || "").trim();
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function readEntries(raw: string | null): AppEntry[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as AppEntry[]; } catch { return []; }
}

// POST /api/integration/apps-sync — Electron envia lista de apps de uma conta Meta
export async function POST(req: Request) {
  if (!authOk(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json() as { accountKey?: string; apps?: Array<{ appId: string; name?: string }> };
  const accountKey = String(body.accountKey ?? "1");
  const incoming = Array.isArray(body.apps) ? body.apps : [];

  if (!incoming.length) return NextResponse.json({ error: "Lista de apps vazia" }, { status: 400 });

  const setting = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  const current = readEntries(setting?.value ?? null);

  // Remove entradas antigas desta conta, adiciona novas
  const kept = current.filter(a => a.accountKey !== accountKey);
  const added: AppEntry[] = incoming.map(a => ({
    key: a.appId,
    name: (a.name || "").trim() || `App ${a.appId.slice(-6)}`,
    appId: a.appId,
    accountKey,
  }));
  const merged = [...kept, ...added];

  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: JSON.stringify(merged) },
    update: { value: JSON.stringify(merged) },
  });

  return NextResponse.json({ synced: added.length, total: merged.length });
}

// GET /api/integration/apps-sync — retorna lista atual
export async function GET(req: Request) {
  if (!authOk(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const setting = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  const apps = readEntries(setting?.value ?? null);
  return NextResponse.json({ apps });
}
