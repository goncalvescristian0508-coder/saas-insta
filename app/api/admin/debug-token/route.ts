import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  if (user.email !== adminEmail) return NextResponse.json({ error: "Não autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") ?? "2";

  const adminToken = (process.env[`META_ADMIN_ACCESS_TOKEN_${key}`] || "").trim();
  const appId = (process.env[`META_APP_${key}_ID`] || "").trim();

  let tokenTest: Record<string, unknown> = {};
  if (adminToken) {
    const res = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${adminToken}`);
    tokenTest = await res.json() as Record<string, unknown>;
  }

  return NextResponse.json({
    adminTokenPresent: !!adminToken,
    adminTokenLength: adminToken.length,
    adminTokenPreview: adminToken ? `${adminToken.slice(0, 10)}...` : null,
    appId,
    tokenTest,
  });
}
