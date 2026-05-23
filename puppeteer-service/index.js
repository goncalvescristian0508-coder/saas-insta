const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const SERVICE_SECRET = process.env.SERVICE_SECRET || "";
const META_PORTAL_COOKIES = process.env.META_PORTAL_COOKIES || "";
const META_APP_ID = process.env.META_APP_ID || "";
const META_BUSINESS_ID = process.env.META_BUSINESS_ID || "";

const VERSION = "6.0.0-correct-fields";

function parseCookieString(str) {
  return str.split(";").map((part) => {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) return null;
    const name = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    return name ? { name, value } : null;
  }).filter(Boolean);
}

async function addTesterWithPuppeteer(username) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1920,1080",
    ],
  });

  try {
    const page = await browser.newPage();

    // Hide automation signals
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "languages", { get: () => ["pt-BR", "pt", "en-US", "en"] });
      window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
    });

    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
    await page.setExtraHTTPHeaders({ "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7" });

    page.on("pageerror", err => console.log("[page-error]", err.message.substring(0, 200)));

    // Set cookies on both FB domains
    const rawCookies = parseCookieString(META_PORTAL_COOKIES);
    for (const domain of [".facebook.com", "developers.facebook.com"]) {
      await page.setCookie(...rawCookies.map(c => ({
        name: c.name, value: c.value, domain, path: "/", secure: true,
      })));
    }

    const rolesUrl = `https://developers.facebook.com/apps/${META_APP_ID}/roles/roles/${META_BUSINESS_ID ? `?business_id=${META_BUSINESS_ID}` : ""}`;
    console.log(`[v${VERSION}] navigating to ${rolesUrl}`);
    await page.goto(rolesUrl, { waitUntil: "load", timeout: 60000 });

    const currentUrl = page.url();
    console.log(`[puppeteer] landed: ${currentUrl}`);
    if (currentUrl.includes("/login") || currentUrl.includes("checkpoint")) {
      throw new Error("Cookies expiradas — sessão inválida.");
    }

    // Wait for page JS to run (title gets set by JS)
    await page.waitForFunction(
      () => document.title.length > 5,
      { timeout: 30000, polling: 500 }
    );
    console.log("[puppeteer] title:", await page.title());

    // Give React time to initialize
    await new Promise(r => setTimeout(r, 4000));

    // Extract CSRF tokens from the page HTML
    const tokens = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      const fb_dtsg =
        html.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/)?.[1] ??
        html.match(/"token":"([^"]+)","async_get_token"/)?.[1] ??
        html.match(/name="fb_dtsg"[^>]*value="([^"]+)"/)?.[1] ??
        html.match(/"fb_dtsg","([^"]+)"/)?.[1] ?? "";
      const lsd = html.match(/"LSD",\[\],\{"token":"([^"]+)"\}/)?.[1] ?? "";
      const cUser = document.cookie.match(/c_user=(\d+)/)?.[1] ?? "";
      // Also extract _hs, _rev, _dyn from page for more complete form data
      const _hs = html.match(/"haste_session","([^"]+)"/)?.[1] ??
        html.match(/"_hs":"([^"]+)"/)?.[1] ?? "";
      const _rev = html.match(/"pkg_cohort_key":"\d+",.*?"client_revision":(\d+)/)?.[1] ??
        html.match(/"client_revision":(\d+)/)?.[1] ?? "";
      return { fb_dtsg, lsd, cUser, _hs, _rev };
    });

    console.log(`[puppeteer] fb_dtsg=${tokens.fb_dtsg ? tokens.fb_dtsg.substring(0, 15) + "..." : "(empty)"} lsd=${tokens.lsd || "(empty)"} cUser=${tokens.cUser}`);

    if (!tokens.fb_dtsg) {
      throw new Error("Não foi possível extrair fb_dtsg do portal");
    }

    // STEP 1: Look up the Instagram numeric user ID via the portal's user endpoint
    // This runs inside the browser (same-origin, credentials included)
    const userLookup = await page.evaluate(async (params) => {
      const { appId, username, lsd } = params;
      const url = `https://developers.facebook.com/apps/${appId}/async/instagram/roles/user/?value=${encodeURIComponent(username)}&_callFlowletID=0&_triggerFlowletID=1&qpl_active_e2e_trace_ids=`;
      try {
        const res = await fetch(url, {
          headers: { "X-Fb-Lsd": lsd, Accept: "*/*", "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty" },
          credentials: "include",
        });
        const text = await res.text();
        return { status: res.status, body: text.substring(0, 800) };
      } catch (e) {
        return { fetchError: e.message };
      }
    }, { appId: META_APP_ID, username, lsd: tokens.lsd });

    console.log(`[puppeteer] user lookup status=${userLookup.status} body=${userLookup.body?.substring(0, 200)}`);

    // Parse numeric user ID from response
    let numericUserId = username; // fallback to username if lookup fails
    if (userLookup.body && !userLookup.fetchError) {
      const jsonStr = (userLookup.body || "").replace(/^for\s*\(;;\);/, "").trim();
      try {
        const parsed = JSON.parse(jsonStr);
        const flat = JSON.stringify(parsed);
        const m = flat.match(/"(?:id|uid|user_id)"\s*:\s*"(\d{10,17})"/);
        if (m) numericUserId = m[1];
        else {
          const m2 = flat.match(/\b(\d{14,17})\b/);
          if (m2) numericUserId = m2[1];
        }
      } catch {
        const m = (userLookup.body || "").match(/\b(\d{14,17})\b/);
        if (m) numericUserId = m[1];
      }
    }
    console.log(`[puppeteer] resolved user param: ${numericUserId}`);

    // STEP 2: POST to add endpoint from inside the browser
    // Correct field: user_id_or_vanitys[0] (NOT user_id_or_vanityis)
    const addResult = await page.evaluate(async (params) => {
      const { appId, numericUserId, fb_dtsg, lsd, businessId, cUser } = params;

      const jazoest = String(Array.from(fb_dtsg).reduce((s, c) => s + c.charCodeAt(0), 0));

      const formBody = new URLSearchParams({
        role: "instagram_testers",
        "user_id_or_vanitys[0]": numericUserId,  // ← CORRECT field name
        reload_on_success: "false",
        _aaid: "0",
        _user: cUser,
        _a: "1",
        _req: "h",
        dpr: "1",
        _ccg: "EXCELLENT",
        fb_dtsg,
        jazoest,
        lsd,
      });
      if (businessId) formBody.set("_bid", businessId);

      const addUrl = `https://developers.facebook.com/apps/${appId}/async/instagram/roles/add/?_callFlowletID=0&_triggerFlowletID=1&qpl_active_e2e_trace_ids=`;

      try {
        const res = await fetch(addUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Fb-Lsd": lsd,
            "X-Asbd-Id": "359341",
            Accept: "*/*",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
          },
          body: formBody.toString(),
          credentials: "include",
        });
        const text = await res.text();
        return { status: res.status, body: text.substring(0, 1000), ok: res.ok };
      } catch (e) {
        return { fetchError: e.message };
      }
    }, {
      appId: META_APP_ID,
      numericUserId,
      fb_dtsg: tokens.fb_dtsg,
      lsd: tokens.lsd,
      businessId: META_BUSINESS_ID || "",
      cUser: tokens.cUser,
    });

    console.log(`[puppeteer] add result: status=${addResult.status} ok=${addResult.ok}`);
    console.log(`[puppeteer] add body: ${addResult.body?.substring(0, 300)}`);

    if (addResult.fetchError) throw new Error(`Fetch error: ${addResult.fetchError}`);

    if (!addResult.ok) {
      const bodyClean = (addResult.body || "").replace(/[^\x20-\x7E\n]/g, "").replace(/\s+/g, " ").trim().substring(0, 300);
      throw new Error(`Portal HTTP ${addResult.status}: ${bodyClean}`);
    }

    // Parse JSON response
    const jsonStr = (addResult.body || "").replace(/^for\s*\(;;\);/, "").trim();
    let parsed = null;
    try { parsed = JSON.parse(jsonStr); } catch { /* not JSON, assume ok */ }

    const errMsg = parsed?.error?.message ?? parsed?.payload?.error ?? parsed?.errorSummary;
    if (errMsg) return { ok: false, error: `Meta: ${errMsg}` };

    return { ok: true, resolvedId: numericUserId };

  } finally {
    await browser.close();
  }
}

app.get("/health", (_req, res) => res.json({ ok: true, version: VERSION }));

app.post("/add-tester", async (req, res) => {
  const { username, secret } = req.body ?? {};
  if (!SERVICE_SECRET || secret !== SERVICE_SECRET) return res.status(401).json({ ok: false, error: "Não autorizado" });
  if (!username) return res.status(400).json({ ok: false, error: "username obrigatório" });
  if (!META_APP_ID || !META_PORTAL_COOKIES) return res.status(500).json({ ok: false, error: "META_APP_ID ou META_PORTAL_COOKIES não configurados" });

  try {
    const clean = String(username).trim().replace(/^@/, "").toLowerCase();
    const result = await addTesterWithPuppeteer(clean);
    res.json(result);
  } catch (e) {
    console.error("[puppeteer] error:", e);
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Erro desconhecido" });
  }
});

app.listen(PORT, () => console.log(`Portal tester service v${VERSION} na porta ${PORT}`));
