import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { parseApexVips, processSaleWebhook } from "@/lib/salesWebhook";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ igUsername: string }> },
) {
  // Clone body before responding (stream can only be read once)
  const raw = await request.text().catch(() => "");

  // Respond 200 immediately — process in background so we never timeout
  waitUntil(
    (async () => {
      try {
        const { igUsername: rawSlug } = await context.params;
        const igUsername = rawSlug.replace("@", "").toLowerCase();

        let body: Record<string, unknown>;
        try { body = JSON.parse(raw); } catch { return; }

        const account = await prisma.instagramOAuthAccount.findFirst({
          where: { username: { equals: igUsername, mode: "insensitive" } },
          select: { userId: true, username: true },
        });
        if (!account) return;

        const parsed = parseApexVips(body);
        if (!parsed) return;

        const transaction = (body.transaction ?? {}) as Record<string, unknown>;
        const gateway = String(transaction.payment_platform ?? "apexvips");

        // Use utm_source (trackingCode) when present — multi-account UTM tracking
        // Falls back to the account in the webhook URL when no utm_source
        const igOverride = parsed.trackingCode ? undefined : account.username;
        await processSaleWebhook(gateway, account.userId, parsed, raw, igOverride);
      } catch {}
    })()
  );

  return NextResponse.json({ ok: true });
}
