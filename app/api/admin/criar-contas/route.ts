import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isAdmin(email: string | undefined) {
  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  return email === adminEmail;
}

const VPS_URL = process.env.VPS_URL ?? "http://147.182.218.81:3001";
const BOT_SECRET = process.env.BOT_SECRET ?? "igbot2026";

async function vpsReq(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${VPS_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-bot-secret": BOT_SECRET,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
    cache: "no-store",
  });
  return res.json();
}

// POST /api/admin/criar-contas — start account creation
export async function POST(req: NextRequest) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdmin(user?.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { quantity = 1 } = await req.json();

  const data = await vpsReq("/create-account", "POST", {
    proxyUser: process.env.DATAIMPULSE_USER,
    proxyPass: process.env.DATAIMPULSE_PASS,
    quantity: Math.min(Number(quantity), 10),
  });

  return NextResponse.json(data);
}

// GET /api/admin/criar-contas?jobId=xxx — check status or list all
export async function GET(req: NextRequest) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdmin(user?.email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const jobId = req.nextUrl.searchParams.get("jobId");
  const data = await vpsReq(jobId ? `/status/${jobId}` : "/jobs");
  return NextResponse.json(data);
}
