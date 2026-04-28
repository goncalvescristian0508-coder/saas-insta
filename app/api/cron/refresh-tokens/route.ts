import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptAccountPassword, decryptAccountPassword } from "@/lib/accountCrypto";
import { refreshLongLivedToken } from "@/lib/instagramGraphPublish";

export const runtime = "nodejs";
export const maxDuration = 60;

// Runs daily — refreshes tokens expiring in the next 10 days
export async function GET(request: Request) {
  const secret = request.headers.get("x-cron-secret") ?? new URL(request.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threshold = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days from now

  const accounts = await prisma.instagramOAuthAccount.findMany({
    where: {
      OR: [
        { tokenExpiresAt: { lte: threshold } },
        { tokenExpiresAt: null },
      ],
    },
  });

  let refreshed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const account of accounts) {
    try {
      const currentToken = decryptAccountPassword(account.accessTokenEnc);
      const { access_token, expires_in } = await refreshLongLivedToken(currentToken);
      const tokenExpiresAt = expires_in > 0
        ? new Date(Date.now() + expires_in * 1000)
        : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days default

      await prisma.instagramOAuthAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEnc: encryptAccountPassword(access_token),
          tokenExpiresAt,
          lastError: null,
        },
      });
      refreshed++;
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`@${account.username}: ${msg}`);
      await prisma.instagramOAuthAccount.update({
        where: { id: account.id },
        data: { lastError: `Token expirado — reconecte a conta. (${msg})` },
      }).catch(() => {});
    }
  }

  return NextResponse.json({ refreshed, failed, errors, total: accounts.length });
}
