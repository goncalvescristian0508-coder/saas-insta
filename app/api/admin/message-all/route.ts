import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { sendPushToAll } from "@/lib/push";

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
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const { message } = await request.json() as { message: string };
  if (!message?.trim()) return NextResponse.json({ error: "Mensagem obrigatória" }, { status: 400 });

  const admin = adminClient();
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const users = authData?.users ?? [];

  let sent = 0;
  for (const u of users) {
    if (u.email === (process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com")) continue;
    const { error } = await admin.auth.admin.updateUserById(u.id, {
      user_metadata: { adminMessage: message.trim(), adminMessageAt: new Date().toISOString() },
    });
    if (!error) sent++;
  }

  await sendPushToAll({
    title: "AutoPost",
    body: message.trim().slice(0, 120),
    url: "/",
  }).catch(() => {});

  return NextResponse.json({ ok: true, sent });
}

export async function DELETE() {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const admin = adminClient();
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const users = authData?.users ?? [];

  for (const u of users) {
    await admin.auth.admin.updateUserById(u.id, {
      user_metadata: { adminMessage: null, adminMessageAt: null },
    });
  }

  return NextResponse.json({ ok: true });
}
