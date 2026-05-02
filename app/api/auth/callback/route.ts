import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

function adminClient() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      const user = data.session.user;
      const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
      const isAdmin = user.email === adminEmail;

      // Apply approval logic to accounts created within 7 days (covers all realistic email verification delays)
      // Legacy users created before the approval system was deployed have approved === undefined and age > 7d, so they pass through
      const ageMs = Date.now() - new Date(user.created_at).getTime();
      const isNewSignup = ageMs < 7 * 24 * 60 * 60 * 1000;

      if (typeof user.app_metadata?.approved === "undefined" && isNewSignup) {
        if (isAdmin) {
          await adminClient().auth.admin.updateUserById(user.id, {
            app_metadata: { approved: true },
          });
        } else {
          await adminClient().auth.admin.updateUserById(user.id, {
            app_metadata: { approved: false },
          });
          return NextResponse.redirect(`${origin}/pending-approval`);
        }
      }

      if (!isAdmin && user.app_metadata?.approved === false) {
        return NextResponse.redirect(`${origin}/pending-approval`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
