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
  context: { params: Promise<{ igUsername: string }> },
) {
  if (!verifyWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.text().catch(() => "");

  waitUntil(
    (async () => {
      try {
        const { igUsername: rawSlug } = await context.params;
        const igUsername = rawSlug.replace("@", "").toLowerCase();

        let body: Record<string, unknown>;
        try { body = JSON.parse(raw); } catch { return; }

        const accounts = await prisma.instagramOAuthAccount.findMany({
          where: { username: { equals: igUsername, mode: "insensitive" } },
          select: { userId: true, username: true },
        });
        if (!accounts.length) return;

        const parsed = parseApexVips(body);
        if (!parsed) return;

        const transaction = (body.transaction ?? {}) as Record<string, unknown>;
        const gateway = String(transaction.payment_platform ?? "apexvips");

        await Promise.all(
          accounts.map(account =>
            processSaleWebhook(gateway, account.userId, parsed, raw, account.username)
          )
        );
      } catch {}
    })()
  );

  return NextResponse.json({ ok: true });
}
