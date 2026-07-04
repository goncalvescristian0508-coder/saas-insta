import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const SYSTEM_USER_ID = "system";

function isAdmin(email: string | undefined) {
  return email === (process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com");
}

async function authCheck(request: Request): Promise<{ ok: boolean; error?: string }> {
  // Accept CRON_SECRET header (for CLI/script usage)
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET) {
    return { ok: true };
  }
  // Accept Supabase admin session (for browser usage)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && isAdmin(user.email)) return { ok: true };
  return { ok: false, error: "Acesso negado" };
}

export async function POST(request: Request) {
  const auth = await authCheck(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const body = await request.json() as { tokens?: string[] };
  const tokens = (body?.tokens ?? []).filter(
    (t): t is string => typeof t === "string" && t.startsWith("apify_api_") && t.length >= 20
  );

  if (tokens.length === 0) {
    return NextResponse.json({ error: "Nenhum token válido enviado" }, { status: 400 });
  }

  const deleted = await prisma.userApifyToken.deleteMany({ where: { userId: SYSTEM_USER_ID } });
  const created = await prisma.userApifyToken.createMany({
    data: tokens.map((token) => ({ userId: SYSTEM_USER_ID, token, label: "system-auto", isActive: true })),
    skipDuplicates: true,
  });

  return NextResponse.json({ ok: true, deleted: deleted.count, inserted: created.count });
}

export async function GET(request: Request) {
  const auth = await authCheck(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 403 });

  const count = await prisma.userApifyToken.count({ where: { userId: SYSTEM_USER_ID, isActive: true } });
  return NextResponse.json({ systemTokens: count });
}
