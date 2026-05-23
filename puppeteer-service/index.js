const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const SERVICE_SECRET = process.env.SERVICE_SECRET || "";
const META_PORTAL_COOKIES = process.env.META_PORTAL_COOKIES || "";
const META_APP_ID = process.env.META_APP_ID || "";
const META_BUSINESS_ID = process.env.META_BUSINESS_ID || "";

// Parse "name=value;name2=value2" into Puppeteer cookie objects
function parseCookieString(str) {
  return str
    .split(";")
    .map((part) => {
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) return null;
      const name = part.slice(0, eqIdx).trim();
      const value = part.slice(eqIdx + 1).trim();
      return name ? { name, value } : null;
    })
    .filter(Boolean);
}

async function addTesterWithPuppeteer(username) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    // Set Facebook session cookies on both domains
    const rawCookies = parseCookieString(META_PORTAL_COOKIES);
    const cookieDomains = [".facebook.com", "developers.facebook.com"];
    for (const domain of cookieDomains) {
      await page.setCookie(
        ...rawCookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain,
          path: "/",
          secure: true,
        }))
      );
    }

    // Navigate to the devportal Instagram roles page
    const rolesUrl = `https://developers.facebook.com/apps/${META_APP_ID}/roles/roles/${
      META_BUSINESS_ID ? `?business_id=${META_BUSINESS_ID}` : ""
    }`;

    console.log(`[puppeteer] navigating to ${rolesUrl}`);
    await page.goto(rolesUrl, { waitUntil: "networkidle2", timeout: 45000 });

    const currentUrl = page.url();
    console.log(`[puppeteer] landed on ${currentUrl}`);

    if (currentUrl.includes("/login") || currentUrl.includes("checkpoint")) {
      throw new Error("Cookies expiradas — sessão inválida. Actualiza META_PORTAL_COOKIES.");
    }

    // Run the add-tester POST from inside the browser page context.
    // fetch() here uses the browser's own cookies + session — identical to a real user click.
    const result = await page.evaluate(
      async (appId, username, businessId) => {
        // Extract CSRF tokens embedded in the page HTML
        const html = document.documentElement.innerHTML;

        const fb_dtsg =
          html.match(/"DTSGInitialData",\[\],\{"token":"([^"]+)"/)?.[1] ||
          html.match(/"token":"([^"]+)","async_get_token"/)?.[1] ||
          html.match(/name="fb_dtsg"[^>]*value="([^"]+)"/)?.[1] ||
          "";

        const lsd =
          html.match(/"LSD",\[\],\{"token":"([^"]+)"\}/)?.[1] || "";

        const cUser =
          document.cookie.match(/c_user=(\d+)/)?.[1] || "";

        if (!fb_dtsg) {
          return { ok: false, error: "fb_dtsg não encontrado na página — cookies podem estar expiradas" };
        }

        // Compute jazoest (sum of ASCII codes of fb_dtsg)
        let n = 0;
        for (let i = 0; i < fb_dtsg.length; i++) n += fb_dtsg.charCodeAt(i);
        const jazoest = String(n);

        const formBody = new URLSearchParams({
          role: "instagram_testers",
          "user_id_or_vanityis[0]": username,
          reload_on_success: "false",
          _aaid: "0",
          _user: cUser,
          _a: "1",
          _req: "1a",
          fb_dtsg,
          jazoest,
          lsd,
          dpr: "1",
          _ccg: "EXCELLENT",
          ...(businessId ? { _bid: businessId } : {}),
        });

        const addUrl = `https://developers.facebook.com/apps/${appId}/async/instagram/roles/add/?_callFlowletID=0&_triggerFlowletID=1&qpl_active_e2e_trace_ids=`;

        const res = await fetch(addUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Fb-Lsd": lsd,
            "X-Asbd-Id": "359341",
            Origin: "https://developers.facebook.com",
            Referer: `https://developers.facebook.com/apps/${appId}/roles/roles/`,
          },
          body: formBody.toString(),
          credentials: "include",
        });

        const text = await res.text();

        // Facebook async responses start with "for(;;);" — strip it
        const jsonStr = text.replace(/^for\s*\(;;\);/, "").trim();
        let parsed = null;
        try { parsed = JSON.parse(jsonStr); } catch (_) {}

        const errMsg =
          parsed?.error?.message ||
          parsed?.payload?.error ||
          parsed?.errorSummary;

        if (errMsg) return { ok: false, error: errMsg };
        if (res.status >= 200 && res.status < 300) return { ok: true };
        return {
          ok: false,
          error: `HTTP ${res.status}: ${text.replace(/[^\x20-\x7E]/g, "").substring(0, 300)}`,
        };
      },
      META_APP_ID,
      username,
      META_BUSINESS_ID
    );

    console.log(`[puppeteer] result for ${username}:`, result);
    return result;
  } finally {
    await browser.close();
  }
}

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// Add tester endpoint
app.post("/add-tester", async (req, res) => {
  const { username, secret } = req.body ?? {};

  if (!SERVICE_SECRET || secret !== SERVICE_SECRET) {
    return res.status(401).json({ ok: false, error: "Não autorizado" });
  }
  if (!username) {
    return res.status(400).json({ ok: false, error: "username obrigatório" });
  }
  if (!META_APP_ID || !META_PORTAL_COOKIES) {
    return res.status(500).json({ ok: false, error: "META_APP_ID ou META_PORTAL_COOKIES não configurados" });
  }

  try {
    const clean = String(username).trim().replace(/^@/, "").toLowerCase();
    const result = await addTesterWithPuppeteer(clean);
    res.json(result);
  } catch (e) {
    console.error("[puppeteer] error:", e);
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Erro desconhecido" });
  }
});

app.listen(PORT, () => console.log(`Portal tester service a correr na porta ${PORT}`));
