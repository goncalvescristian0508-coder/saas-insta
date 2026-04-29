import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  if (user.email !== adminEmail) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { shortToken, appKey } = await request.json() as { shortToken: string; appKey?: string };
  if (!shortToken?.trim()) return NextResponse.json({ error: "Token obrigatório" }, { status: 400 });

  const key = appKey ?? "";
  const appId = (key
    ? (process.env[`META_APP_${key}_ID`] || "")
    : (process.env["META_APP_ID"] || "")
  ).trim();
  const appSecret = (key
    ? (process.env[`META_APP_${key}_SECRET`] || "")
    : (process.env["META_APP_SECRET"] || "")
  ).trim();

  if (!appId || !appSecret) {
    return NextResponse.json({ error: `Credenciais META_APP_${key}_ID / META_APP_${key}_SECRET não encontradas` }, { status: 500 });
  }

  const url = new URL("https://graph.facebook.com/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortToken.trim());

  const res = await fetch(url.toString());
  const data = await res.json() as { access_token?: string; expires_in?: number; error?: { message?: string } };

  if (!res.ok || !data.access_token) {
    return NextResponse.json({ error: data.error?.message ?? "Erro ao extender token" }, { status: 400 });
  }

  const days = data.expires_in ? Math.round(data.expires_in / 86400) : 60;

  return NextResponse.json({
    longToken: data.access_token,
    expiresInDays: days,
    envKey: `META_ADMIN_ACCESS_TOKEN_${key}`,
  });
}
