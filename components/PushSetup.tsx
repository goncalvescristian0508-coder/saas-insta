"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushSetup() {
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const [errMsg, setErrMsg]   = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;

    navigator.serviceWorker.register("/sw.js").catch(() => {});

    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(async sub => {
        if (!sub) {
          setShow(true);
          return;
        }

        const json = sub.toJSON() as { endpoint: string; keys?: { p256dh: string; auth: string } };
        if (!json.keys?.p256dh || !json.keys?.auth) {
          await sub.unsubscribe().catch(() => {});
          setShow(true);
          return;
        }

        // Detect VAPID key rotation: compare subscription's key with server's current key
        const keyRes = await fetch("/api/push/vapid-key").catch(() => null);
        if (keyRes?.ok) {
          const { publicKey } = await keyRes.json() as { publicKey: string };
          const currentKeyBytes = urlBase64ToUint8Array(publicKey);
          const subKeyBuffer = sub.options?.applicationServerKey;
          if (subKeyBuffer) {
            const subKeyBytes = new Uint8Array(subKeyBuffer as ArrayBuffer);
            const keysMatch =
              currentKeyBytes.length === subKeyBytes.length &&
              currentKeyBytes.every((b, i) => b === subKeyBytes[i]);
            if (!keysMatch) {
              // Old subscription with rotated VAPID key — clear and resubscribe
              await sub.unsubscribe().catch(() => {});
              setShow(true);
              return;
            }
          }
        }

        // Keys match — re-sync with server in case DB lost it
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }),
        }).catch(() => {});
      });
    });
  }, []);

  async function activate() {
    setLoading(true);
    setErrMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setShow(false); return; }

      const reg = await navigator.serviceWorker.ready;
      const keyRes = await fetch("/api/push/vapid-key");
      if (!keyRes.ok) { setErrMsg("Falha ao buscar chave VAPID"); return; }
      const { publicKey } = await keyRes.json() as { publicKey: string };

      let sub: PushSubscription;
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      } catch (subErr) {
        const msg = subErr instanceof Error ? subErr.message : String(subErr);
        setErrMsg(msg);
        return;
      }

      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const saveRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }),
      });
      if (!saveRes.ok) { setErrMsg("Falha ao salvar subscription"); return; }

      setDone(true);
      setTimeout(() => setShow(false), 2000);
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!show) return null;

  return (
    <div style={{
      position: "fixed", bottom: "1.5rem", right: "1.5rem", zIndex: 200,
      background: "rgba(8,10,16,0.98)",
      border: "1px solid rgba(255,213,79,0.3)",
      borderRadius: "16px",
      padding: "1.25rem 1.5rem",
      maxWidth: "300px",
      boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      display: "flex", flexDirection: "column", gap: "0.75rem",
    }}>
      <button onClick={() => setShow(false)} style={{
        position: "absolute", top: "0.6rem", right: "0.6rem",
        background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "0.25rem",
      }}>
        <X size={14} />
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: "rgba(255,213,79,0.12)", border: "1px solid rgba(255,213,79,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Bell size={15} color="#FFD54F" />
        </div>
        <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#fff" }}>
          {done ? "✓ Notificações ativas!" : "Ativar notificações"}
        </span>
      </div>

      {!done && (
        <>
          {errMsg ? (
            <p style={{ fontSize: "0.75rem", color: "#ff6b6b", lineHeight: 1.4, margin: 0, wordBreak: "break-word" }}>
              Erro: {errMsg}
            </p>
          ) : (
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
              Receba alertas de vendas e mensagens do admin direto no celular.
            </p>
          )}
          <button onClick={activate} disabled={loading} style={{
            padding: "0.6rem 1rem", borderRadius: "8px",
            background: loading ? "rgba(255,213,79,0.4)" : "#FFD54F",
            color: "#000", fontWeight: 700, fontSize: "0.82rem",
            border: "none", cursor: loading ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}>
            {loading ? "Ativando..." : errMsg ? "Tentar novamente" : "Ativar agora"}
          </button>
        </>
      )}
    </div>
  );
}
