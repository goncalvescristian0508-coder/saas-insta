const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const SERVICE_SECRET = process.env.SERVICE_SECRET || "";
const META_PORTAL_COOKIES = process.env.META_PORTAL_COOKIES || "";
const META_APP_ID = process.env.META_APP_ID || "";
const META_BUSINESS_ID = process.env.META_BUSINESS_ID || "";

const VERSION = "5.4.0-diag";

function parseCookieString(str) {
  return str.split(";").map((part) => {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) return null;
    const name = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    return name ? { name, value } : null;
  }).filter(Boolean);
}

// Click the first element whose visible text includes any of the keywords.
// Uses TreeWalker so it works on any tag (div, span, button, etc.)
async function clickTextNode(page, keywords, containerSelector = null) {
  return page.evaluate((keywords, containerSelector) => {
    const root = containerSelector
      ? (document.querySelector(containerSelector) || document.body)
      : document.body;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = (node.textContent || "").trim().toLowerCase();
      if (!text || text.length > 120) continue;
      if (!keywords.some(k => text.includes(k))) continue;

      // Walk up to find a clickable ancestor
      let el = node.parentElement;
      while (el && el !== document.body) {
        const tag = el.tagName;
        const role = el.getAttribute("role");
        const tabindex = el.getAttribute("tabindex");
        const hasClick = typeof el.onclick === "function";
        if (tag === "BUTTON" || tag === "A" || role === "button" || role === "radio" || role === "option" || role === "tab" || tabindex === "0" || hasClick) {
          el.click();
          return el.textContent.trim();
        }
        el = el.parentElement;
      }
      // No clickable ancestor found — click the parent anyway
      if (node.parentElement) {
        node.parentElement.click();
        return node.textContent.trim() + " (parent)";
      }
    }
    return null;
  }, keywords, containerSelector);
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
      "--disable-blink-features=AutomationControlled",
      "--window-size=1920,1080",
    ],
  });

  try {
    const page = await browser.newPage();

    // Hide automation signals so Meta portal renders normally
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "languages", { get: () => ["pt-BR", "pt", "en-US", "en"] });
      window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
      const orig = window.navigator.permissions.query;
      window.navigator.permissions.query = (p) =>
        p.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : orig(p);
    });

    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");

    // Log JS errors and console errors from the page
    page.on("pageerror", err => console.log("[page-error]", err.message.substring(0, 200)));
    page.on("console", msg => {
      if (msg.type() === "error") console.log("[page-console-error]", msg.text().substring(0, 200));
    });

    await page.setRequestInterception(true);
    page.on("request", req => req.continue());

    // Set Accept-Language so the portal renders in Portuguese
    await page.setExtraHTTPHeaders({ "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7" });

    // Set cookies on both FB domains
    const rawCookies = parseCookieString(META_PORTAL_COOKIES);
    for (const domain of [".facebook.com", "developers.facebook.com"]) {
      await page.setCookie(...rawCookies.map(c => ({
        name: c.name, value: c.value, domain, path: "/", secure: true,
      })));
    }

    // Warm up the session on facebook.com first
    console.log("[puppeteer] warming up session on facebook.com...");
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const rolesUrl = `https://developers.facebook.com/apps/${META_APP_ID}/roles/roles/${META_BUSINESS_ID ? `?business_id=${META_BUSINESS_ID}` : ""}`;
    console.log(`[v${VERSION}] navigating to ${rolesUrl}`);
    await page.goto(rolesUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    const currentUrl = page.url();
    console.log(`[puppeteer] landed: ${currentUrl}`);
    if (currentUrl.includes("/login") || currentUrl.includes("checkpoint")) {
      throw new Error("Cookies expiradas — sessão inválida.");
    }

    // Diagnose: check HTML size and text content after various wait times
    await new Promise(r => setTimeout(r, 5000));
    const diag1 = await page.evaluate(() => ({
      htmlLen: document.documentElement.innerHTML.length,
      bodyText: document.body?.textContent?.replace(/\s+/g, " ").substring(0, 300),
      innerText: document.body?.innerText?.replace(/\s+/g, " ").substring(0, 300),
      url: location.href,
    }));
    console.log("[diag-5s] htmlLen:", diag1.htmlLen, "url:", diag1.url);
    console.log("[diag-5s] bodyText:", diag1.bodyText?.substring(0, 200));
    console.log("[diag-5s] innerText:", diag1.innerText?.substring(0, 200));

    // Wait up to 25s for ANY substantial text to appear
    console.log("[puppeteer] waiting for page to render...");
    try {
      await page.waitForFunction(
        () => (document.body?.textContent?.trim().length || 0) > 500,
        { timeout: 25000, polling: 1000 }
      );
    } catch {
      const diag = await page.evaluate(() => ({
        htmlLen: document.documentElement.innerHTML.length,
        bodyText: document.body?.textContent?.replace(/\s+/g, " ").substring(0, 400),
        title: document.title,
      }));
      console.log("[diag-timeout] htmlLen:", diag.htmlLen, "title:", diag.title);
      console.log("[diag-timeout] bodyText:", diag.bodyText);
      throw new Error(`Página não renderizou. HTML len=${diag.htmlLen} title="${diag.title}" text="${diag.bodyText?.substring(0, 150)}"`);
    }

    const pageText = await page.evaluate(() => document.body?.textContent?.replace(/\s+/g, " ").substring(0, 600));
    console.log("[puppeteer] page rendered:", pageText);

    // ── STEP 1: Click "Adicionar pessoas" ──
    console.log("[puppeteer] clicking 'Adicionar pessoas'...");
    const addBtnClicked = await clickTextNode(page, ["adicionar pessoas", "add people"]);
    console.log("[puppeteer] add btn:", addBtnClicked);

    if (!addBtnClicked) {
      throw new Error(`"Adicionar pessoas" não encontrado. Texto da página: ${pageText?.substring(0, 300)}`);
    }

    // ── STEP 2: Wait for modal ──
    console.log("[puppeteer] waiting for modal...");
    await page.waitForFunction(
      () => document.body.innerText.toLowerCase().includes("testador do instagram"),
      { timeout: 10000 }
    );
    await new Promise(r => setTimeout(r, 1000));

    const modalText = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"], [aria-modal="true"]');
      return (modal || document.body)?.innerText?.replace(/\s+/g, " ").substring(0, 400);
    });
    console.log("[puppeteer] modal:", modalText);

    // ── STEP 3: Select "Testador do Instagram" radio ──
    console.log("[puppeteer] selecting 'Testador do Instagram'...");
    const roleClicked = await clickTextNode(
      page,
      ["testador do instagram", "instagram tester"],
      '[role="dialog"], [aria-modal="true"]'
    );
    console.log("[puppeteer] role selected:", roleClicked);

    if (!roleClicked) throw new Error("Opção 'Testador do Instagram' não encontrada no modal");

    // Wait for the input field to appear
    console.log("[puppeteer] waiting for username input...");
    await page.waitForFunction(
      () => {
        const modal = document.querySelector('[role="dialog"], [aria-modal="true"]') || document;
        return Array.from(modal.querySelectorAll("input")).some(i =>
          i.type !== "hidden" && i.type !== "radio" && i.type !== "checkbox"
        );
      },
      { timeout: 8000 }
    );
    await new Promise(r => setTimeout(r, 500));

    // ── STEP 4: Fill in Instagram username ──
    console.log(`[puppeteer] filling username: ${username}`);
    const inputFilled = await page.evaluate((username) => {
      const modal = document.querySelector('[role="dialog"], [aria-modal="true"]') || document;
      const inp = Array.from(modal.querySelectorAll("input")).find(i =>
        i.type !== "hidden" && i.type !== "radio" && i.type !== "checkbox"
      );
      if (!inp) return false;
      inp.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (setter) setter.call(inp, username);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }, username);

    if (!inputFilled) throw new Error("Campo de username não encontrado");

    await page.keyboard.type(username, { delay: 80 });
    await new Promise(r => setTimeout(r, 3000));

    // ── STEP 5: Pick autocomplete suggestion if it appeared ──
    const autocomplete = await page.evaluate((username) => {
      const modal = document.querySelector('[role="dialog"], [aria-modal="true"]') || document;
      const walker = document.createTreeWalker(modal, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const t = (node.textContent || "").trim().toLowerCase();
        if (t.includes(username.toLowerCase()) && t.length < 80) {
          const el = node.parentElement;
          if (el) { el.click(); return node.textContent.trim(); }
        }
      }
      return null;
    }, username);
    console.log("[puppeteer] autocomplete:", autocomplete);
    if (autocomplete) await new Promise(r => setTimeout(r, 1500));

    // ── STEP 6: Click "Adicionar" confirm button ──
    console.log("[puppeteer] clicking confirm 'Adicionar'...");
    const submitted = await clickTextNode(
      page,
      ["adicionar", "add", "confirmar", "confirm", "ok", "salvar"],
      '[role="dialog"], [aria-modal="true"]'
    );
    console.log("[puppeteer] submitted:", submitted);

    if (!submitted) {
      const modalBtns = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"], [aria-modal="true"]') || document.body;
        return modal.innerText?.replace(/\s+/g, " ").substring(0, 300);
      });
      throw new Error(`Botão "Adicionar" não encontrado. Modal: ${modalBtns}`);
    }

    // Wait for the action to complete
    await new Promise(r => setTimeout(r, 5000));

    // Final check for errors
    const finalResult = await page.evaluate(() => {
      const text = (document.body?.innerText || "").toLowerCase();
      if (/\berro\b|\berror\b|failed|falhou|inválido|invalid/.test(text)) {
        const lines = document.body.innerText.split("\n")
          .filter(l => /erro|error|failed|invalid/i.test(l))
          .map(l => l.trim()).filter(Boolean);
        return { ok: false, error: lines[0] || "Erro detectado" };
      }
      return { ok: true };
    });

    console.log("[puppeteer] done:", finalResult);
    return finalResult;

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
