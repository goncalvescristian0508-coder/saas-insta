import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function isAdmin(email: string | undefined) {
  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  return email === adminEmail;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const [suspended, quarantine, counts] = await Promise.all([
    prisma.instagramOAuthAccount.findMany({
      where: { accountStatus: "SUSPENDED" },
      select: { id: true, username: true, lastError: true, updatedAt: true, appKey: true, tokenExpiresAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.instagramOAuthAccount.findMany({
      where: { accountStatus: "QUARANTINE" },
      select: { id: true, username: true, lastError: true, quarantinedUntil: true },
    }),
    prisma.instagramOAuthAccount.groupBy({
      by: ["accountStatus"],
      _count: { _all: true },
    }),
  ]);

  // Group suspended accounts by error reason
  const byReason: Record<string, string[]> = {};
  for (const acc of suspended) {
    const reason = acc.lastError ?? "(sem erro registrado)";
    const shortReason = reason.length > 120 ? reason.slice(0, 120) + "..." : reason;
    if (!byReason[shortReason]) byReason[shortReason] = [];
    byReason[shortReason].push(`@${acc.username}`);
  }

  // Last 10 failed posts with error message
  const recentFailed = await prisma.scheduledPost.findMany({
    where: { status: "FAILED", updatedAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
    select: { errorMsg: true, updatedAt: true, account: { select: { username: true } } },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    counts: Object.fromEntries(counts.map(c => [c.accountStatus, c._count._all])),
    suspendedByReason: byReason,
    suspendedAccounts: suspended.map(a => ({
      username: a.username,
      appKey: a.appKey,
      tokenExpiresAt: a.tokenExpiresAt,
      lastError: a.lastError,
      updatedAt: a.updatedAt,
    })),
    quarantineAccounts: quarantine.map(a => ({
      username: a.username,
      lastError: a.lastError,
      quarantinedUntil: a.quarantinedUntil,
    })),
    recentFailedPosts: recentFailed.map(p => ({
      username: p.account.username,
      errorMsg: p.errorMsg,
      updatedAt: p.updatedAt,
    })),
  });
}
