import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { decryptAccountPassword } from "@/lib/accountCrypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const GRAPH = "https://graph.instagram.com/v21.0";

function isAdmin(email: string | undefined) {
  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  return email === adminEmail;
}

// Checkpoint errors that can be auto-resolved once the user dismisses on Instagram
const CHECKPOINT_PHRASES = [
  "you cannot access the app till you log in",
  "needs to complete a checkpoint",
];

function isCheckpointError(msg: string | null): boolean {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return CHECKPOINT_PHRASES.some(p => lower.includes(p));
}

async function testToken(accessToken: string, igUserId: string): Promise<"ok" | "checkpoint" | "other_error"> {
  try {
    const res = await fetch(
      `${GRAPH}/${igUserId}?fields=id,username`,
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8_000) }
    );
    const json = await res.json() as { id?: string; error?: { message?: string } };
    if (res.ok && json.id) return "ok";
    const msg = (json.error?.message ?? "").toLowerCase();
    if (CHECKPOINT_PHRASES.some(p => msg.includes(p))) return "checkpoint";
    return "other_error";
  } catch {
    return "other_error";
  }
}

export async function GET() {
  // Preview: show how many checkpoint-suspended accounts there are without changing anything
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const count = await prisma.instagramOAuthAccount.count({
    where: { accountStatus: "SUSPENDED", lastError: { contains: "cannot access the app till you log in" } },
  });
  const count2 = await prisma.instagramOAuthAccount.count({
    where: { accountStatus: "SUSPENDED", lastError: { contains: "needs to complete a checkpoint" } },
  });

  return NextResponse.json({
    checkpointSuspended: count + count2,
    hint: "POST para verificar cada conta na API do Instagram e reativar apenas as que já resolveram o checkpoint.",
  });
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = request.headers.get("authorization");
  const validBearer = !!cronSecret && bearer === `Bearer ${cronSecret}`;
  if (!validBearer) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user.email)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
  }

  const { searchParams } = new URL(request.url);
  const batchSize = Math.min(Number(searchParams.get("batch") ?? "30"), 50);

  const all = await prisma.instagramOAuthAccount.findMany({
    where: {
      accountStatus: "SUSPENDED",
      OR: [
        { lastError: { contains: "cannot access the app till you log in" } },
        { lastError: { contains: "needs to complete a checkpoint" } },
      ],
    },
    select: { id: true, username: true, instagramUserId: true, accessTokenEnc: true, lastError: true },
    take: batchSize,
  });

  if (all.length === 0) {
    return NextResponse.json({ message: "Nenhuma conta de checkpoint para verificar.", recovered: 0, stillBlocked: 0 });
  }

  // Test each token against the Graph API in parallel
  const results = await Promise.all(
    all.map(async (account) => {
      try {
        const token = decryptAccountPassword(account.accessTokenEnc);
        const status = await testToken(token, account.instagramUserId);
        return { account, tokenStatus: status };
      } catch {
        return { account, tokenStatus: "other_error" as const };
      }
    })
  );

  const recovered = results.filter(r => r.tokenStatus === "ok").map(r => r.account);
  const stillBlocked = results.filter(r => r.tokenStatus === "checkpoint");
  const otherError = results.filter(r => r.tokenStatus === "other_error");

  // Reset only the ones that passed the test
  if (recovered.length > 0) {
    await prisma.instagramOAuthAccount.updateMany({
      where: { id: { in: recovered.map(a => a.id) } },
      data: { accountStatus: "ACTIVE", lastError: null },
    });

    // Re-queue their failed posts
    await prisma.scheduledPost.updateMany({
      where: {
        accountId: { in: recovered.map(a => a.id) },
        status: "FAILED",
        retryCount: { gte: 6 },
      },
      data: { status: "PENDING", errorMsg: null, retryCount: 0, scheduledAt: new Date() },
    });
  }

  return NextResponse.json({
    tested: all.length,
    recovered: recovered.length,
    recoveredAccounts: recovered.map(a => `@${a.username}`),
    stillBlocked: stillBlocked.length,
    otherError: otherError.length,
    hint: all.length === batchSize
      ? `Há mais contas para verificar. Chame novamente (máx ${batchSize} por vez).`
      : "Todas as contas de checkpoint foram verificadas.",
  });
}
