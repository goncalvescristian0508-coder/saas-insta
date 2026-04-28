import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMetaOAuthConfig, getMetaAppByKey } from "@/lib/metaInstagramEnv";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  if (user.email !== adminEmail) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const { igUsername, appKey } = await request.json() as { igUsername?: string; appKey?: string };
  if (!igUsername?.trim()) {
    return NextResponse.json({ error: "igUsername obrigatório" }, { status: 400 });
  }

  const clean = igUsername.trim().replace(/^@/, "").toLowerCase();

  // For tester management, use the Facebook App credentials (META_FB_APP_{key}_ID/SECRET)
  // which are separate from the Instagram OAuth app credentials (META_APP_{key}_ID/SECRET)
  let appId: string | undefined;
  let appSecret: string | undefined;

  if (appKey) {
    const fbId = (process.env[`META_FB_APP_${appKey}_ID`] || "").trim();
    const fbSecret = (process.env[`META_FB_APP_${appKey}_SECRET`] || "").trim();
    if (fbId && fbSecret) {
      appId = fbId;
      appSecret = fbSecret;
    } else {
      // fallback to OAuth app
      const app = getMetaAppByKey(appKey);
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

  if (!appId || !appSecret) {
    return NextResponse.json({ error: "META_APP_ID / META_APP_SECRET não configurados" }, { status: 500 });
  }

  const accessToken = `${appId}|${appSecret}`;

  // Validate app credentials first
  const validateRes = await fetch(
    `https://graph.facebook.com/v21.0/app?access_token=${accessToken}`,
  );
  if (!validateRes.ok) {
    const vd = await validateRes.json().catch(() => ({})) as { error?: { message?: string } };
    return NextResponse.json({
      error: `Credenciais do app inválidas (App ID: ${appId}). Verifique o App Secret no Meta Developer Portal. Detalhe: ${vd.error?.message ?? "desconhecido"}`,
    }, { status: 500 });
  }

  // Try to resolve Instagram username → Instagram user ID via Business Discovery
  // If it fails we'll try passing the username directly
  let userValue = clean;
  try {
    const lookupRes = await fetch(
      `https://graph.facebook.com/v21.0/?fields=instagram_business_account&access_token=${accessToken}`,
    );
    // If business account linked, try to resolve via IG username search
    const igSearchRes = await fetch(
      `https://graph.instagram.com/v21.0/${clean}?fields=id&access_token=${accessToken}`,
    );
    if (igSearchRes.ok) {
      const igData = await igSearchRes.json() as { id?: string };
      if (igData.id) userValue = igData.id;
    }
  } catch {
    // fallback to username
  }

  const body = new URLSearchParams({
    user: userValue,
    role: "instagram_testers",
    access_token: accessToken,
  });

  const res = await fetch(`https://graph.facebook.com/v21.0/${appId}/roles`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json() as { success?: boolean; error?: { message?: string; code?: number; type?: string } };

  if (!res.ok || !data.success) {
    const errMsg = data.error?.message ?? "Erro ao adicionar tester";
    const code = data.error?.code;

    // Common error hints
    let hint = "";
    if (code === 100) hint = " — usuário não encontrado. Tente com o ID numérico do Instagram em vez do @username.";
    else if (code === 200 || code === 190) hint = " — verifique o App Secret no Meta Developer Portal.";

    return NextResponse.json({ error: `${errMsg}${hint}`, code, meta: data }, { status: 400 });
  }

  return NextResponse.json({ ok: true, username: clean });
}
