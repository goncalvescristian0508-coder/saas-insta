'use client';
/** Configuração de Web Push: permissão mediante interação, inscrição, teste, status e guia iPhone. */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Bell, BellRing, Send, Share, PlusSquare, Smartphone, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, Notice } from './ui';
import { useApi, postJson } from '@/lib/client/useApi';
import { fmtDateTime } from '@/lib/client/format';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

interface ClientEnv { supported: boolean; isIOS: boolean; standalone: boolean; permission: NotificationPermission | 'unsupported' }
let envCache: ClientEnv | null = null;
function getClientEnv(): ClientEnv {
  if (envCache) return envCache;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  envCache = { supported, isIOS: ios, standalone, permission: supported ? Notification.permission : 'unsupported' };
  return envCache;
}
const noSubscribe = () => () => {};

interface PushStatus { configured: boolean; subscriptions: { endpoint: string; createdAt: string; lastSuccessAt?: string; failures: number; userAgent?: string }[]; log: { at: string; title: string; kind: string; sent: number; failed: number; removed: number; errors: string[] }[] }

export function PushSettings() {
  const env = useSyncExternalStore(noSubscribe, getClientEnv, () => null);
  const supported = env ? env.supported : null;
  const isIOS = env?.isIOS ?? false;
  const standalone = env?.standalone ?? false;
  const [permState, setPermission] = useState<NotificationPermission | null>(null);
  const permission: NotificationPermission | 'unsupported' = permState ?? env?.permission ?? 'default';
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const status = useApi<PushStatus>('/api/push/status', { intervalMs: 60000 });

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((s) => { if (alive) setSubscribed(Boolean(s)); }).catch(() => {});
    return () => { alive = false; };
  }, [supported]);

  async function subscribe() {
    setBusy(true); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') { setMsg({ ok: false, text: 'Permissão negada. Em iPhone: Ajustes → Notificações → MarketPulse.' }); return; }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      const keyRes = await fetch('/api/push/vapid-key');
      if (!keyRes.ok) { setMsg({ ok: false, text: (await keyRes.json()).error ?? 'VAPID não configurado' }); return; }
      const { publicKey } = await keyRes.json();
      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        // se a chave VAPID do servidor mudou, refaz a inscrição
        const cur = sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
        const want = urlBase64ToUint8Array(publicKey);
        if (!cur || cur.length !== want.length || !cur.every((b, i) => b === want[i])) { await sub.unsubscribe(); sub = null; }
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const r = await postJson('/api/push/subscribe', sub.toJSON());
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? 'falha ao salvar inscrição' }); return; }
      setSubscribed(true); setMsg({ ok: true, text: 'Notificações ativadas neste dispositivo.' }); status.refresh();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  }
  async function unsubscribe() {
    setBusy(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await postJson('/api/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
      setSubscribed(false); setMsg({ ok: true, text: 'Notificações desativadas neste dispositivo.' }); status.refresh();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setMsg(null);
    const r = await postJson<{ log: { sent: number } }>('/api/push/test');
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: `Teste enviado para ${r.data?.log.sent} dispositivo(s). A entrega pode levar alguns segundos.` } : { ok: false, text: r.error ?? 'falha' });
    status.refresh();
  }

  const needsInstall = isIOS && !standalone;
  return (
    <Card title={<span className="flex items-center gap-2"><BellRing size={15} className="text-accent-2" /> Notificações push (iPhone)</span>} subtitle="Alertas chegam mesmo com o app fechado, dentro dos limites do iOS. A entrega não é garantida no segundo exato.">
      {status.data && !status.data.configured && <div className="mb-3"><Notice>Servidor sem chaves VAPID. Rode <code>npm run vapid</code> e configure <code>VAPID_PUBLIC_KEY</code>/<code>VAPID_PRIVATE_KEY</code>.</Notice></div>}
      {supported === false && <div className="mb-3"><Notice>{needsInstall ? 'No iPhone, as notificações só funcionam após instalar o app na Tela de Início (guia abaixo) — iOS 16.4 ou superior.' : 'Este navegador não suporta Web Push.'}</Notice></div>}
      {supported && needsInstall && <div className="mb-3"><Notice>Você está no Safari. Para receber alertas, instale o app na Tela de Início (guia abaixo) e ative por lá.</Notice></div>}
      <div className="flex flex-wrap gap-2 items-center">
        {!subscribed ? <button className="btn btn-primary" onClick={subscribe} disabled={busy || supported === false || permission === 'denied'}><Bell size={15} /> Ativar neste dispositivo</button>
          : <button className="btn" onClick={unsubscribe} disabled={busy}>Desativar neste dispositivo</button>}
        <button className="btn" onClick={test} disabled={busy || !status.data?.configured || (status.data?.subscriptions.length ?? 0) === 0}><Send size={14} /> Enviar notificação de teste</button>
        <span className={`chip ${permission === 'granted' ? 'chip-up' : permission === 'denied' ? 'chip-down' : 'chip-muted'}`}>permissão: {permission}</span>
        {standalone && <span className="chip chip-accent"><Smartphone size={11} /> instalado</span>}
      </div>
      {msg && <p className={`mt-3 text-sm flex items-center gap-1.5 ${msg.ok ? 'text-up' : 'text-down'}`}>{msg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{msg.text}</p>}

      <details className="mt-4 text-sm" open={needsInstall}>
        <summary className="cursor-pointer font-medium">Guia: instalar no iPhone e ativar alertas</summary>
        <ol className="list-decimal pl-5 mt-2 space-y-1.5 text-text-2">
          <li>Abra este endereço no <b>Safari</b> (não funciona em navegador dentro de outros apps).</li>
          <li>Toque em <b>Compartilhar</b> <Share size={13} className="inline" /> na barra inferior.</li>
          <li>Escolha <b>Adicionar à Tela de Início</b> <PlusSquare size={13} className="inline" /> e confirme.</li>
          <li>Abra o <b>MarketPulse</b> pela Tela de Início, faça login e volte a esta página.</li>
          <li>Toque em <b>Ativar neste dispositivo</b> e permita as notificações.</li>
          <li>Use <b>Enviar notificação de teste</b>. Requer iOS 16.4+. Se bloquear a permissão, reative em Ajustes → Notificações → MarketPulse.</li>
        </ol>
      </details>

      {status.data && (
        <div className="mt-4 grid md:grid-cols-2 gap-4 text-xs">
          <div>
            <div className="font-semibold text-text-2 mb-1">Dispositivos inscritos ({status.data.subscriptions.length})</div>
            {status.data.subscriptions.length === 0 && <p className="text-text-3">nenhum</p>}
            <ul className="space-y-1">{status.data.subscriptions.map((s, i) => <li key={i} className="rounded-md bg-surface-2/60 border border-border p-2"><div className="truncate">{s.userAgent ?? s.endpoint}</div><div className="text-text-3">desde {fmtDateTime(s.createdAt)}{s.lastSuccessAt ? ` · último sucesso ${fmtDateTime(s.lastSuccessAt)}` : ''}{s.failures ? ` · falhas ${s.failures}` : ''}</div></li>)}</ul>
          </div>
          <div>
            <div className="font-semibold text-text-2 mb-1">Registro de envios</div>
            {status.data.log.length === 0 && <p className="text-text-3">nenhum envio ainda</p>}
            <ul className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">{status.data.log.map((l, i) => <li key={i} className="rounded-md bg-surface-2/60 border border-border p-2"><div className="truncate">{l.title}</div><div className="text-text-3">{fmtDateTime(l.at)} · enviados {l.sent} · falhas {l.failed}{l.removed ? ` · removidos ${l.removed}` : ''}{l.errors.length ? ` · ${l.errors[0]}` : ''}</div></li>)}</ul>
          </div>
        </div>
      )}
    </Card>
  );
}
