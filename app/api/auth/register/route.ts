import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function notifyAdmin(newUserEmail: string) {
  try {
    const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
    const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
    const adminUser = data?.users?.find((u) => u.email === adminEmail);
    if (!adminUser) return;

    // Push
    await sendPushToUser(adminUser.id, {
      title: "Novo usuário aguardando aprovação",
      body: newUserEmail,
      url: "/admin",
    }).catch(() => {});

    // Telegram
    try {
      const integration = await prisma.userIntegration.findUnique({
        where: { userId_type: { userId: adminUser.id, type: "telegram" } },
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

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: string; password?: string; name?: string };
    const { email, password, name } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email e senha são obrigatórios" }, { status: 400 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[register] SUPABASE_SERVICE_ROLE_KEY não configurada");
      return NextResponse.json({ error: "Configuração do servidor incompleta" }, { status: 500 });
    }

    const adminEmail = process.env.ADMIN_EMAIL ?? "goncalvescristian0508@gmail.com";
    const isAdmin = email === adminEmail;

    const { data, error } = await adminClient().auth.admin.createUser({
      email,
      password,
      user_metadata: { name: name?.trim() || undefined },
      app_metadata: { approved: isAdmin ? true : false },
      email_confirm: true,
    });

    if (error) {
      console.error("[register] Supabase error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!isAdmin && data.user) {
      void notifyAdmin(email);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[register] Erro inesperado:", msg);
    return NextResponse.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}
