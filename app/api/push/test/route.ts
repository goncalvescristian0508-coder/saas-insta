import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import webpush from "web-push";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const subs = await prisma.pushSubscription.findMany({ where: { userId: user.id } });

  return NextResponse.json({
    subscriptions: subs.length,
    endpoints: subs.map(s => s.endpoint.slice(0, 60) + "..."),
    vapidConfigured: !!process.env.VAPID_PUBLIC_KEY,
  });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ results: [{ endpoint: "—", ok: false, message: "VAPID keys não configuradas" }] });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@autopost.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  const subs = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
  if (subs.length === 0) {
    return NextResponse.json({ results: [{ endpoint: "—", ok: false, message: "Nenhuma subscription encontrada" }] });
  }

  const results = await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: "✅ Teste AutoPost", body: "Notificação funcionando!", url: "/" }),
      );
      return { endpoint: s.endpoint.slice(0, 50), ok: true };
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string; body?: string };
      return {
        endpoint: s.endpoint.slice(0, 50),
        ok: false,
        status: e.statusCode,
        message: e.message,
        body: typeof e.body === "string" ? e.body.slice(0, 200) : undefined,
      };
    }
  }));

  return NextResponse.json({ results });
}
