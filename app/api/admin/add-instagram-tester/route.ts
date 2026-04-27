import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMetaOAuthConfig, getMetaAppByKey } from "@/lib/metaInstagramEnv";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Only admin
  if (user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const { igUsername, appKey } = await request.json() as { igUsername?: string; appKey?: string };
  if (!igUsername?.trim()) {
    return NextResponse.json({ error: "igUsername obrigatório" }, { status: 400 });
  }

  const clean = igUsername.trim().replace(/^@/, "").toLowerCase();

  // Pick app config — use appKey if provided, otherwise default app
  let appId: string | undefined;
  let appSecret: string | undefined;

  if (appKey) {
    const app = getMetaAppByKey(appKey);
    appId = app?.appId;
    appSecret = app?.appSecret;
  } else {
    const cfg = getMetaOAuthConfig();
    appId = cfg.appId;
    appSecret = cfg.appSecret;
  }

  if (!appId || !appSecret) {
    return NextResponse.json({ error: "META_APP_ID / META_APP_SECRET não configurados" }, { status: 500 });
  }

  // App access token = APP_ID|APP_SECRET (no OAuth needed)
  const accessToken = `${appId}|${appSecret}`;

  const res = await fetch(`https://graph.facebook.com/v21.0/${appId}/roles`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      user: clean,
      role: "instagram_testers",
      access_token: accessToken,
    }),
  });

  const data = await res.json() as { success?: boolean; error?: { message?: string; code?: number } };

  if (!res.ok || !data.success) {
    const msg = data.error?.message ?? "Erro ao adicionar tester";
    return NextResponse.json({ error: msg, meta: data }, { status: 400 });
  }

  return NextResponse.json({ ok: true, username: clean });
}
