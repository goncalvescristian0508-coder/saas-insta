import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

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

  // Marca como falha qualquer job com totalReels=0 há mais de 10 minutos
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const result = await prisma.cloneJob.updateMany({
    where: {
      totalReels: 0,
      createdAt: { lt: tenMinutesAgo },
      errorMsg: null,
    },
    data: {
      totalReels: -1,
      errorMsg: "Tempo esgotado aguardando scraper. Tente novamente.",
    },
  });

  return NextResponse.json({ ok: true, fixed: result.count });
}
