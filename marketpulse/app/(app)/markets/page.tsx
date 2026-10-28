'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, X } from 'lucide-react';
import { QuoteGrid } from '@/components/QuoteGrid';
import { Card, Notice } from '@/components/ui';
import { usePrefs } from '@/lib/client/prefs';
import { ASSETS } from '@/lib/assets';

export default function MarketsPage() {
  const { prefs, ready, save } = usePrefs();
  const [custom, setCustom] = useState('');
  const symbols = ready ? Array.from(new Set([...prefs.favorites, ...prefs.customSymbols])) : undefined;
  const available = ASSETS.filter((a) => !prefs.favorites.includes(a.symbol));
  async function addCustom() {
    const s = custom.trim().toUpperCase().replace(/\s+/g, '');
    if (!s) return;
    await save({ customSymbols: Array.from(new Set([...prefs.customSymbols, s])) });
    setCustom('');
  }
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Mercado e ativos</h1><p className="text-xs text-text-3">Preço, variação, volatilidade e viés técnico de curto prazo. Toque para ver a análise detalhada.</p></div>
      <QuoteGrid symbols={symbols} intervalMs={ready ? prefs.quoteRefreshSeconds * 1000 : undefined} />
      <Card title="Gerenciar ativos" subtitle="Adicione outros pares/índices disponíveis no provedor. Use o formato do Twelve Data (ex.: USD/MXN, NZD/USD, AAPL, QQQ).">
        <div className="flex flex-wrap gap-2 mb-3">
          {symbols?.map((s) => <span key={s} className="chip chip-accent">{s} <button onClick={() => save({ favorites: prefs.favorites.filter((x) => x !== s), customSymbols: prefs.customSymbols.filter((x) => x !== s) })} aria-label={`remover ${s}`}><X size={11} /></button></span>)}
        </div>
        {available.length > 0 && <div className="flex flex-wrap gap-2 mb-3">{available.map((a) => <button key={a.symbol} className="chip" onClick={() => save({ favorites: [...prefs.favorites, a.symbol] })}><Plus size={11} /> {a.symbol}</button>)}</div>}
        <div className="flex gap-2"><input className="input" placeholder="Ex.: USD/MXN" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} /><button className="btn btn-primary" onClick={addCustom} disabled={!custom.trim()}>Adicionar</button></div>
        <div className="mt-3"><Notice tone="info">Símbolos fora do plano do provedor aparecem como “indisponível”. Índices (NAS100, US30, SPX500, DXY) usam o índice à vista e, se o plano não incluir, o ETF equivalente, sempre com rótulo “proxy”. <Link href="/settings" className="underline">Configurações</Link>.</Notice></div>
      </Card>
    </div>
  );
}
