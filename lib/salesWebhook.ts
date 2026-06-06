import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

export interface ParsedSale {
  gatewayOrderId: string;
  amount: number;
  status: "APPROVED" | "PENDING" | "REFUNDED" | "CANCELLED";
  customerName?: string;
  customerEmail?: string;
  trackingCode?: string;
  planName?: string;
}

// ─── Platform auto-detection ────────────────────────────────────────────────

/** Tries every known parser. Returns the first match or null. */
export function detectAndParseSale(body: Record<string, unknown>): { gateway: string; parsed: ParsedSale | null } {
  if (isHotmart(body)) return { gateway: "hotmart", parsed: parseHotmart(body) };
  if (isKirvano(body)) return { gateway: "kirvano", parsed: parseKirvano(body) };
  if (isEduzz(body)) return { gateway: "eduzz", parsed: parseEduzz(body) };
  if (isPushinPay(body)) return { gateway: "pushinpay", parsed: parsePushinPay(body) };
  // ApexVips fallback (also catches many other generic gateways)
  return { gateway: detectGatewayLabel(body), parsed: parseApexVips(body) };
}

/** Extract utm_source across all known payload shapes */
export function extractUtmSource(body: Record<string, unknown>): string | undefined {
  const tracking = (body.tracking ?? {}) as Record<string, unknown>;
  const data = (body.data ?? {}) as Record<string, unknown>;
  const purchase = (data.purchase ?? {}) as Record<string, unknown>;

  const raw = String(
    tracking.utm_source ??
    tracking.src ??
    tracking.slug ??
    purchase.tracking_source_name ??
    body.utm_source ??
    ""
  ).replace("@", "").toLowerCase().trim();

  return raw || undefined;
}

function detectGatewayLabel(body: Record<string, unknown>): string {
  const transaction = (body.transaction ?? {}) as Record<string, unknown>;
  return String(transaction.payment_platform ?? body.gateway ?? "unknown").toLowerCase();
}

// ─── Hotmart ─────────────────────────────────────────────────────────────────

function isHotmart(body: Record<string, unknown>): boolean {
  const ev = String(body.event ?? "").toUpperCase();
  return ev.startsWith("PURCHASE_") && typeof (body as Record<string, unknown>).data === "object";
}

function parseHotmart(body: Record<string, unknown>): ParsedSale | null {
  const ev = String(body.event ?? "").toUpperCase();
  let status: ParsedSale["status"];
  if (ev === "PURCHASE_APPROVED" || ev === "PURCHASE_COMPLETE") status = "APPROVED";
  else if (ev === "PURCHASE_BILLET_PRINTED" || ev === "PURCHASE_WAITING_PAYMENT") status = "PENDING";
  else if (ev === "PURCHASE_REFUNDED" || ev === "PURCHASE_REVERSED") status = "REFUNDED";
  else if (ev === "PURCHASE_CANCELLED" || ev === "PURCHASE_EXPIRED" || ev === "PURCHASE_CHARGEBACK") status = "CANCELLED";
  else return null;

  const data = (body.data ?? {}) as Record<string, unknown>;
  const buyer = (data.buyer ?? {}) as Record<string, unknown>;
  const purchase = (data.purchase ?? {}) as Record<string, unknown>;
  const offer = (purchase.original_offer_price ?? purchase.offer_price ?? {}) as Record<string, unknown>;

  const orderId = String(purchase.transaction ?? purchase.order_id ?? "");
  if (!orderId) return null;

  const amount = Number(offer.value ?? 0);
  const planName = String((data.product as Record<string, unknown>)?.name ?? "").trim() || undefined;

  return {
    gatewayOrderId: orderId,
    amount,
    status,
    customerName: String(buyer.name ?? "").trim() || undefined,
    customerEmail: String(buyer.email ?? "").trim() || undefined,
    planName,
    trackingCode: String(purchase.tracking_source_name ?? "").trim() || undefined,
  };
}

// ─── Kirvano ─────────────────────────────────────────────────────────────────

function isKirvano(body: Record<string, unknown>): boolean {
  const ev = String(body.event ?? "").toLowerCase();
  return ev.startsWith("sale.") || (typeof body.sale === "object" && body.sale !== null);
}

function parseKirvano(body: Record<string, unknown>): ParsedSale | null {
  const ev = String(body.event ?? "").toLowerCase();
  let status: ParsedSale["status"];
  if (ev === "sale.approved" || ev === "sale.complete") status = "APPROVED";
  else if (ev === "sale.pending" || ev === "sale.waiting_payment") status = "PENDING";
  else if (ev === "sale.refunded") status = "REFUNDED";
  else if (ev === "sale.cancelled" || ev === "sale.expired") status = "CANCELLED";
  else return null;

  const sale = (body.sale ?? {}) as Record<string, unknown>;
  const customer = (body.customer ?? {}) as Record<string, unknown>;
  const tracking = (body.tracking ?? {}) as Record<string, unknown>;

  const orderId = String(sale.id ?? sale.ref ?? sale.order_id ?? body.id ?? "");
  if (!orderId) return null;

  // Kirvano sends amount in cents
  const raw = Number(sale.amount ?? sale.price ?? sale.value ?? 0);
  const amount = raw > 1000 ? raw / 100 : raw;

  return {
    gatewayOrderId: orderId,
    amount,
    status,
    customerName: String(customer.name ?? customer.full_name ?? "").trim() || undefined,
    customerEmail: String(customer.email ?? "").trim() || undefined,
    planName: String(sale.plan_name ?? sale.product_name ?? "").trim() || undefined,
    trackingCode: String(tracking.src ?? tracking.utm_source ?? "").trim() || undefined,
  };
}

// ─── Eduzz ───────────────────────────────────────────────────────────────────

function isEduzz(body: Record<string, unknown>): boolean {
  const type = String(body.type ?? "").toLowerCase();
  return type.startsWith("eduzz:") || typeof body.invoice_key === "string";
}

function parseEduzz(body: Record<string, unknown>): ParsedSale | null {
  const type = String(body.type ?? "").toLowerCase();
  let status: ParsedSale["status"];
  if (type.includes("paid") || type.includes("approv")) status = "APPROVED";
  else if (type.includes("pend") || type.includes("await")) status = "PENDING";
  else if (type.includes("refund") || type.includes("chargeback")) status = "REFUNDED";
  else if (type.includes("cancel") || type.includes("expir")) status = "CANCELLED";
  else return null;

  const orderId = String(body.invoice_key ?? body.transaction_id ?? body.order_id ?? "");
  if (!orderId) return null;

  const amount = Number(body.total_price ?? body.invoice_total ?? body.value ?? 0);

  return {
    gatewayOrderId: orderId,
    amount,
    status,
    customerName: String(body.client_name ?? body.customer_name ?? "").trim() || undefined,
    customerEmail: String(body.client_email ?? body.customer_email ?? "").trim() || undefined,
    planName: String(body.product_name ?? body.plan_name ?? "").trim() || undefined,
    trackingCode: String(body.tracker ?? body.utm_source ?? "").trim() || undefined,
  };
}

// ─── PushinPay ────────────────────────────────────────────────────────────────

function isPushinPay(body: Record<string, unknown>): boolean {
  const ev = String(body.event ?? "").toLowerCase();
  return ev.includes("pushin") || String(body.gateway ?? "").toLowerCase() === "pushinpay";
}

function parsePushinPay(body: Record<string, unknown>): ParsedSale | null {
  return parseApexVips(body); // similar shape
}

// ─── ApexVips native webhook ─────────────────────────────────────────────────

// ApexVips native webhook — handles multiple event name variants
export function parseApexVips(body: Record<string, unknown>): ParsedSale | null {
  const event = String(body.event ?? body.type ?? body.action ?? body.notification_type ?? "").toLowerCase();
  if (!event) return null;

  // Determine status from event name (handle variants)
  let status: ParsedSale["status"];
  if (event.includes("approv") || event.includes("paid") || event.includes("success") || event.includes("complet") || event.includes("confirm") || event === "payment_complete") {
    status = "APPROVED";
  } else if (event.includes("creat") || event.includes("generat") || event.includes("pending") || event.includes("pix_generated") || event.includes("wait")) {
    status = "PENDING";
  } else if (event.includes("refund")) {
    status = "REFUNDED";
  } else if (event.includes("cancel") || event.includes("expir") || event.includes("reject")) {
    status = "CANCELLED";
  } else {
    return null;
  }

  const transaction = (body.transaction ?? {}) as Record<string, unknown>;
  const customer = (body.customer ?? {}) as Record<string, unknown>;

  const orderId = String(
    transaction.internal_transaction_id ??
    transaction.external_transaction_id ??
    transaction.id ??
    transaction.order_id ??
    body.transaction_id ??
    body.order_id ??
    ""
  );
  if (!orderId) return null;

  // plan_value comes in cents (e.g. 4990 = R$49,90)
  const amount = Number(transaction.plan_value ?? 0) / 100;

  const customerName = String(customer.full_name ?? customer.profile_name ?? "");
  const customerEmail = String(customer.email ?? "");

  const tracking = (body.tracking ?? {}) as Record<string, unknown>;
  const trackingCode = String(transaction.sale_code ?? tracking.utm_source ?? tracking.slug ?? "") || undefined;
  const planName = String(transaction.plan_name ?? transaction.category ?? "") || undefined;

  return {
    gatewayOrderId: orderId,
    amount,
    status,
    customerName: customerName || undefined,
    customerEmail: customerEmail || undefined,
    trackingCode,
    planName,
  };
}

export async function sendTelegramNotification(userId: string, sale: {
  gateway: string;
  amount: number;
  status: string;
  customerName?: string;
  customerEmail?: string;
  igUsername?: string;
  gatewayOrderId: string;
}): Promise<void> {
  try {
    const integration = await prisma.userIntegration.findUnique({ where: { userId_type: { userId, type: "telegram" } } });
    if (!integration) return;
    const cfg = JSON.parse(integration.config) as { botToken?: string; chatId?: string };
    if (!cfg.botToken || !cfg.chatId) return;

    const statusEmoji: Record<string, string> = { APPROVED: "✅", PENDING: "⏳", REFUNDED: "↩️", CANCELLED: "❌" };
    const emoji = statusEmoji[sale.status] ?? "🛍️";

    const gatewayLabel: Record<string, string> = {
      pushinpay: "PushinPay", wiinpay: "WiinPay", syncpay: "SyncPay", apexvips: "ApexVips",
    };

    const text = [
      `${emoji} *Nova Venda — ${gatewayLabel[sale.gateway] ?? sale.gateway}*`,
      ``,
      `💰 *Valor:* R$ ${sale.amount.toFixed(2).replace(".", ",")}`,
      `📊 *Status:* ${sale.status}`,
      sale.customerName ? `👤 *Cliente:* ${sale.customerName}` : null,
      sale.customerEmail ? `📧 *Email:* ${sale.customerEmail}` : null,
      sale.igUsername ? `📸 *Conta IG:* @${sale.igUsername}` : null,
      `🔖 *Pedido:* \`${sale.gatewayOrderId}\``,
    ].filter(Boolean).join("\n");

    await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: "Markdown" }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {}
}

export async function processSaleWebhook(
  gateway: string,
  userId: string,
  parsed: ParsedSale,
  rawPayload: string,
  igUsernameOverride?: string,
): Promise<void> {
  const igUsername = igUsernameOverride ?? parsed.trackingCode?.replace("@", "") ?? undefined;

  const sale = await prisma.sale.upsert({
    where: { userId_gateway_gatewayOrderId: { userId, gateway, gatewayOrderId: parsed.gatewayOrderId } },
    create: {
      userId,
      gateway,
      gatewayOrderId: parsed.gatewayOrderId,
      amount: parsed.amount,
      status: parsed.status,
      customerName: parsed.customerName,
      customerEmail: parsed.customerEmail,
      igUsername,
      planName: parsed.planName,
      trackingCode: parsed.trackingCode,
      rawPayload,
    },
    update: {
      status: parsed.status,
      customerName: parsed.customerName,
      customerEmail: parsed.customerEmail,
      igUsername: igUsernameOverride ?? undefined,
      planName: parsed.planName ?? undefined,
      trackingCode: parsed.trackingCode ?? undefined,
    },
  });

  if (parsed.status === "APPROVED" && !sale.telegramSent) {
    await sendTelegramNotification(userId, {
      gateway,
      amount: sale.amount,
      status: sale.status,
      customerName: sale.customerName ?? undefined,
      customerEmail: sale.customerEmail ?? undefined,
      igUsername: sale.igUsername ?? undefined,
      gatewayOrderId: sale.gatewayOrderId,
    });
    await prisma.sale.update({ where: { id: sale.id }, data: { telegramSent: true } });
  }

  // Load notification settings
  const notifIntegration = await prisma.userIntegration.findUnique({
    where: { userId_type: { userId, type: "notifications" } },
  }).catch(() => null);
  const notifCfg = notifIntegration ? (() => { try { return JSON.parse(notifIntegration.config) as Record<string, string>; } catch { return {}; } })() : {};
  const customName = notifCfg.customName?.trim() || "AutoPost";

  // Push notification for APPROVED and PENDING
  const valor = `R$ ${sale.amount.toFixed(2).replace(".", ",")}`;
  if (parsed.status === "APPROVED" && notifCfg.approvedEnabled !== "false") {
    await sendPushToUser(userId, {
      title: `Venda aprovada! | ${customName}`,
      body: `Valor: ${valor}`,
      url: "/vendas",
    }).catch(() => {});
  } else if (parsed.status === "PENDING" && notifCfg.pendingEnabled !== "false") {
    await sendPushToUser(userId, {
      title: `Pix gerado! | ${customName}`,
      body: `Valor: ${valor}`,
      url: "/vendas",
    }).catch(() => {});
  }
}
