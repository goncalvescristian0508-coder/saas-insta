'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { LayoutDashboard, CalendarDays, CandlestickChart, Newspaper, Bell, Settings, LogOut, Coins, Activity } from 'lucide-react';
import { useApi } from '@/lib/client/useApi';
import { PushBootstrap } from './PushBootstrap';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendário', icon: CalendarDays },
  { href: '/markets', label: 'Mercado', icon: CandlestickChart },
  { href: '/gold', label: 'Gold', icon: Coins },
  { href: '/news', label: 'Notícias', icon: Newspaper },
  { href: '/notifications', label: 'Alertas', icon: Bell },
  { href: '/settings', label: 'Config', icon: Settings },
];
const MOBILE = ['/', '/calendar', '/gold', '/notifications', '/settings'];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const notif = useApi<{ unread: number }>('/api/notifications?unread=1', { intervalMs: 60000 });
  const unread = notif.data?.unread ?? 0;
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () => setClock(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()));
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, []);
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); }

  return (
    <div className="min-h-dvh lg:flex">
      <PushBootstrap />
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 border-r border-border bg-bg-2/60 backdrop-blur sticky top-0 h-dvh">
        <div className="px-5 py-5 flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-lg bg-accent/20 border border-accent/30 flex items-center justify-center text-accent-2"><Activity size={16} /></span>
          <div><div className="font-semibold leading-tight">MarketPulse</div><div className="text-[11px] text-text-3 num">{clock} BRT</div></div>
        </div>
        <nav className="px-3 flex-1 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active(href) ? 'bg-accent/15 text-accent-2 font-semibold' : 'text-text-2 hover:bg-surface-2 hover:text-text'}`}>
              <Icon size={17} /> {label}
              {href === '/notifications' && unread > 0 && <span className="ml-auto chip chip-accent text-[10px] px-1.5 py-0">{unread}</span>}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <button onClick={logout} className="btn btn-ghost w-full justify-start text-text-2"><LogOut size={15} /> Sair</button>
        </div>
      </aside>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <header className="lg:hidden sticky top-0 z-30 pt-safe bg-bg/80 backdrop-blur border-b border-border">
          <div className="flex items-center justify-between px-4 h-12">
            <Link href="/" className="flex items-center gap-2 font-semibold"><span className="h-7 w-7 rounded-md bg-accent/20 border border-accent/30 flex items-center justify-center text-accent-2"><Activity size={14} /></span>MarketPulse</Link>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-text-3 num">{clock}</span>
              <Link href="/markets" className={`text-text-2 ${active('/markets') ? 'text-accent-2' : ''}`} aria-label="Mercado"><CandlestickChart size={18} /></Link>
              <Link href="/news" className={`text-text-2 ${active('/news') ? 'text-accent-2' : ''}`} aria-label="Notícias"><Newspaper size={18} /></Link>
            </div>
          </div>
        </header>
        <main className="px-4 py-4 sm:px-6 lg:px-8 lg:py-6 max-w-7xl mx-auto pb-nav lg:pb-8">{children}</main>
      </div>

      {/* Navegação inferior iPhone */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-bg-2/90 backdrop-blur border-t border-border safe-bottom">
        <div className="grid grid-cols-5 h-[60px]">
          {NAV.filter((n) => MOBILE.includes(n.href)).map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium relative ${active(href) ? 'text-accent-2' : 'text-text-3'}`}>
              <Icon size={20} strokeWidth={active(href) ? 2.4 : 1.8} />
              {label}
              {href === '/notifications' && unread > 0 && <span className="absolute top-2 right-[calc(50%-16px)] h-2 w-2 rounded-full bg-accent" />}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
