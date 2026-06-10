import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function isAdmin(email: string | undefined) {
  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  return email === adminEmail;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { count } = await prisma.instagramOAuthAccount.updateMany({
    where: { accountStatus: "SUSPENDED" },
    data: { accountStatus: "ACTIVE", lastError: null, quarantinedUntil: null },
  });

  // Also reset permanently-failed scheduled posts for those accounts so they get retried
  const { count: postsReset } = await prisma.scheduledPost.updateMany({
    where: {
      status: "FAILED",
      retryCount: { gte: 6 },
      errorMsg: { contains: "Token inválido" },
    },
    data: { status: "PENDING", errorMsg: null, retryCount: 0 },
  });

  return NextResponse.json({ accountsReset: count, postsReset });
}
