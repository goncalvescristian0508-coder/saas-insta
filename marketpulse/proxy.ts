/**
 * Proteção de acesso: toda página e API exige sessão válida, exceto login, cron (segredo próprio),
 * manifest, service worker e ícones. Em Next 16 o antigo middleware chama-se proxy.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { verifySessionToken } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/manifest.webmanifest', '/sw.js', '/offline'];
const PUBLIC_PREFIXES = ['/api/cron/', '/icons/', '/_next/'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const token = request.cookies.get('mp_session')?.value;
  let ok = false;
  try { ok = await verifySessionToken(token); } catch { ok = false; }
  if (ok) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|jpg|jpeg|webp|ico|txt|woff2?)$).*)'],
};
