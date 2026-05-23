import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { sendTelegramNotification } from "@/lib/salesWebhook";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAdmin(email: string | undefined) {
  return email === (process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com");
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await request.json() as {
    userId: string;
    count: number;
    intervalSeconds: number;
    minAmount: number;
    maxAmount: number;
    accountName?: string;
  };

  const { userId, count = 5, intervalSeconds = 3, minAmount = 49.90, maxAmount = 197.00, accountName } = body;
  if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });

  const safeCount = Math.min(Math.max(1, count), 100);
  const safeInterval = Math.min(Math.max(1, intervalSeconds), 60) * 1000;

  // Busca o nome personalizado configurado pelo usuário
  const notifIntegration = await prisma.userIntegration.findUnique({
    where: { userId_type: { userId, type: "notifications" } },
  }).catch(() => null);
  const notifCfg = notifIntegration ? (() => { try { return JSON.parse(notifIntegration.config) as Record<string, string>; } catch { return {}; } })() : {};
  const customName = notifCfg.customName?.trim() || "AutoPost";

  waitUntil(
    (async () => {
      for (let i = 0; i < safeCount; i++) {
        if (i > 0) await delay(safeInterval);

        const amount = minAmount === maxAmount
          ? minAmount
          : Math.round((minAmount + Math.random() * (maxAmount - minAmount)) * 100) / 100;

        const valor = `R$ ${amount.toFixed(2).replace(".", ",")}`;

        await sendPushToUser(userId, {
          title: `Venda aprovada! | ${customName}`,
          body: `Valor: ${valor}`,
          url: "/vendas",
        }).catch(() => {});

        await sendTelegramNotification(userId, {
          gateway: "apexvips",
          amount,
          status: "APPROVED",
          customerName: `Cliente ${i + 1}`,
          igUsername: accountName,
          gatewayOrderId: `DEMO-${Date.now()}-${i}`,
        }).catch(() => {});
      }
    })()
  );

  return NextResponse.json({ ok: true, count: safeCount });
}
