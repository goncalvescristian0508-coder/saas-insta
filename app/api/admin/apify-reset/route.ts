import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clearExhaustedApifyTokens, getApifyTokensFromEnv } from "@/lib/apifyRotation";

export const runtime = "nodejs";

function isAdmin(email: string | undefined) {
  return email === (process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com");
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  await clearExhaustedApifyTokens();

  return NextResponse.json({
    ok: true,
    message: "Lista de tokens Apify esgotados limpa.",
    tokensAtivos: getApifyTokensFromEnv().length,
  });
}
