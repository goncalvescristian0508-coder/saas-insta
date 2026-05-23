import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMetaAppByKey } from "@/lib/metaInstagramEnv";

export const runtime = "nodejs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0 Safari/537.36";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  if (user.email !== adminEmail) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") ?? "";

  const cookies =
    (key ? (process.env[`META_PORTAL_COOKIES_${key}`] || "").trim() : "") ||
    (process.env["META_PORTAL_COOKIES"] || "").trim();

  if (!cookies) {
    return NextResponse.json({ configured: false });
  }

  // Basic format checks
  const cUser = cookies.match(/c_user=(\d+)/)?.[1];
  const hasXs = /xs=/.test(cookies);
  const hasDatr = /datr=/.test(cookies);

  if (!cUser || !hasXs) {
    return NextResponse.json({
      configured: true,
      sessionValid: false,
      sessionError: "Cookies inválidos — faltam xs ou c_user",
    });
  }

  // Resolve appId
  let appId: string | undefined;
  if (key) {
    const fbId = (process.env[`META_FB_APP_${key}_ID`] || "").trim();
    appId = fbId || getMetaAppByKey(key)?.appId;
  }
  if (!appId) {
    appId = (process.env["META_FB_APP_ID"] || "").trim() || undefined;
  }

  const businessId =
    (key ? (process.env[`META_PORTAL_BUSINESS_ID_${key}`] || "").trim() : "") ||
    (process.env["META_PORTAL_BUSINESS_ID"] || "").trim() ||
    undefined;

  if (!appId) {
    // Can't do live check without appId — trust cookie format check
    return NextResponse.json({
      configured: true,
      sessionValid: true,
      hint: "App ID não encontrado — não foi possível verificar a sessão em tempo real. Tenta adicionar um testador para confirmar.",
      cUser,
      envKey: key ? `META_PORTAL_COOKIES_${key}` : "META_PORTAL_COOKIES",
    });
  }

  // Live check: try to extract the CSRF token (fb_dtsg) from the roles page
  // This is exactly what addTesterViaPortal does as step 1
  const testUrl = `https://developers.facebook.com/apps/${appId}/roles/roles/${businessId ? `?business_id=${businessId}` : ""}`;

  let sessionValid = false;
  let sessionError: string | undefined;
  let hint: string | undefined;
  let httpStatus: number | undefined;

  try {
    const res = await fetch(testUrl, {
      headers: {
        Cookie: cookies,
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
      },
    });
    httpStatus = res.status;

    if (res.ok) {
      const html = await res.text();
      const hasDtsg = html.includes("DTSGInitialData");
      const isLogin = html.includes("login_form") || html.includes("/login/?next=");

      if (hasDtsg) {
        sessionValid = true;
      } else if (isLogin) {
        sessionError = "Sessão expirada — obtém novos cookies";
      } else {
        // Got HTML but no CSRF token — possibly bot-detection page
        sessionValid = false;
        sessionError = "Resposta inesperada do portal Meta";
        hint = "O servidor Meta pode filtrar IPs de servidor. Tenta adicionar um testador directamente — pode funcionar mesmo assim.";
      }
    } else if (res.status === 400 || res.status === 403) {
      // Facebook CDN/WAF often returns 400/403 for server-IP requests
      // This doesn't necessarily mean the cookies are invalid
      sessionValid = false;
      sessionError = `HTTP ${res.status} — possível bloqueio de IP de servidor`;
      hint = "O portal Meta pode bloquear pedidos de IPs de datacenter. Os cookies podem estar válidos mesmo assim. Testa adicionando um username directamente.";
    } else {
      sessionError = `HTTP ${res.status}`;
    }
  } catch (e) {
    sessionError = e instanceof Error ? e.message : "Erro de rede";
  }

  return NextResponse.json({
    configured: true,
    sessionValid,
    sessionError,
    hint,
    cUser,
    hasXs,
    hasDatr,
    httpStatus,
    envKey: key ? `META_PORTAL_COOKIES_${key}` : "META_PORTAL_COOKIES",
  });
}
