'use client';
import type { ReactNode } from 'react';
import { AlertTriangle, Clock, RefreshCw, WifiOff } from 'lucide-react';
import { relativeTime } from '@/lib/client/format';

export function Card({ children, className = '', title, action, subtitle }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 mb-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-wide text-text uppercase">{title}</h2>}
            {subtitle && <p className="text-xs text-text-3 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Skeleton({ className = '' }: { className?: string }) { return <div className={`skeleton ${className}`} />; }

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-down/30 bg-down/10 p-3 text-sm">
      <AlertTriangle size={16} className="text-down mt-0.5 shrink-0" />
      <div className="flex-1 text-text-2">{message}</div>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}><RefreshCw size={13} /> Tentar</button>}
    </div>
  );
}

export function Notice({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'info' }) {
  const cls = tone === 'warn' ? 'border-warn/30 bg-warn/10 text-warn' : 'border-accent/30 bg-accent/10 text-accent-2';
  return <div className={`rounded-xl border p-3 text-xs ${cls}`}>{children}</div>;
}

export function StaleBadge({ stale, at, label }: { stale?: boolean; at?: string | null; label?: string }) {
  if (!at && !stale) return null;
  return (
    <span className={`chip ${stale ? 'chip-warn' : 'chip-muted'}`} title={at ?? ''}>
      {stale ? <WifiOff size={11} /> : <Clock size={11} />}
      {stale ? 'desatualizado' : label ?? 'atualizado'} {at ? relativeTime(at) : ''}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-text-3 text-center py-8">{children}</div>;
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg overflow-x-auto scrollbar-thin max-w-full">
      {options.map((o) => <button key={o.id} data-active={o.id === value} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}

export function BiasChip({ bias, small }: { bias: string; small?: boolean }) {
  const cls = bias === 'altista' ? 'chip-up' : bias === 'baixista' ? 'chip-down' : bias === 'neutro' ? 'chip-accent' : 'chip-muted';
  const label = bias === 'altista' ? 'Altista' : bias === 'baixista' ? 'Baixista' : bias === 'neutro' ? 'Neutro' : 'Indefinido';
  return <span className={`chip ${cls} ${small ? 'text-[10px] px-2 py-0.5' : ''}`}>{label}</span>;
}

export function ImpactDot({ impact }: { impact: string }) {
  const c = impact === 'high' ? 'bg-down' : impact === 'medium' ? 'bg-vol' : impact === 'low' ? 'bg-warn/70' : 'bg-text-3';
  return <span className={`inline-block w-2 h-2 rounded-full ${c}`} aria-label={impact} />;
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2.5 cursor-pointer">
      <span>
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-text-3">{description}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-border-2'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}
