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

// ApexVips native webhook — handles multiple event name variants
export function parseApexVips(body: Record<string, unknown>): ParsedSale | null {
  const event = String(body.event ?? body.type ?? body.action ?? body.notification_type ?? "").toLowerCase();
  if (!event) return null;

  // Determine status from event name (handle variants)
  let status: ParsedSale["status"];
  if (event.includes("approv") || event.includes("paid") || event.includes("complet") || event.includes("confirm") || event === "payment_complete") {
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
  const trackingCode = String(transaction.sale_code ?? tracking.slug ?? tracking.utm_source ?? "") || undefined;
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
    where: { gateway_gatewayOrderId: { gateway, gatewayOrderId: parsed.gatewayOrderId } },
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
