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
  const key = searchParams.get("key") ?? "";

  const adminTokenKeyed = key ? (process.env[`META_ADMIN_ACCESS_TOKEN_${key}`] || "").trim() : "";
  const adminTokenDefault = (process.env["META_ADMIN_ACCESS_TOKEN"] || "").trim();
  const adminToken = adminTokenKeyed || adminTokenDefault;

  const appIdKeyed = key ? (process.env[`META_APP_${key}_ID`] || "").trim() : "";
  const appIdDefault = (process.env["META_APP_ID"] || "").trim();
  const appId = appIdKeyed || appIdDefault;

  const appSecretKeyed = key ? (process.env[`META_APP_${key}_SECRET`] || "").trim() : "";
  const appSecretDefault = (process.env["META_APP_SECRET"] || "").trim();
  const appSecret = appSecretKeyed || appSecretDefault;

  const effectiveToken = adminToken || (appId && appSecret ? `${appId}|${appSecret}` : "");
  const tokenType = adminToken ? "user_access_token" : (appId && appSecret ? "app_access_token" : "none");

  let tokenTest: Record<string, unknown> = {};
  let rolesTest: Record<string, unknown> = {};

  if (effectiveToken) {
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${effectiveToken}`);
    tokenTest = await meRes.json() as Record<string, unknown>;

    if (appId) {
      const rolesRes = await fetch(`https://graph.facebook.com/v21.0/${appId}/roles?access_token=${effectiveToken}`);
      rolesTest = await rolesRes.json() as Record<string, unknown>;
    }
  }

  return NextResponse.json({
    key,
    appId: appId || null,
    tokenType,
    adminTokenPresent: !!adminToken,
    adminTokenPreview: adminToken ? `${adminToken.slice(0, 12)}...` : null,
    appTokenFallback: !adminToken && !!(appId && appSecret),
    tokenTest,
    rolesTest,
  });
}
