import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";

function adminClient() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function notifyAdminNewUser(newUserEmail: string) {
  try {
    const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
    const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
    const adminUser = data?.users?.find((u) => u.email === adminEmail);
    if (!adminUser) return;

    const adminUserId = adminUser.id;

    // Push notification
    await sendPushToUser(adminUserId, {
      title: "Novo usuário aguardando aprovação",
      body: newUserEmail,
      url: "/admin",
    }).catch(() => {});

    // Telegram notification
    try {
      const integration = await prisma.userIntegration.findUnique({
        where: { userId_type: { userId: adminUserId, type: "telegram" } },
      });
      if (integration) {
        const cfg = JSON.parse(integration.config) as { botToken?: string; chatId?: string };
        if (cfg.botToken && cfg.chatId) {
          await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: cfg.chatId,
              text: `🔔 *Novo cadastro aguardando aprovação*\n\n📧 ${newUserEmail}\n\nAcesse o painel admin para aprovar.`,
              parse_mode: "Markdown",
            }),
            signal: AbortSignal.timeout(8_000),
          });
        }
      }
    } catch {}
  } catch {}
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
          void notifyAdminNewUser(user.email ?? "desconhecido");
          return NextResponse.redirect(`${origin}/pending-approval`);
        }
      }

      if (!isAdmin && user.app_metadata?.approved === false) {
        // Notifica o admin novamente quando usuário pendente tenta entrar
        void notifyAdminNewUser(user.email ?? "desconhecido");
        return NextResponse.redirect(`${origin}/pending-approval`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
