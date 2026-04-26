import webpush from "web-push";
import { prisma } from "@/lib/prisma";

function initVapid() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@autopost.app",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

type PushPayload = { title: string; body: string; url?: string };

async function sendToSub(sub: { id: string; endpoint: string; p256dh: string; auth: string }, payload: PushPayload) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode;
    // 410/404 = subscription gone; 403 = VAPID key mismatch (permanent after key rotation)
    if (status === 410 || status === 404 || status === 403) {
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    }
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  initVapid();
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.allSettled(subs.map((s: { id: string; endpoint: string; p256dh: string; auth: string }) => sendToSub(s, payload)));
}

export async function sendPushToAll(payload: PushPayload) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  initVapid();
  const subs = await prisma.pushSubscription.findMany();
  await Promise.allSettled(subs.map((s: { id: string; endpoint: string; p256dh: string; auth: string }) => sendToSub(s, payload)));
}
