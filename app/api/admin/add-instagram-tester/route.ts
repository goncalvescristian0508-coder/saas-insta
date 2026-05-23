import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMetaOAuthConfig, getMetaAppByKey } from "@/lib/metaInstagramEnv";
import https from "node:https";
import zlib from "node:zlib";
import { HttpsProxyAgent } from "https-proxy-agent";

export const runtime = "nodejs";
export const maxDuration = 60;

const PORTAL_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0 Safari/537.36";

function computeJazoest(token: string): string {
  let n = 0;
  for (let i = 0; i < token.length; i++) n += token.charCodeAt(i);
  return String(n);
}

// All proxy traffic goes through node:https + HttpsProxyAgent (no undici needed)
function nodeHttpsRequest(
  proxyUrl: string,
  targetUrl: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; text: string; rawHeaders: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const agent = new HttpsProxyAgent(proxyUrl);
    const url = new URL(targetUrl);
    const reqHeaders: Record<string, string> = { ...headers };
    if (body) reqHeaders["Content-Length"] = Buffer.byteLength(body).toString();

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        headers: reqHeaders,
        agent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks);
          const encoding = res.headers["content-encoding"];
          const rawHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) rawHeaders[k] = Array.isArray(v) ? v.join(", ") : v;
          }
          const finish = (text: string) =>
            resolve({ status: res.statusCode ?? 0, text, rawHeaders });

          if (encoding === "br") {
            zlib.brotliDecompress(raw, (e, d) => finish(e ? raw.toString("utf8") : d.toString("utf8")));
          } else if (encoding === "gzip") {
            zlib.gunzip(raw, (e, d) => finish(e ? raw.toString("utf8") : d.toString("utf8")));
          } else if (encoding === "deflate") {
            zlib.inflate(raw, (e, d) => finish(e ? raw.toString("utf8") : d.toString("utf8")));
          } else {
            finish(raw.toString("utf8"));
          }
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function makeProxyFetch(proxyUrl?: string): FetchFn {
  if (!proxyUrl) return (url, init) => fetch(url, init);
  return async (url, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body as string | undefined;
    // Request identity so decompression always works; Facebook handles it fine
    const result = await nodeHttpsRequest(proxyUrl, url, method, { ...headers, "Accept-Encoding": "identity" }, body);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      text: async () => result.text,
      json: async () => JSON.parse(result.text) as unknown,
      headers: {
        get: (name: string) => result.rawHeaders[name.toLowerCase()] ?? null,
        forEach: (fn: (v: string, k: string) => void) => {
          for (const [k, v] of Object.entries(result.rawHeaders)) fn(v, k);
        },
      },
    } as unknown as Response;
  };
}

/* ─── Portal-based approach (Meta Developer portal internal API) ─── */
async function addTesterViaPortal(
  appId: string,
  username: string,
  portalCookies: string,
  businessId?: string,
): Promise<{ username: string; ok: boolean; error?: string; method?: string }> {
  const baseProxyUrl = (process.env["RESIDENTIAL_PROXY_URL"] || "").trim() || undefined;
  // Sticky session ensures GET (CSRF fetch) and POST go through the same proxy IP
  const sessionId = Math.random().toString(36).slice(2, 9);
  const proxyUrl = baseProxyUrl
    ? baseProxyUrl.replace(/@/, `_session-${sessionId}_lifetime-168h@`)
    : undefined;
  const pfetch = makeProxyFetch(proxyUrl);

  const referer = `https://developers.facebook.com/apps/${appId}/roles/roles/${businessId ? `?business_id=${businessId}` : ""}`;
  const fbBaseHeaders = {
    Cookie: portalCookies,
    "User-Agent": PORTAL_UA,
    "Accept-Language": "pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  };
  const browserNavHeaders = {
    ...fbBaseHeaders,
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

  const _user = portalCookies.match(/c_user=(\d+)/)?.[1] ?? "";

  const storedFbDtsg = (process.env["META_PORTAL_FB_DTSG"] || "").trim();
  const storedLsd = (process.env["META_PORTAL_LSD"] || "").trim();

  let fb_dtsg = proxyUrl ? "" : storedFbDtsg;
  let lsd = proxyUrl ? "" : storedLsd;
  let freshCookies = "";

  if (!fb_dtsg) {
    const urlsToTry = [
      `https://developers.facebook.com/apps/${appId}/roles/roles/${businessId ? `?business_id=${businessId}` : ""}`,
      "https://www.facebook.com/",
    ];
    const diagSteps: string[] = [];
    for (const url of urlsToTry) {
      try {
        const pageRes = await pfetch(url, { headers: browserNavHeaders });
        const html = await pageRes.text();
        const snippet = html.substring(0, 120).replace(/\s+/g, " ");
        // /login/?next= appears in nav links on logged-in pages — only check for actual login forms
        const isLogin = html.includes('"login_form"') || html.includes("checkpoint");
        const hasDtsg = html.includes("DTSGInitialData") || html.includes("fb_dtsg");
        diagSteps.push(`[${url.includes("developers") ? "devportal" : "fb.com"} HTTP ${pageRes.status} login=${isLogin} hasDtsg=${hasDtsg}] ${snippet}`);

        if (!pageRes.ok) continue;

        const extracted =
          html.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/)?.[1] ??
          html.match(/"token":"([^"]+)","async_get_token"/)?.[1] ??
          html.match(/name="fb_dtsg"[^>]*value="([^"]+)"/)?.[1] ??
          html.match(/"fb_dtsg","([^"]+)"/)?.[1];

        if (extracted) {
          fb_dtsg = extracted;
          lsd = html.match(/"LSD",\[\],\{"token":"([^"]+)"\}/)?.[1] ?? lsd;
          const setCookie = pageRes.headers.get("set-cookie");
          if (setCookie) {
            freshCookies = setCookie.split(/,(?=[^;]+=[^;]+)/).map(c => c.split(";")[0].trim()).join("; ");
          }
          break;
        }

        if (isLogin) break;
      } catch (e) {
        diagSteps.push(`[erro] ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (!fb_dtsg) {
      return {
        username, ok: false,
        error: `Token CSRF não encontrado. Diagnóstico: ${diagSteps.join(" | ")}`,
      };
    }
  }

  const effectiveCookies = freshCookies ? `${portalCookies}; ${freshCookies}` : portalCookies;

  // Step 2: Get Instagram numeric user ID via proxy
  let userId: string | undefined;
  try {
    const igRes = await pfetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        headers: {
          "x-ig-app-id": "936619743392459",
          "User-Agent": PORTAL_UA,
          Accept: "*/*",
          Referer: "https://www.instagram.com/",
          "x-requested-with": "XMLHttpRequest",
        },
      },
    );
    if (igRes.ok) {
      const igData = await igRes.json() as { data?: { user?: { id?: string } } };
      userId = igData?.data?.user?.id;
    }
  } catch { /* ignore */ }

  // Fallback: developer portal autocomplete
  if (!userId) {
    try {
      const lookupUrl = `https://developers.facebook.com/apps/${appId}/async/instagram/user/?value=${encodeURIComponent(username)}&_callFlowletID=0&_triggerFlowletID=3771&qpl_active_e2e_trace_ids=`;
      const lookupRes = await pfetch(lookupUrl, {
        headers: { ...fbBaseHeaders, "X-Fb-Lsd": lsd, Referer: referer, Accept: "*/*" },
      });
      const text = await lookupRes.text();
      const jsonStr = text.replace(/^for\s*\(;;\);/, "").trim();
      try {
        const flat = JSON.stringify(JSON.parse(jsonStr));
        const m = flat.match(/"(?:id|uid)"\s*:\s*"(\d{10,17})"/);
        if (m) userId = m[1];
      } catch {
        const m = text.match(/\b(\d{14,17})\b/);
        if (m) userId = m[1];
      }
    } catch { /* ignore */ }
  }

  // Step 3: POST to the internal add endpoint
  const userParam = userId ?? username;

  const formBody = new URLSearchParams({
    role: "instagram_testers",
    "user_id_or_vanityis[0]": userParam,
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

  const addUrl = `https://developers.facebook.com/apps/${appId}/async/instagram/roles/add/?_callFlowletID=0&_triggerFlowletID=4501&qpl_active_e2e_trace_ids=`;

  const postHeaders: Record<string, string> = {
    ...fbBaseHeaders,
    Cookie: effectiveCookies,
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Fb-Lsd": lsd,
    "X-Asbd-Id": "359341",
    Origin: "https://developers.facebook.com",
    Referer: referer,
    Accept: "*/*",
    "Sec-Ch-Ua": '"Google Chrome";v="148", "Chromium";v="148", "Not-A.Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    Priority: "u=1, i",
  };

  let addStatus: number;
  let addText: string;
  try {
    const r = await pfetch(addUrl, { method: "POST", headers: postHeaders, body: formBody.toString() });
    addStatus = r.status;
    addText = await r.text();
  } catch (e) {
    return { username, ok: false, error: `Erro ao adicionar via portal: ${e instanceof Error ? e.message : "erro"}` };
  }

  const jsonStr = addText.replace(/^for\s*\(;;\);/, "").trim();
  let parsed: Record<string, unknown> | null = null;
  try { parsed = JSON.parse(jsonStr) as Record<string, unknown>; } catch { /* ignore */ }

  if (addStatus < 200 || addStatus >= 300) {
    const apiErr = (parsed as Record<string, unknown> & { error?: { message?: string } })?.error?.message;
    // Strip non-printable / binary chars so HTML 404 pages display readably
    const bodySnippet = addText.replace(/[^\x20-\x7E\n]/g, "").replace(/\s+/g, " ").trim().substring(0, 250);
    return { username, ok: false, error: `Portal HTTP ${addStatus} [appId=${appId} dtsg=${fb_dtsg.substring(0, 10)}...]: ${apiErr ?? bodySnippet}` };
  }

  const errMsg =
    (parsed as Record<string, unknown> & { error?: { message?: string }; payload?: { error?: string }; errorSummary?: string })?.error?.message ??
    (parsed as Record<string, unknown> & { payload?: { error?: string } })?.payload?.error ??
    (parsed as Record<string, unknown> & { errorSummary?: string })?.errorSummary;

  if (errMsg) {
    return { username, ok: false, error: `Portal: ${errMsg}` };
  }

  return { username, ok: true, method: "portal" };
}

/* ─── Graph API approach (fallback) ─── */
async function sendTesterInvite(
  clean: string,
  appId: string,
  accessToken: string,
): Promise<{ username: string; ok: boolean; error?: string }> {
  async function attempt(userParam: string) {
    const body = new URLSearchParams({
      user: userParam,
      role: "instagram_testers",
      access_token: accessToken,
    });
    const res = await fetch(`https://graph.facebook.com/v21.0/${appId}/roles`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json() as { success?: boolean; error?: { message?: string; code?: number; type?: string } };
    return { res, data };
  }

  let { res, data } = await attempt(clean);

  if ((!res.ok || !data.success) && data.error?.code === 100) {
    const retry = await attempt(`@${clean}`);
    res = retry.res;
    data = retry.data;
  }

  if (!res.ok || !data.success) {
    const errMsg = data.error?.message ?? "Erro ao adicionar tester";
    const code = data.error?.code;
    let hint = "";
    if (code === 190) hint = " (token inválido — configure META_ADMIN_ACCESS_TOKEN no Vercel)";
    else if (code === 200) hint = " (sem permissão — use um token de admin do app)";
    else if (code === 100) hint = " (app não suporta esta operação via API — use META_PORTAL_COOKIES)";
    return { username: clean, ok: false, error: `[${code ?? "?"}] ${errMsg}${hint}` };
  }

  return { username: clean, ok: true };
}

/* ─── Main handler ─── */
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

  let appId: string | undefined;
  let appSecret: string | undefined;

  if (body.appKey) {
    const fbId = (process.env[`META_FB_APP_${body.appKey}_ID`] || "").trim();
    const fbSecret = (process.env[`META_FB_APP_${body.appKey}_SECRET`] || "").trim();
    appId = fbId || undefined;
    appSecret = fbSecret || undefined;
    if (!appId) {
      const app = getMetaAppByKey(body.appKey);
      appId = app?.appId;
      appSecret = app?.appSecret;
    }
  } else {
    const fbId = (process.env["META_FB_APP_ID"] || "").trim();
    const fbSecret = (process.env["META_FB_APP_SECRET"] || "").trim();
    appId = fbId || undefined;
    appSecret = fbSecret || undefined;
    if (!appId) {
      const cfg = getMetaOAuthConfig();
      appId = cfg.appId;
      appSecret = cfg.appSecret;
    }
  }

  if (!appId) {
    return NextResponse.json({ error: "META_APP_ID não configurado" }, { status: 500 });
  }

  const portalCookies =
    (body.appKey ? (process.env[`META_PORTAL_COOKIES_${body.appKey}`] || "").trim() : "") ||
    (process.env["META_PORTAL_COOKIES"] || "").trim();

  const businessId =
    (body.appKey ? (process.env[`META_PORTAL_BUSINESS_ID_${body.appKey}`] || "").trim() : "") ||
    (process.env["META_PORTAL_BUSINESS_ID"] || "").trim() ||
    undefined;

  if (portalCookies) {
    const settled = await Promise.allSettled(
      usernames.map(clean => addTesterViaPortal(appId!, clean, portalCookies, businessId)),
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
      return NextResponse.json({ ok: true, username: r.username, results, method: "portal" });
    }

    return NextResponse.json({ results, ok, errors, method: "portal" });
  }

  // Fallback: Graph API
  const adminToken =
    (body.appKey ? (process.env[`META_ADMIN_ACCESS_TOKEN_${body.appKey}`] || "").trim() : "") ||
    (process.env["META_ADMIN_ACCESS_TOKEN"] || "").trim();

  if (!appSecret && !adminToken) {
    return NextResponse.json({
      error: `Sem credenciais. Configure META_PORTAL_COOKIES ou META_APP_${body.appKey ?? ""}_SECRET no Vercel.`,
    }, { status: 500 });
  }

  const appAccessToken = appSecret ? `${appId}|${appSecret}` : null;
  const tokensToTry: string[] = [
    ...(appAccessToken ? [appAccessToken] : []),
    ...(adminToken ? [adminToken] : []),
  ];

  async function tryInviteWithFallback(clean: string): Promise<{ username: string; ok: boolean; error?: string }> {
    let lastResult: { username: string; ok: boolean; error?: string } = { username: clean, ok: false, error: "Sem token disponível" };
    for (const token of tokensToTry) {
      const result = await sendTesterInvite(clean, appId!, token);
      if (result.ok) return result;
      lastResult = result;
      const isAuthError = result.error?.includes("[190]") || result.error?.includes("[15]");
      if (!isAuthError) break;
    }
    return lastResult;
  }

  const settled = await Promise.allSettled(
    usernames.map(clean => tryInviteWithFallback(clean)),
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
