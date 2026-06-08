import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Clears lastError for all accounts of the current user
// Only clears transient errors (rate limit, etc.) — not real broken accounts
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  await Promise.all([
    prisma.instagramOAuthAccount.updateMany({
      where: { userId: user.id, lastError: { not: null } },
      data: { lastError: null },
    }),
    prisma.privateInstagramAccount.updateMany({
      where: { userId: user.id, lastError: { not: null } },
      data: { lastError: null },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
