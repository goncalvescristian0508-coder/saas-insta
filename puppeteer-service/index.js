const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const SERVICE_SECRET = process.env.SERVICE_SECRET || "";
const META_PORTAL_COOKIES = process.env.META_PORTAL_COOKIES || "";
const META_APP_ID = process.env.META_APP_ID || "";
const META_BUSINESS_ID = process.env.META_BUSINESS_ID || "";

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

    // Set cookies for both Facebook domains
    const rawCookies = parseCookieString(META_PORTAL_COOKIES);
    for (const domain of [".facebook.com", "developers.facebook.com"]) {
      await page.setCookie(...rawCookies.map((c) => ({ name: c.name, value: c.value, domain, path: "/", secure: true })));
    }

    // Intercept network to capture the real add-tester request URL + body
    let capturedRequest = null;
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("instagram/roles") || url.includes("instagram/testers") || url.includes("roles/add")) {
        capturedRequest = { url, method: req.method(), postData: req.postData() };
        console.log("[puppeteer] captured request:", url);
      }
      req.continue();
    });

    const rolesUrl = `https://developers.facebook.com/apps/${META_APP_ID}/roles/roles/${META_BUSINESS_ID ? `?business_id=${META_BUSINESS_ID}` : ""}`;
    console.log(`[puppeteer] navigating to ${rolesUrl}`);
    await page.goto(rolesUrl, { waitUntil: "networkidle2", timeout: 45000 });

    const currentUrl = page.url();
    console.log(`[puppeteer] landed on ${currentUrl}`);
    if (currentUrl.includes("/login") || currentUrl.includes("checkpoint")) {
      throw new Error("Cookies expiradas — sessão inválida.");
    }

    // Wait for React to render the page
    await new Promise(r => setTimeout(r, 3000));

    // Find and click "Add Instagram Testers" button via UI
    const clicked = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button, [role="button"], div[tabindex]'));
      const keywords = ["add instagram tester", "adicionar tester", "add tester", "instagram tester"];
      const btn = allButtons.find(b => keywords.some(k => b.textContent?.toLowerCase().includes(k)));
      if (btn) { btn.click(); return btn.textContent?.trim(); }

      // Fallback: look for any clickable element with "tester" text
      const all = Array.from(document.querySelectorAll("*"));
      const el = all.find(e =>
        e.childElementCount === 0 &&
        e.textContent?.toLowerCase().includes("tester") &&
        (e.tagName === "BUTTON" || e.closest("button") || e.getAttribute("role") === "button")
      );
      if (el) { (el.closest("button") || el).click(); return el.textContent?.trim(); }
      return null;
    });

    console.log("[puppeteer] clicked button:", clicked);
    if (!clicked) {
      // Take screenshot for debugging
      const shot = await page.screenshot({ encoding: "base64" });
      const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 500));
      throw new Error(`Botão 'Add Tester' não encontrado. Página: ${pageText?.replace(/\s+/g, " ")}`);
    }

    // Wait for dialog/modal to appear
    await new Promise(r => setTimeout(r, 2000));

    // Type username in the input field
    const inputFound = await page.evaluate((username) => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
      const inp = inputs.find(i =>
        i.placeholder?.toLowerCase().includes("username") ||
        i.placeholder?.toLowerCase().includes("name") ||
        i.getAttribute("aria-label")?.toLowerCase().includes("username") ||
        inputs.length === 1
      );
      if (inp) { inp.focus(); inp.value = ""; return true; }
      return false;
    }, username);

    if (!inputFound) throw new Error("Campo de input não encontrado no modal");

    await page.keyboard.type(username, { delay: 50 });
    await new Promise(r => setTimeout(r, 1000));

    // Click submit/confirm button in the modal
    const submitted = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const submitKeywords = ["submit", "add", "confirm", "save", "adicionar", "enviar"];
      const btn = buttons.find(b => submitKeywords.some(k => b.textContent?.toLowerCase().trim() === k));
      if (btn) { btn.click(); return btn.textContent?.trim(); }

      // Fallback: find primary/blue button in dialog
      const dialog = document.querySelector('[role="dialog"], .modal, [data-testid="modal"]');
      if (dialog) {
        const btns = Array.from(dialog.querySelectorAll("button"));
        const primary = btns.find(b => !b.textContent?.toLowerCase().includes("cancel") && !b.textContent?.toLowerCase().includes("cancelar"));
        if (primary) { primary.click(); return primary.textContent?.trim(); }
      }
      return null;
    });

    console.log("[puppeteer] submitted with button:", submitted);

    // Wait for network to settle and check result
    await new Promise(r => setTimeout(r, 3000));

    // Check if capturedRequest contains the real URL
    if (capturedRequest) {
      console.log("[puppeteer] real API URL found:", capturedRequest.url);
    }

    // Check for success/error in the page
    const pageResult = await page.evaluate((username) => {
      const body = document.body?.innerText || "";
      if (body.toLowerCase().includes("success") || body.toLowerCase().includes("sucesso")) return { ok: true };
      if (body.toLowerCase().includes("error") || body.toLowerCase().includes("erro")) {
        const lines = body.split("\n").filter(l => l.toLowerCase().includes("error") || l.toLowerCase().includes("erro"));
        return { ok: false, error: lines[0]?.trim() };
      }
      return { ok: true }; // assume ok if no error visible
    }, username);

    return { ...pageResult, capturedUrl: capturedRequest?.url };

  } finally {
    await browser.close();
  }
}

app.get("/health", (_req, res) => res.json({ ok: true }));

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

app.listen(PORT, () => console.log(`Portal tester service na porta ${PORT}`));
