const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const SERVICE_SECRET = process.env.SERVICE_SECRET || "";
const META_PORTAL_COOKIES = process.env.META_PORTAL_COOKIES || "";
const META_APP_ID = process.env.META_APP_ID || "";
const META_BUSINESS_ID = process.env.META_BUSINESS_ID || "";

const VERSION = "3.0.0-in-browser-fetch";

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
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");

    // Set cookies on both domains
    const rawCookies = parseCookieString(META_PORTAL_COOKIES);
    for (const domain of [".facebook.com", "developers.facebook.com"]) {
      await page.setCookie(...rawCookies.map((c) => ({ name: c.name, value: c.value, domain, path: "/", secure: true })));
    }

    const rolesUrl = `https://developers.facebook.com/apps/${META_APP_ID}/roles/roles/${META_BUSINESS_ID ? `?business_id=${META_BUSINESS_ID}` : ""}`;
    console.log(`[v${VERSION}] navigating to ${rolesUrl}`);
    await page.goto(rolesUrl, { waitUntil: "networkidle2", timeout: 60000 });

    const currentUrl = page.url();
    console.log(`[puppeteer] landed on ${currentUrl}`);
    if (currentUrl.includes("/login") || currentUrl.includes("checkpoint")) {
      throw new Error("Cookies expiradas — sessão inválida.");
    }

    // Wait for React hydration
    await new Promise(r => setTimeout(r, 3000));

    // Extract CSRF tokens from the page
    const tokens = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      const fb_dtsg =
        html.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/)?.[1] ??
        html.match(/"token":"([^"]+)","async_get_token"/)?.[1] ??
        html.match(/name="fb_dtsg"[^>]*value="([^"]+)"/)?.[1] ??
        html.match(/"fb_dtsg","([^"]+)"/)?.[1];
      const lsd = html.match(/"LSD",\[\],\{"token":"([^"]+)"\}/)?.[1] ?? "";
      const cUser = document.cookie.match(/c_user=(\d+)/)?.[1] ?? "";
      return { fb_dtsg: fb_dtsg || "", lsd, cUser };
    });

    console.log(`[puppeteer] fb_dtsg=${tokens.fb_dtsg ? tokens.fb_dtsg.substring(0, 12) + "..." : "(empty)"} lsd=${tokens.lsd || "(empty)"} cUser=${tokens.cUser}`);

    if (!tokens.fb_dtsg) {
      const pageSnippet = await page.evaluate(() => document.body?.innerText?.substring(0, 300));
      throw new Error(`fb_dtsg não encontrado na página. Snippet: ${pageSnippet?.replace(/\s+/g, " ")}`);
    }

    // Make the add-tester request FROM WITHIN the browser context.
    // This runs with real session cookies + same-origin, bypassing all server-side restrictions.
    const result = await page.evaluate(async (params) => {
      const { appId, username, fb_dtsg, lsd, businessId, cUser } = params;

      const jazoest = String(Array.from(fb_dtsg).reduce((s, c) => s + c.charCodeAt(0), 0));

      const formBody = new URLSearchParams({
        role: "instagram_testers",
        "user_id_or_vanityis[0]": username,
        reload_on_success: "false",
        _aaid: "0",
        _user: cUser,
        _a: "1",
        _req: "1s",
        fb_dtsg,
        jazoest,
        lsd,
        dpr: "1",
        _ccg: "EXCELLENT",
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
      username,
      fb_dtsg: tokens.fb_dtsg,
      lsd: tokens.lsd,
      businessId: META_BUSINESS_ID,
      cUser: tokens.cUser,
    });

    console.log(`[puppeteer] in-browser fetch result: status=${result.status} ok=${result.ok} fetchError=${result.fetchError}`);
    console.log(`[puppeteer] body snippet: ${(result.body || "").substring(0, 200)}`);

    if (result.fetchError) {
      throw new Error(`Fetch error no browser: ${result.fetchError}`);
    }

    if (!result.ok) {
      const bodyClean = (result.body || "").replace(/[^\x20-\x7E\n]/g, "").replace(/\s+/g, " ").trim().substring(0, 300);
      throw new Error(`Portal HTTP ${result.status}: ${bodyClean}`);
    }

    // Parse JSON response (Facebook wraps with "for(;;);")
    const jsonStr = (result.body || "").replace(/^for\s*\(;;\);/, "").trim();
    let parsed = null;
    try { parsed = JSON.parse(jsonStr); } catch { /* not JSON */ }

    const errMsg =
      parsed?.error?.message ??
      parsed?.payload?.error ??
      parsed?.errorSummary;

    if (errMsg) {
      return { ok: false, error: `Portal: ${errMsg}`, raw: jsonStr.substring(0, 200) };
    }

    return { ok: true, raw: jsonStr.substring(0, 100) };

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
