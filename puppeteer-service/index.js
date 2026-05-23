const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const SERVICE_SECRET = process.env.SERVICE_SECRET || "";
const META_PORTAL_COOKIES = process.env.META_PORTAL_COOKIES || "";
const META_APP_ID = process.env.META_APP_ID || "";
const META_BUSINESS_ID = process.env.META_BUSINESS_ID || "";

const VERSION = "4.0.0-ui-capture";

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

    // Track ALL POST requests + their responses
    const capturedPosts = [];
    const capturedResponses = [];

    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.method() === "POST") {
        const url = req.url();
        const body = req.postData() || "";
        capturedPosts.push({ url, body: body.substring(0, 600) });
        console.log(`[capture-req] POST ${url.replace("https://developers.facebook.com", "")}`);
        if (body) console.log(`[capture-req] body: ${body.substring(0, 200)}`);
      }
      req.continue();
    });

    page.on("response", async (resp) => {
      if (resp.request().method() === "POST") {
        try {
          const text = await resp.text();
          const url = resp.url();
          capturedResponses.push({ url, status: resp.status(), body: text.substring(0, 400) });
          console.log(`[capture-resp] ${resp.status()} ${url.replace("https://developers.facebook.com", "")}`);
          console.log(`[capture-resp] body: ${text.substring(0, 150)}`);
        } catch { /* ignore */ }
      }
    });

    // Set cookies
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

    // Wait for React to render
    await new Promise(r => setTimeout(r, 4000));

    // Take stock of all buttons on the page
    const allButtonTexts = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, [role="button"]'))
        .map(b => b.textContent?.trim())
        .filter(t => t && t.length < 100);
    });
    console.log("[puppeteer] buttons found:", allButtonTexts.slice(0, 20));

    // Find and click "Add Instagram Tester" button
    const clicked = await page.evaluate(() => {
      const keywords = ["add instagram tester", "adicionar tester", "add tester", "instagram tester", "add role"];
      const allClickable = Array.from(document.querySelectorAll('button, [role="button"], a[href="#"]'));

      // Exact/partial text match
      const btn = allClickable.find(b =>
        keywords.some(k => b.textContent?.toLowerCase().includes(k))
      );
      if (btn) { btn.click(); return { found: true, text: btn.textContent?.trim() }; }

      // Broader: any element with "tester" in text that's clickable
      const wider = Array.from(document.querySelectorAll("*")).find(e => {
        const t = (e.textContent || "").toLowerCase().trim();
        return t.includes("tester") && t.length < 60 &&
          (e.tagName === "BUTTON" || e.getAttribute("role") === "button" || e.closest("button"));
      });
      if (wider) {
        const target = wider.closest("button") || wider;
        target.click();
        return { found: true, text: wider.textContent?.trim(), wider: true };
      }

      return { found: false, buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean).slice(0, 15) };
    });

    console.log("[puppeteer] click result:", JSON.stringify(clicked));

    if (!clicked.found) {
      const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 600));
      return {
        ok: false,
        error: `Botão não encontrado. Botões na página: ${(clicked.buttons || []).join(" | ")}`,
        pageSnippet: pageText?.replace(/\s+/g, " "),
        capturedPosts: capturedPosts.map(p => p.url),
      };
    }

    // Wait for modal/dialog to appear
    try {
      await page.waitForSelector('[role="dialog"], .modal, [data-testid*="modal"], [aria-modal="true"]', { timeout: 6000 });
      console.log("[puppeteer] modal appeared");
    } catch {
      console.log("[puppeteer] modal selector timed out, continuing anyway");
    }
    await new Promise(r => setTimeout(r, 1500));

    // Find and fill input
    const inputFilled = await page.evaluate((username) => {
      const selectors = [
        '[role="dialog"] input',
        '[aria-modal="true"] input',
        '.modal input',
        'input[placeholder*="username" i]',
        'input[placeholder*="name" i]',
        'input[aria-label*="username" i]',
        'input[type="text"]',
        'input:not([type="hidden"]):not([type="submit"])',
      ];
      for (const sel of selectors) {
        const inp = document.querySelector(sel);
        if (inp) {
          inp.focus();
          // React-compatible value setting
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          nativeInputValueSetter.call(inp, username);
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
          return { filled: true, selector: sel };
        }
      }
      return { filled: false };
    }, username);

    console.log("[puppeteer] input fill:", JSON.stringify(inputFilled));

    if (!inputFilled.filled) {
      return {
        ok: false,
        error: "Campo de input não encontrado no modal",
        capturedPosts: capturedPosts.map(p => p.url),
      };
    }

    // Wait a bit for React state to update
    await new Promise(r => setTimeout(r, 1000));

    // Also type via keyboard to trigger autocomplete/search
    await page.keyboard.type(username, { delay: 40 });
    await new Promise(r => setTimeout(r, 1500));

    // Click submit button
    const submitted = await page.evaluate(() => {
      // Check dialog first
      const dialog = document.querySelector('[role="dialog"], [aria-modal="true"], .modal');
      const container = dialog || document;
      const btns = Array.from(container.querySelectorAll('button, [role="button"]'));

      const submitKeywords = ["add", "submit", "confirm", "save", "send", "adicionar", "enviar", "ok", "done"];
      const cancelKeywords = ["cancel", "cancelar", "close", "fechar", "dismiss"];

      let btn = btns.find(b => {
        const t = b.textContent?.toLowerCase().trim() || "";
        return submitKeywords.some(k => t === k);
      });

      if (!btn) {
        btn = btns.find(b => {
          const t = b.textContent?.toLowerCase().trim() || "";
          return submitKeywords.some(k => t.includes(k)) && !cancelKeywords.some(k => t.includes(k));
        });
      }

      if (btn) {
        btn.click();
        return { submitted: true, text: btn.textContent?.trim() };
      }

      return {
        submitted: false,
        available: btns.map(b => b.textContent?.trim()).filter(Boolean),
      };
    });

    console.log("[puppeteer] submit result:", JSON.stringify(submitted));

    if (!submitted.submitted) {
      return {
        ok: false,
        error: `Botão submit não encontrado. Disponíveis: ${(submitted.available || []).join(" | ")}`,
        capturedPosts: capturedPosts.map(p => p.url),
      };
    }

    // Wait for network to complete
    await new Promise(r => setTimeout(r, 5000));

    console.log("[puppeteer] total POSTs captured:", capturedPosts.length);
    for (const p of capturedPosts) {
      console.log(`[puppeteer] captured URL: ${p.url}`);
    }
    console.log("[puppeteer] total responses captured:", capturedResponses.length);

    // Check responses for success/error
    for (const resp of capturedResponses) {
      if (resp.url.includes("developers.facebook.com") && resp.status >= 200 && resp.status < 300) {
        const body = resp.body || "";
        const jsonStr = body.replace(/^for\s*\(;;\);/, "").trim();
        let parsed = null;
        try { parsed = JSON.parse(jsonStr); } catch { /* */ }
        const errMsg = parsed?.error?.message ?? parsed?.payload?.error ?? parsed?.errorSummary;
        if (errMsg) return { ok: false, error: `Meta: ${errMsg}`, capturedUrl: resp.url };
        if (parsed || resp.status === 200) {
          return { ok: true, capturedUrl: resp.url, method: "ui-automation" };
        }
      }
    }

    // Check page text for success/error clues
    const pageResult = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      const lower = text.toLowerCase();
      if (lower.match(/success|sucesso|added|adicionado|sent|enviado|invitation sent/)) return { ok: true };
      if (lower.match(/error|erro|failed|falhou/)) {
        const lines = text.split("\n").filter(l => /error|erro|failed/i.test(l));
        return { ok: false, error: lines[0]?.trim() || "Erro detectado" };
      }
      return null;
    });

    if (pageResult) return { ...pageResult, capturedPosts: capturedPosts.map(p => p.url) };

    // No clear result — return what we have for debugging
    return {
      ok: false,
      error: `Submit feito mas sem confirmação. POSTs capturados: ${capturedPosts.length}. URLs: ${capturedPosts.map(p => p.url.replace("https://developers.facebook.com", "")).join(", ") || "(nenhum)"}`,
    };

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
