import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAdmin(email: string | undefined) {
  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  return email === adminEmail || email === "sistemaauto@gmail.com";
}

async function checkAuth(request: Request) {
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secretParam === cronSecret) return true;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return isAdmin(user?.email);
  } catch { return false; }
}

// GET — diagnose why a clone is not posting
export async function GET(request: Request) {
  if (!await checkAuth(request)) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const cloneId = searchParams.get("cloneId");
  if (!cloneId) return NextResponse.json({ error: "cloneId obrigatório" }, { status: 400 });

  const now = new Date();

  const [pastDue, future, firstPost] = await Promise.all([
    prisma.scheduledPost.count({ where: { cloneJobId: cloneId, status: "PENDING", scheduledAt: { lte: now } } }),
    prisma.scheduledPost.count({ where: { cloneJobId: cloneId, status: "PENDING", scheduledAt: { gt: now } } }),
    prisma.scheduledPost.findFirst({
      where: { cloneJobId: cloneId, status: "PENDING" },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true, rawVideoUrl: true, videoId: true, errorMsg: true },
    }),
  ]);

  const accountIds = (await prisma.scheduledPost.findMany({
    where: { cloneJobId: cloneId },
    select: { accountId: true },
    distinct: ["accountId"],
  })).map(a => a.accountId);

  const accounts = await prisma.instagramOAuthAccount.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, username: true, accountStatus: true, lastError: true },
  });

  const statusGroups = accounts.reduce((acc, a) => {
    const s = a.accountStatus ?? "null";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const nonActive = accounts.filter(a => a.accountStatus !== "ACTIVE");

  return NextResponse.json({
    cloneId,
    now: now.toISOString(),
    pendingPastDue: pastDue,
    pendingFuture: future,
    firstPending: firstPost ? {
      scheduledAt: firstPost.scheduledAt,
      isPastDue: firstPost.scheduledAt <= now,
      hasVideo: !!(firstPost.videoId || firstPost.rawVideoUrl),
      errorMsg: firstPost.errorMsg,
    } : null,
    accountsTotal: accounts.length,
    accountStatusGroups: statusGroups,
    nonActiveAccounts: nonActive.slice(0, 20).map(a => ({ username: a.username, status: a.accountStatus, lastError: a.lastError?.slice(0, 80) })),
    diagnosis: pastDue === 0 && future > 0
      ? "FUTURE_SCHEDULED: todos os posts estão agendados para o futuro — use POST com action=reschedule"
      : nonActive.length > 0
      ? `NON_ACTIVE_ACCOUNTS: ${nonActive.length} contas não-ACTIVE bloqueando postagem — use POST com action=activate`
      : pastDue > 0
      ? "ELIGIBLE: há posts vencidos com contas ativas — cron deveria estar processando"
      : "NO_PENDING: nenhum post pendente",
  });
}

// POST — apply fix
export async function POST(request: Request) {
  if (!await checkAuth(request)) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const body = await request.json() as { cloneId?: string; action?: string };
  const { cloneId, action } = body;
  if (!cloneId || !action) return NextResponse.json({ error: "cloneId e action obrigatórios" }, { status: 400 });

  const now = new Date();

  if (action === "reschedule") {
    // Move future PENDING posts to now so cron picks them up
    const r = await prisma.scheduledPost.updateMany({
      where: { cloneJobId: cloneId, status: "PENDING", scheduledAt: { gt: now } },
      data: { scheduledAt: now },
    });
    return NextResponse.json({ ok: true, action, rescheduled: r.count });
  }

  if (action === "activate") {
    // Activate non-SUSPENDED accounts (QUARANTINE, null, etc.)
    const accountIds = (await prisma.scheduledPost.findMany({
      where: { cloneJobId: cloneId },
      select: { accountId: true },
      distinct: ["accountId"],
    })).map(a => a.accountId);

    const r = await prisma.instagramOAuthAccount.updateMany({
      where: { id: { in: accountIds }, accountStatus: { notIn: ["ACTIVE", "SUSPENDED"] } },
      data: { accountStatus: "ACTIVE", quarantinedUntil: null, lastError: null },
    });

    // Also reset their FAILED posts so they get retried
    const posts = await prisma.scheduledPost.updateMany({
      where: { cloneJobId: cloneId, status: "FAILED", retryCount: { gte: 6 } },
      data: { status: "PENDING", retryCount: 0, errorMsg: null, containerCreationId: null, containerCreatedAt: null, scheduledAt: now },
    });

    return NextResponse.json({ ok: true, action, accountsActivated: r.count, postsReset: posts.count });
  }

  if (action === "fix-all") {
    // Apply both fixes at once
    const futureReset = await prisma.scheduledPost.updateMany({
      where: { cloneJobId: cloneId, status: "PENDING", scheduledAt: { gt: now } },
      data: { scheduledAt: now },
    });

    const accountIds = (await prisma.scheduledPost.findMany({
      where: { cloneJobId: cloneId },
      select: { accountId: true },
      distinct: ["accountId"],
    })).map(a => a.accountId);

    const activatedAccounts = await prisma.instagramOAuthAccount.updateMany({
      where: { id: { in: accountIds }, accountStatus: { notIn: ["ACTIVE", "SUSPENDED"] } },
      data: { accountStatus: "ACTIVE", quarantinedUntil: null, lastError: null },
    });

    const failedReset = await prisma.scheduledPost.updateMany({
      where: { cloneJobId: cloneId, status: "FAILED", retryCount: { gte: 6 } },
      data: { status: "PENDING", retryCount: 0, errorMsg: null, containerCreationId: null, containerCreatedAt: null, scheduledAt: now },
    });

    return NextResponse.json({ ok: true, action, rescheduled: futureReset.count, accountsActivated: activatedAccounts.count, postsReset: failedReset.count });
  }

  return NextResponse.json({ error: "action inválida. Use: reschedule | activate | fix-all" }, { status: 400 });
}
