import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMetaOAuthConfig, getMetaAppByKey } from "@/lib/metaInstagramEnv";

export const runtime = "nodejs";
export const maxDuration = 60;

async function sendTesterInvite(
  clean: string,
  appId: string,
  accessToken: string,
): Promise<{ username: string; ok: boolean; error?: string }> {
  const body = new URLSearchParams({
    user: clean,
    role: "instagram_testers",
    access_token: accessToken,
  });

  const res = await fetch(`https://graph.facebook.com/v21.0/${appId}/roles`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json() as { success?: boolean; error?: { message?: string; code?: number } };

  if (!res.ok || !data.success) {
    const errMsg = data.error?.message ?? "Erro ao adicionar tester";
    const code = data.error?.code;
    let hint = "";
    if (code === 200 || code === 190) hint = " — verifique o token de admin";
    return { username: clean, ok: false, error: `${errMsg}${hint}` };
  }

  return { username: clean, ok: true };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  if (user.email !== adminEmail) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const body = await request.json() as {
    igUsername?: string;
    igUsernames?: string[];
    appKey?: string;
  };

  const raw: string[] = body.igUsernames?.length
    ? body.igUsernames
    : body.igUsername ? [body.igUsername] : [];

  const usernames = raw.map(u => u.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);

  if (usernames.length === 0) {
    return NextResponse.json({ error: "Nenhum username fornecido" }, { status: 400 });
  }

  // Resolve app ID
  let appId: string | undefined;
  let appSecret: string | undefined;

  if (body.appKey) {
    const fbId = (process.env[`META_FB_APP_${body.appKey}_ID`] || "").trim();
    const fbSecret = (process.env[`META_FB_APP_${body.appKey}_SECRET`] || "").trim();
    if (fbId && fbSecret) {
      appId = fbId;
      appSecret = fbSecret;
    } else {
      const app = getMetaAppByKey(body.appKey);
      appId = app?.appId;
      appSecret = app?.appSecret;
    }
  } else {
    const fbId = (process.env["META_FB_APP_ID"] || "").trim();
    const fbSecret = (process.env["META_FB_APP_SECRET"] || "").trim();
    if (fbId && fbSecret) {
      appId = fbId;
      appSecret = fbSecret;
    } else {
      const cfg = getMetaOAuthConfig();
      appId = cfg.appId;
      appSecret = cfg.appSecret;
    }
  }

  if (!appId) {
    return NextResponse.json({ error: "META_APP_ID não configurado" }, { status: 500 });
  }

  // Prefer a long-lived User Access Token (needed for Business-managed apps).
  // Set META_ADMIN_ACCESS_TOKEN_<key> (e.g. META_ADMIN_ACCESS_TOKEN_2) in Vercel env vars.
  // Falls back to App Access Token (appId|appSecret) for non-Business apps.
  const adminToken =
    (body.appKey ? (process.env[`META_ADMIN_ACCESS_TOKEN_${body.appKey}`] || "").trim() : "") ||
    (process.env["META_ADMIN_ACCESS_TOKEN"] || "").trim();

  let accessToken: string;

  if (adminToken) {
    accessToken = adminToken;
  } else {
    if (!appSecret) {
      return NextResponse.json({
        error: "App gerenciado por Business Manager requer META_ADMIN_ACCESS_TOKEN_" + (body.appKey ?? "") + " no Vercel. Gere um User Access Token de admin no Meta API Explorer e adicione nas env vars.",
      }, { status: 500 });
    }
    accessToken = `${appId}|${appSecret}`;

    // Validate App Access Token
    const validateRes = await fetch(`https://graph.facebook.com/v21.0/app?access_token=${accessToken}`);
    if (!validateRes.ok) {
      const vd = await validateRes.json().catch(() => ({})) as { error?: { message?: string } };
      return NextResponse.json({
        error: `Credenciais inválidas (App ID: ${appId}). Detalhe: ${vd.error?.message ?? "desconhecido"}`,
      }, { status: 500 });
    }
  }

  // Send all invites in parallel
  const settled = await Promise.allSettled(
    usernames.map(clean => sendTesterInvite(clean, appId!, accessToken)),
  );

  const results = settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : { username: usernames[i], ok: false, error: s.reason instanceof Error ? s.reason.message : "Erro desconhecido" },
  );

  const ok = results.filter(r => r.ok).length;
  const errors = results.filter(r => !r.ok).length;

  if (usernames.length === 1) {
    const r = results[0];
    if (!r.ok) return NextResponse.json({ error: r.error, results }, { status: 400 });
    return NextResponse.json({ ok: true, username: r.username, results });
  }

  return NextResponse.json({ results, ok, errors });
}
