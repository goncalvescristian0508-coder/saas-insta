import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptAccountPassword } from "@/lib/accountCrypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface AccountEntry {
  username: string;
  password: string;
  totpSecret?: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { accounts } = await request.json() as { accounts?: AccountEntry[] };
  if (!accounts?.length) return NextResponse.json({ error: "Nenhuma conta enviada" }, { status: 400 });

  let added = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const entry of accounts.slice(0, 200)) {
    const username = entry.username?.replace("@", "").trim();
    const password = entry.password?.trim();
    if (!username || !password) { skipped++; continue; }

    try {
      await prisma.privateInstagramAccount.upsert({
        where: { username },
        create: {
          userId: user.id,
          username,
          passwordEnc: encryptAccountPassword(password),
          totpSecret: entry.totpSecret?.trim() || null,
        },
        update: {
          userId: user.id,
          passwordEnc: encryptAccountPassword(password),
          totpSecret: entry.totpSecret?.trim() || null,
          lastError: null,
        },
      });
      added++;
    } catch {
      errors.push(username);
      skipped++;
    }
  }

  return NextResponse.json({ added, skipped, errors });
}
