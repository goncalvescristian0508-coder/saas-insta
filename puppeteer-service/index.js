const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const SERVICE_SECRET = process.env.SERVICE_SECRET || "";
const META_PORTAL_COOKIES = process.env.META_PORTAL_COOKIES || "";
const META_APP_ID = process.env.META_APP_ID || "";
const META_BUSINESS_ID = process.env.META_BUSINESS_ID || "";

const VERSION = "5.1.0-exact-flow";

function parseCookieString(str) {
  return str.split(";").map((part) => {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) return null;
    const name = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    return name ? { name, value } : null;
  }).filter(Boolean);
}

async function clickByText(page, keywords, scope = "document") {
  return page.evaluate((keywords, scope) => {
    const root = scope === "dialog"
      ? (document.querySelector('[role="dialog"], [aria-modal="true"]') || document)
      : document;
    const all = Array.from(root.querySelectorAll("*"));
    const el = all.find(e => {
      if (el === document.body || e.children.length > 5) return false;
      const t = (e.textContent || "").trim().toLowerCase();
      return t.length > 0 && t.length < 100 && keywords.some(k => t.includes(k));
    });
    if (!el) return null;
    const clickTarget = el.closest('button') || el.closest('[role="button"]') || el.closest('[role="radio"]') || el.closest('label') || el;
    clickTarget.click();
    return el.textContent.trim();
  }, keywords, scope);
}

async function addTesterWithPuppeteer(username) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");

    // Set cookies on both FB domains
    const rawCookies = parseCookieString(META_PORTAL_COOKIES);
    for (const domain of [".facebook.com", "developers.facebook.com"]) {
      await page.setCookie(...rawCookies.map(c => ({ name: c.name, value: c.value, domain, path: "/", secure: true })));
    }

    const rolesUrl = `https://developers.facebook.com/apps/${META_APP_ID}/roles/roles/${META_BUSINESS_ID ? `?business_id=${META_BUSINESS_ID}` : ""}`;
    console.log(`[v${VERSION}] navigating to ${rolesUrl}`);

    await page.setRequestInterception(true);
    page.on("request", req => req.continue());

    await page.goto(rolesUrl, { waitUntil: "networkidle2", timeout: 60000 });

    const currentUrl = page.url();
    console.log(`[puppeteer] landed on ${currentUrl}`);
    if (currentUrl.includes("/login") || currentUrl.includes("checkpoint")) {
      throw new Error("Cookies expiradas — sessão inválida.");
    }

    // Wait for React to render fully
    await new Promise(r => setTimeout(r, 6000));

    // ── STEP 1: Click "Adicionar pessoas" button ──
    console.log("[puppeteer] looking for 'Adicionar pessoas'...");
    const addBtnClicked = await page.evaluate(() => {
      const keywords = ["adicionar pessoas", "add people", "adicionar pessoa"];
      const all = Array.from(document.querySelectorAll("*"));
      for (const el of all) {
        const t = (el.textContent || "").trim().toLowerCase();
        if (keywords.some(k => t === k) && el.children.length <= 3) {
          const target = el.closest("button") || el.closest('[role="button"]') || el;
          target.click();
          return el.textContent.trim();
        }
      }
      // Fallback: any button/div with "adicionar" text
      const fallback = all.find(el => {
        const t = (el.textContent || "").trim().toLowerCase();
        return (t === "adicionar" || t === "add") && el.children.length <= 2;
      });
      if (fallback) {
        (fallback.closest("button") || fallback).click();
        return fallback.textContent.trim() + " (fallback)";
      }
      return null;
    });

    console.log("[puppeteer] add btn clicked:", addBtnClicked);

    if (!addBtnClicked) {
      const visible = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button, [role="button"]'))
          .map(e => e.textContent?.trim()).filter(Boolean).slice(0, 15)
      );
      console.log("[puppeteer] visible buttons:", visible);
      throw new Error(`Botão "Adicionar pessoas" não encontrado. Botões: ${visible.join(" | ")}`);
    }

    // ── STEP 2: Wait for modal ──
    console.log("[puppeteer] waiting for modal...");
    try {
      await page.waitForSelector('[role="dialog"], [aria-modal="true"]', { timeout: 8000 });
    } catch {
      throw new Error("Modal não abriu após clicar em Adicionar pessoas");
    }
    await new Promise(r => setTimeout(r, 1500));

    // ── STEP 3: Select "Testador do Instagram" radio ──
    console.log("[puppeteer] selecting 'Testador do Instagram'...");
    const roleClicked = await page.evaluate(() => {
      const keywords = ["testador do instagram", "instagram tester"];
      const modal = document.querySelector('[role="dialog"], [aria-modal="true"]') || document;
      const all = Array.from(modal.querySelectorAll("*"));
      for (const el of all) {
        const t = (el.textContent || "").trim().toLowerCase();
        if (keywords.some(k => t.includes(k)) && el.children.length <= 2) {
          // Click the label or nearest radio/button
          const target =
            el.closest('label') ||
            el.closest('[role="radio"]') ||
            el.closest('[role="option"]') ||
            el.closest("button") ||
            el;
          target.click();
          return el.textContent.trim();
        }
      }
      // Try clicking radio input directly
      const inputs = Array.from(modal.querySelectorAll('input[type="radio"]'));
      const last = inputs[inputs.length - 1]; // Instagram tester is the last option
      if (last) { last.click(); return "radio-last"; }
      return null;
    });

    console.log("[puppeteer] role selected:", roleClicked);
    if (!roleClicked) throw new Error("Opção 'Testador do Instagram' não encontrada no modal");

    // Wait for the input field to appear after selecting the role
    await new Promise(r => setTimeout(r, 2000));

    // ── STEP 4: Type the Instagram username ──
    console.log("[puppeteer] looking for Instagram username input...");

    // Wait for input with Instagram placeholder
    try {
      await page.waitForFunction(() => {
        const modal = document.querySelector('[role="dialog"], [aria-modal="true"]') || document;
        return Array.from(modal.querySelectorAll('input')).some(i =>
          i.type !== "hidden" && i.type !== "radio" && i.type !== "checkbox"
        );
      }, { timeout: 5000 });
    } catch {
      throw new Error("Campo de username do Instagram não apareceu após selecionar a função");
    }

    const inputFilled = await page.evaluate((username) => {
      const modal = document.querySelector('[role="dialog"], [aria-modal="true"]') || document;
      const inp = Array.from(modal.querySelectorAll('input')).find(i =>
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

    // Type character by character to trigger autocomplete
    await page.keyboard.type(username, { delay: 80 });
    console.log(`[puppeteer] typed username: ${username}`);
    await new Promise(r => setTimeout(r, 3000));

    // ── STEP 5: Select from autocomplete if shown ──
    const autocomplete = await page.evaluate((username) => {
      const opts = Array.from(document.querySelectorAll(
        '[role="option"], [role="listbox"] li, [data-testid*="typeahead"] *, [data-testid*="suggest"] *'
      ));
      const match = opts.find(e => {
        const t = (e.textContent || "").toLowerCase();
        return t.includes(username.toLowerCase()) && e.children.length <= 3;
      });
      if (match) {
        (match.closest('[role="option"]') || match).click();
        return match.textContent.trim();
      }
      return null;
    }, username);
    console.log("[puppeteer] autocomplete selected:", autocomplete);
    if (autocomplete) await new Promise(r => setTimeout(r, 1500));

    // ── STEP 6: Click "Adicionar" confirm button ──
    console.log("[puppeteer] clicking confirm 'Adicionar'...");
    const submitted = await page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"], [aria-modal="true"]') || document;
      const btns = Array.from(modal.querySelectorAll('button, [role="button"]'));
      const cancelWords = ["cancelar", "cancel", "fechar", "close"];
      const submitWords = ["adicionar", "add", "confirmar", "confirm", "ok", "salvar", "save"];

      // Prefer exact match
      let btn = btns.find(b => {
        const t = (b.textContent || "").trim().toLowerCase();
        return submitWords.some(k => t === k);
      });
      // Fallback: includes match, not cancel
      if (!btn) {
        btn = btns.find(b => {
          const t = (b.textContent || "").trim().toLowerCase();
          return submitWords.some(k => t.includes(k)) && !cancelWords.some(k => t.includes(k));
        });
      }
      if (btn) {
        btn.click();
        return btn.textContent.trim();
      }
      return null;
    });

    console.log("[puppeteer] confirm submitted:", submitted);
    if (!submitted) {
      const modalBtns = await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"], [aria-modal="true"]') || document;
        return Array.from(modal.querySelectorAll('button, [role="button"]'))
          .map(b => b.textContent?.trim()).filter(Boolean);
      });
      throw new Error(`Botão "Adicionar" não encontrado. Botões no modal: ${modalBtns.join(" | ")}`);
    }

    // Wait for network to settle
    await new Promise(r => setTimeout(r, 4000));

    // Check for errors on page
    const finalCheck = await page.evaluate(() => {
      const text = (document.body?.innerText || "").toLowerCase();
      if (text.match(/\berro\b|\berror\b|failed|inválido|invalid/)) {
        const lines = document.body.innerText.split("\n")
          .filter(l => /erro|error|failed|invalid/i.test(l))
          .map(l => l.trim())
          .filter(Boolean);
        return { ok: false, error: lines[0] || "Erro detectado" };
      }
      return { ok: true };
    });

    console.log("[puppeteer] final result:", finalCheck);
    return finalCheck;

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
