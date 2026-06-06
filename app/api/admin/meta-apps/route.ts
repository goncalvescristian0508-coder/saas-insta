import { NextResponse } from "next/server";
import { listMetaApps } from "@/lib/metaInstagramEnv";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const apps = listMetaApps();

  if (!user) {
    return NextResponse.json({ apps: apps.map((a) => ({ ...a, count: 0, isLotado: false })) });
  }

  const counts = await prisma.instagramOAuthAccount.groupBy({
    by: ["appKey"],
    where: { userId: user.id },
    _count: { id: true },
  });

  const countMap: Record<string, number> = {};
  for (const row of counts) {
    countMap[row.appKey] = row._count.id;
  }

  const assignedAppKey = (user.app_metadata?.metaAppKey as string | undefined) ?? null;

  return NextResponse.json({
    assignedAppKey,
    apps: apps.map((a) => ({
      ...a,
      count: countMap[a.key] ?? 0,
      isLotado: false,
    })),
  });
}
