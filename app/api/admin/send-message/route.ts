import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function isAdmin(email: string | undefined) {
  return email === (process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com");
}

export async function POST(request: Request) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { userId, message } = await request.json() as { userId: string; message: string };
  if (!userId || !message?.trim()) {
    return NextResponse.json({ error: "userId e message são obrigatórios" }, { status: 400 });
  }

  const { error } = await adminClient().auth.admin.updateUserById(userId, {
    user_metadata: { adminMessage: message.trim(), adminMessageAt: new Date().toISOString() },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sendPushToUser(userId, {
    title: "AutoPost",
    body: message.trim().slice(0, 120),
    url: "/",
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { userId } = await request.json() as { userId: string };
  if (!userId) return NextResponse.json({ error: "userId obrigatório" }, { status: 400 });

  const { error } = await adminClient().auth.admin.updateUserById(userId, {
    user_metadata: { adminMessage: null, adminMessageAt: null },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
