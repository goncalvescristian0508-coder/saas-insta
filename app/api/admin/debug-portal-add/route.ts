import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ProxyAgent, fetch as undiciFetch } from "undici";

export const runtime = "nodejs";
export const maxDuration = 60;

const PORTAL_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0 Safari/537.36";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function makeProxyFetch(proxyUrl?: string): FetchFn {
  if (!proxyUrl) return (url, init) => fetch(url, init);
  const dispatcher = new ProxyAgent(proxyUrl);
  return async (url, init) => {
    const res = await undiciFetch(url, { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher });
    return res as unknown as Response;
  };
}

function computeJazoest(token: string): string {
  let n = 0;
  for (let i = 0; i < token.length; i++) n += token.charCodeAt(i);
  return String(n);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  if (user.email !== adminEmail) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const appKey = searchParams.get("key") ?? "";
  const testUsername = searchParams.get("username") ?? "_cristiang7";

  const proxyUrl = (process.env["RESIDENTIAL_PROXY_URL"] || "").trim() || undefined;
  const pfetch = makeProxyFetch(proxyUrl);

  const portalCookies =
    (appKey ? (process.env[`META_PORTAL_COOKIES_${appKey}`] || "").trim() : "") ||
    (process.env["META_PORTAL_COOKIES"] || "").trim();

  const appId =
    (appKey ? (process.env[`META_FB_APP_${appKey}_ID`] || "").trim() : "") ||
    (process.env["META_FB_APP_ID"] || "").trim() ||
    (process.env["META_APP_ID"] || "").trim() ||
    "";

  const businessId =
    (appKey ? (process.env[`META_PORTAL_BUSINESS_ID_${appKey}`] || "").trim() : "") ||
    (process.env["META_PORTAL_BUSINESS_ID"] || "").trim() ||
    "";

  const diag: Record<string, unknown> = {
    proxyConfigured: !!proxyUrl,
    proxyUrl: proxyUrl ? proxyUrl.replace(/:([^:@]+)@/, ":***@") : null,
    appId,
    appKey,
    cookiesLength: portalCookies.length,
    cUser: portalCookies.match(/c_user=(\d+)/)?.[1] ?? null,
    hasXs: /xs=/.test(portalCookies),
    businessId: businessId || null,
  };

  const browserNavHeaders = {
    Cookie: portalCookies,
    "User-Agent": PORTAL_UA,
    "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Sec-Ch-Ua": '"Google Chrome";v="148", "Chromium";v="148", "Not-A.Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control": "max-age=0",
  };

  // Step 1a: GET devportal roles page
  const devportalUrl = `https://developers.facebook.com/apps/${appId}/roles/roles/${businessId ? `?business_id=${businessId}` : ""}`;
  try {
    const r = await pfetch(devportalUrl, { headers: browserNavHeaders });
    const html = await r.text();
    const dtsg = html.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/)?.[1] ??
      html.match(/"token":"([^"]+)","async_get_token"/)?.[1] ??
      html.match(/name="fb_dtsg"[^>]*value="([^"]+)"/)?.[1] ??
      html.match(/"fb_dtsg","([^"]+)"/)?.[1];
    const lsd = html.match(/"LSD",\[\],\{"token":"([^"]+)"\}/)?.[1];
    diag["step1_devportal"] = {
      status: r.status,
      ok: r.ok,
      hasDtsg: !!dtsg,
      dtsgPreview: dtsg ? dtsg.substring(0, 15) + "..." : null,
      hasLsd: !!lsd,
      lsdPreview: lsd ? lsd.substring(0, 10) + "..." : null,
      isLogin: html.includes("login_form") || html.includes("/login/?next="),
      snippet: html.substring(0, 300),
    };
  } catch (e) {
    diag["step1_devportal"] = { error: e instanceof Error ? e.message : String(e) };
  }

  // Step 1b: GET facebook.com
  try {
    const r = await pfetch("https://www.facebook.com/", { headers: browserNavHeaders });
    const html = await r.text();
    const dtsg = html.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/)?.[1] ??
      html.match(/"token":"([^"]+)","async_get_token"/)?.[1] ??
      html.match(/name="fb_dtsg"[^>]*value="([^"]+)"/)?.[1] ??
      html.match(/"fb_dtsg","([^"]+)"/)?.[1];
    const lsd = html.match(/"LSD",\[\],\{"token":"([^"]+)"\}/)?.[1];
    diag["step1_fbcom"] = {
      status: r.status,
      ok: r.ok,
      hasDtsg: !!dtsg,
      dtsgPreview: dtsg ? dtsg.substring(0, 15) + "..." : null,
      hasLsd: !!lsd,
      lsdPreview: lsd ? lsd.substring(0, 10) + "..." : null,
    };
  } catch (e) {
    diag["step1_fbcom"] = { error: e instanceof Error ? e.message : String(e) };
  }

  // Step 2: Get fb_dtsg (prefer devportal)
  let fb_dtsg = "";
  let lsd = "";
  const devRes = diag["step1_devportal"] as Record<string, unknown>;
  const fbRes = diag["step1_fbcom"] as Record<string, unknown>;

  if (devRes && !devRes["error"]) {
    // re-fetch devportal for tokens (we already have the diag)
    try {
      const r = await pfetch(devportalUrl, { headers: browserNavHeaders });
      const html = await r.text();
      fb_dtsg = html.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/)?.[1] ??
        html.match(/"token":"([^"]+)","async_get_token"/)?.[1] ??
        html.match(/name="fb_dtsg"[^>]*value="([^"]+)"/)?.[1] ??
        html.match(/"fb_dtsg","([^"]+)"/)?.[1] ?? "";
      lsd = html.match(/"LSD",\[\],\{"token":"([^"]+)"\}/)?.[1] ?? "";
    } catch { /* ignore */ }
  }
  if (!fb_dtsg && fbRes && !fbRes["error"]) {
    try {
      const r = await pfetch("https://www.facebook.com/", { headers: browserNavHeaders });
      const html = await r.text();
      fb_dtsg = html.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/)?.[1] ??
        html.match(/"token":"([^"]+)","async_get_token"/)?.[1] ??
        html.match(/name="fb_dtsg"[^>]*value="([^"]+)"/)?.[1] ??
        html.match(/"fb_dtsg","([^"]+)"/)?.[1] ?? "";
      lsd = html.match(/"LSD",\[\],\{"token":"([^"]+)"\}/)?.[1] ?? "";
    } catch { /* ignore */ }
  }

  diag["csrfResolved"] = { fb_dtsg: fb_dtsg ? fb_dtsg.substring(0, 15) + "..." : "(empty)", lsd: lsd || "(empty)" };

  if (!fb_dtsg) {
    return NextResponse.json({ diag, error: "Não foi possível obter fb_dtsg" });
  }

  // Step 3: POST to add endpoint
  const _user = portalCookies.match(/c_user=(\d+)/)?.[1] ?? "";
  const referer = devportalUrl;
  const addUrl = `https://developers.facebook.com/apps/${appId}/async/instagram/roles/add/?_callFlowletID=0&_triggerFlowletID=1&qpl_active_e2e_trace_ids=`;

  const formBody = new URLSearchParams({
    role: "instagram_testers",
    "user_id_or_vanityis[0]": testUsername,
    reload_on_success: "false",
    _aaid: "0",
    _user,
    _a: "1",
    _req: "1s",
    fb_dtsg,
    jazoest: computeJazoest(fb_dtsg),
    lsd,
    dpr: "1",
    _ccg: "EXCELLENT",
    ...(businessId ? { _bid: businessId } : {}),
  });

  const postHeaders = {
    Cookie: portalCookies,
    "User-Agent": PORTAL_UA,
    "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Fb-Lsd": lsd,
    "X-Asbd-Id": "359341",
    Origin: "https://developers.facebook.com",
    Referer: referer,
    Accept: "*/*",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    Priority: "u=1, i",
  };

  diag["step3_postUrl"] = addUrl;
  diag["step3_formFields"] = Object.fromEntries(
    Array.from(formBody.entries()).map(([k, v]) =>
      k === "fb_dtsg" ? [k, v.substring(0, 10) + "..."] : [k, v]
    )
  );

  // Test multiple URL variations to find which path exists
  const urlVariants = [
    `https://developers.facebook.com/apps/${appId}/async/instagram/roles/add/`,
    `https://developers.facebook.com/apps/${appId}/async/instagram/testers/add/`,
    `https://developers.facebook.com/apps/${appId}/async/roles/instagram_testers/add/`,
    `https://developers.facebook.com/apps/${appId}/roles/instagram_testers/add/`,
    `https://developers.facebook.com/apps/${appId}/instagram/roles/add/`,
    `https://developers.facebook.com/apps/${appId}/async/instagram/roles/`,
    `https://developers.facebook.com/apps/${appId}/roles/add/`,
  ];
  const urlResults: Record<string, { status: number; note: string }> = {};
  for (const u of urlVariants) {
    try {
      const r = await pfetch(u, { headers: postHeaders, method: "GET" });
      await r.text();
      urlResults[u.replace(`https://developers.facebook.com/apps/${appId}`, "")] = {
        status: r.status,
        note: r.status === 405 ? "PATH EXISTS" : r.status === 404 ? "not found" : r.status === 200 ? "200 OK" : `status ${r.status}`,
      };
    } catch (e) {
      urlResults[u.replace(`https://developers.facebook.com/apps/${appId}`, "")] = { status: 0, note: `error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  diag["urlVariants"] = urlResults;

  // POST without following redirects — see raw first response
  try {
    const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
    const rawRes = dispatcher
      ? await undiciFetch(addUrl, {
          method: "POST",
          headers: postHeaders as Record<string, string>,
          body: formBody.toString(),
          dispatcher,
          maxRedirections: 0,
        } as Parameters<typeof undiciFetch>[1])
      : await fetch(addUrl, { method: "POST", headers: postHeaders, body: formBody.toString(), redirect: "manual" });

    const rawText = await rawRes.text();
    const rawHeaders: Record<string, string> = {};
    rawRes.headers.forEach((v: string, k: string) => { rawHeaders[k] = v; });

    diag["step3_postNoRedirect"] = {
      status: rawRes.status,
      headers: rawHeaders,
      bodySnippet: rawText.substring(0, 600),
    };
  } catch (e) {
    diag["step3_postNoRedirect"] = { error: e instanceof Error ? e.message : String(e) };
  }

  // POST with redirect following (normal)
  try {
    const addRes = await pfetch(addUrl, {
      method: "POST",
      headers: postHeaders,
      body: formBody.toString(),
    });

    const addText = await addRes.text();
    const responseHeaders: Record<string, string> = {};
    addRes.headers.forEach((v, k) => { responseHeaders[k] = v; });

    diag["step3_response"] = {
      status: addRes.status,
      ok: addRes.ok,
      headers: responseHeaders,
      bodySnippet: addText.substring(0, 500),
      isJson: addText.trimStart().startsWith("{") || addText.trimStart().startsWith("for(;;)"),
    };
  } catch (e) {
    diag["step3_response"] = { error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json({ diag });
}
