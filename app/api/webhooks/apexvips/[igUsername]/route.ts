import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { parseApexVips, processSaleWebhook } from "@/lib/salesWebhook";
import { verifyWebhookSecret } from "@/lib/webhookAuth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true });
}

/** Tries to resolve userId for a given igUsername via multiple lookups */
async function resolveUserId(igUsername: string): Promise<string | null> {
  // 1. OAuth account (most common)
  const oauthAccount = await prisma.instagramOAuthAccount.findFirst({
    where: { username: { equals: igUsername, mode: "insensitive" } },
    select: { userId: true },
  });
  if (oauthAccount) return oauthAccount.userId;

  // 2. Private IG account
  const privateAccount = await prisma.privateInstagramAccount.findFirst({
    where: { username: { equals: igUsername, mode: "insensitive" } },
    select: { userId: true },
  });
  if (privateAccount?.userId) return privateAccount.userId;

  // 3. Previous sale with same igUsername — use the same user
  const prevSale = await prisma.sale.findFirst({
    where: { igUsername: { equals: igUsername, mode: "insensitive" } },
    select: { userId: true },
    orderBy: { createdAt: "desc" },
  });
  if (prevSale) return prevSale.userId;

  // 4. Fallback: admin user
  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM auth.users WHERE email = ${adminEmail} LIMIT 1
    `;
    return rows[0]?.id ?? null;
  } catch {
    return null;
  }
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

        const parsed = parseApexVips(body);
        if (!parsed) return;

        const transaction = (body.transaction ?? {}) as Record<string, unknown>;
        const gateway = String(transaction.payment_platform ?? "apexvips");

        const userId = await resolveUserId(igUsername);
        if (!userId) return;

        await processSaleWebhook(gateway, userId, parsed, raw, igUsername);
      } catch {}
    })()
  );

  return NextResponse.json({ ok: true });
}
