import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { detectAndParseSale, extractUtmSource, processSaleWebhook } from "@/lib/salesWebhook";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const raw = await request.text().catch(() => "");

  waitUntil(
    (async () => {
      try {
        const { userId } = await context.params;
        if (!userId) return;

        let body: Record<string, unknown>;
        try { body = JSON.parse(raw); } catch { return; }

        const { gateway, parsed } = detectAndParseSale(body);
        if (!parsed) return;

        const utmSource = extractUtmSource(body);

        // Only link igUsername if the account actually exists for this user
        let igUsername: string | undefined;
        if (utmSource) {
          const account = await prisma.instagramOAuthAccount.findFirst({
            where: { userId, username: { equals: utmSource, mode: "insensitive" } },
            select: { id: true, username: true },
          });
          igUsername = account ? account.username : undefined;
        }

        await processSaleWebhook(gateway, userId, parsed, raw, igUsername ?? utmSource);
      } catch {}
    })()
  );

  return NextResponse.json({ ok: true });
}
