import { NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function PATCH(request: Request) {
  const supabase = await createSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
  if (!user || user.email !== adminEmail) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { userId, metaAppKey } = await request.json() as { userId: string; metaAppKey: string | null };

  const { error } = await adminClient().auth.admin.updateUserById(userId, {
    app_metadata: { metaAppKey: metaAppKey || null },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId, metaAppKey });
}
