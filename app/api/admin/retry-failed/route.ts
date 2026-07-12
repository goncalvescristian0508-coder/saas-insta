import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ADMIN_EMAIL = "goncalvescristian0508@gmail.com";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const validBearer = !!cronSecret && auth === `Bearer ${cronSecret}`;

  if (!validBearer) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }
  }

  const now = new Date();

  // Reset ALL failed posts to pending, zeroing retryCount and scheduledAt so the cron picks them up immediately
  const result = await prisma.scheduledPost.updateMany({
    where: { status: "FAILED" },
    data: { status: "PENDING", errorMsg: null, retryCount: 0, scheduledAt: now, containerCreationId: null, containerCreatedAt: null },
  });

  // Reativa contas em quarentena (podem ter sido colocadas em quarentena durante o downtime do banco)
  await prisma.instagramOAuthAccount.updateMany({
    where: { accountStatus: "QUARANTINE" },
    data: { accountStatus: "ACTIVE", quarantinedUntil: null, lastError: null },
  });

  return NextResponse.json({ reset: result.count });
}
