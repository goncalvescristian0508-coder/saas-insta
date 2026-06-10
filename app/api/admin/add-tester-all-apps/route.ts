import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listMetaApps } from "@/lib/metaInstagramEnv";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  if (user.email !== adminEmail)
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const body = await request.json() as {
    igUsernames?: string[];
    igUsername?: string;
    appKeys?: string[];
  };

  const raw = body.igUsernames?.length ? body.igUsernames : body.igUsername ? [body.igUsername] : [];
  const usernames = raw.map(u => u.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
  if (!usernames.length)
    return NextResponse.json({ error: "Nenhum username fornecido" }, { status: 400 });

  const allApps = listMetaApps();
  const targetApps = body.appKeys?.length
    ? allApps.filter(a => body.appKeys!.includes(a.key))
    : allApps;

  if (!targetApps.length)
    return NextResponse.json({ error: "Nenhum app Meta configurado" }, { status: 500 });

  const appIds = targetApps.map(a => a.appId);

  const puppeteerUrl = (process.env["PUPPETEER_SERVICE_URL"] || "").trim();
  const puppeteerSecret = (process.env["PUPPETEER_SERVICE_SECRET"] || "").trim();

  if (!puppeteerUrl || !puppeteerSecret) {
    return NextResponse.json({
      error: "PUPPETEER_SERVICE_URL / PUPPETEER_SERVICE_SECRET não configurados. Configure o serviço Puppeteer na VPS.",
    }, { status: 500 });
  }

  const res = await fetch(`${puppeteerUrl}/add-tester-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames, appIds, secret: puppeteerSecret }),
    signal: AbortSignal.timeout(110_000),
  });

  const data = await res.json() as {
    results?: { username: string; appId: string; ok: boolean; error?: string }[];
    ok?: number;
    errors?: number;
    error?: string;
  };

  if (!res.ok) {
    return NextResponse.json({ error: data.error ?? "Erro no serviço Puppeteer" }, { status: 500 });
  }

  // Enrich results with app names
  const appIdToName = Object.fromEntries(targetApps.map(a => [a.appId, a.name]));
  const enriched = (data.results ?? []).map(r => ({
    ...r,
    appName: appIdToName[r.appId] ?? r.appId,
  }));

  return NextResponse.json({
    results: enriched,
    ok: data.ok ?? enriched.filter(r => r.ok).length,
    errors: data.errors ?? enriched.filter(r => !r.ok).length,
  });
}
