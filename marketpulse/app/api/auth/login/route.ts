import { NextResponse } from 'next/server';
import { createSessionToken, passwordMatches, sessionCookieOptions } from '@/lib/auth';
import { config, featureStatus } from '@/lib/config';
import { kv } from '@/lib/kv';
import { fail, readJson } from '@/lib/http';
import { logger } from '@/lib/logger';

const log = logger('auth');

export async function POST(req: Request) {
  if (!featureStatus().auth) return fail('Servidor sem APP_PASSWORD/AUTH_SECRET configurados.', 503);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const attempts = await kv().incr(`login:attempts:${ip}`, 15 * 60);
  if (attempts > 8) { log.warn('login bloqueado por tentativas', { ip }); return fail('Muitas tentativas. Aguarde 15 minutos.', 429); }
  const body = await readJson<{ password?: string }>(req);
  if (!body?.password || !passwordMatches(body.password)) {
    log.warn('senha incorreta', { ip, attempts });
    return fail('Senha incorreta.', 401);
  }
  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(config.auth.cookieName, token, sessionCookieOptions());
  return res;
}
