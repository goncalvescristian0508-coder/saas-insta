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
  context: { params: Promise<{ userId: string }> },
) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.text().catch(() => "");

  waitUntil(
    (async () => {
      try {
        const { userId } = await context.params;
        if (!userId) return;

        let body: Record<string, unknown>;
        try { body = JSON.parse(raw); } catch { return; }

        const parsed = parseApexVips(body);
        if (!parsed) return;

        const tracking = (body.tracking ?? {}) as Record<string, unknown>;
        const utmSource = String(tracking.utm_source ?? "").replace("@", "").toLowerCase().trim() || undefined;

        // Try to normalize igUsername from utm_source — save even if not a connected account
        const igUsername = utmSource ?? undefined;

        const transaction = (body.transaction ?? {}) as Record<string, unknown>;
        const gateway = String(transaction.payment_platform ?? "apexvips");

        await processSaleWebhook(gateway, userId, parsed, raw, igUsername);
      } catch {}
    })()
  );

  return NextResponse.json({ ok: true });
}
