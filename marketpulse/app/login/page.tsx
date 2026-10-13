'use client';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, Lock } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setError(json.error ?? 'Falha no login'); return; }
    router.replace(params.get('next') || '/');
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm p-7 fade-up">
      <div className="flex items-center gap-3 mb-6">
        <span className="h-10 w-10 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center text-accent-2"><Activity size={20} /></span>
        <div><h1 className="font-semibold text-lg leading-tight">MarketPulse</h1><p className="text-xs text-text-3">Acesso pessoal</p></div>
      </div>
      <label className="block text-xs text-text-2 mb-1.5">Senha</label>
      <div className="relative mb-4">
        <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-3" />
        <input className="input pl-9" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
      </div>
      {error && <p className="text-sm text-down mb-3">{error}</p>}
      <button className="btn btn-primary w-full" disabled={loading || !password}>{loading ? 'Entrando…' : 'Entrar'}</button>
      <p className="text-[11px] text-text-3 mt-4">Sessão segura por cookie assinado. Sem cadastro público.</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <Suspense><LoginForm /></Suspense>
    </main>
  );
}
