import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { parseApexVips, processSaleWebhook } from "@/lib/salesWebhook";
import { verifyWebhookSecret } from "@/lib/webhookAuth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.text().catch(() => "");

  waitUntil(
    (async () => {
      try {
        const { accountId } = await context.params;

        const account = await prisma.instagramOAuthAccount.findUnique({
          where: { id: accountId },
          select: { userId: true, username: true },
        });
        if (!account) return;

        let body: Record<string, unknown>;
        try { body = JSON.parse(raw); } catch { return; }

        const parsed = parseApexVips(body);
        if (!parsed) return;

        const transaction = (body.transaction ?? {}) as Record<string, unknown>;
        const gateway = String(transaction.payment_platform ?? "apexvips");

        await processSaleWebhook(gateway, account.userId, parsed, raw, account.username);
      } catch {}
    })()
  );

  return NextResponse.json({ ok: true });
}
