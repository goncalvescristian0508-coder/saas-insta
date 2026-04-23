import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ADMIN_EMAIL = "goncalvescristian0508@gmail.com";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Reset ALL failed posts to pending (manual override by admin)
  const result = await prisma.scheduledPost.updateMany({
    where: { status: "FAILED" },
    data: { status: "PENDING", errorMsg: null },
  });

  return NextResponse.json({ reset: result.count });
}
