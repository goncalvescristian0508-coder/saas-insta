/**
 * Autenticação de usuário único: senha -> cookie de sessão assinado (JWT HS256).
 * Sem cadastro público. Proteção de endpoints feita no proxy.ts e nas rotas.
 */
import { SignJWT, jwtVerify } from 'jose';
import { config } from './config';

const alg = 'HS256';

function secretKey() {
  if (!config.auth.secret || config.auth.secret.length < 32) throw new Error('AUTH_SECRET ausente ou curto (mínimo 32 caracteres)');
  return new TextEncoder().encode(config.auth.secret);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ sub: 'owner' })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime(`${config.auth.sessionDays}d`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: [alg] });
    return payload.sub === 'owner';
  } catch {
    return false;
  }
}

/** Comparação em tempo constante para evitar timing attacks. */
export function passwordMatches(candidate: string): boolean {
  const expected = config.auth.password;
  if (!expected) return false;
  const a = new TextEncoder().encode(candidate);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: config.auth.sessionDays * 24 * 3600,
  };
}

/** Verifica se a requisição de cron traz o segredo (header Bearer da Vercel ou ?secret=). */
export function cronAuthorized(req: Request): boolean {
  const secret = config.auth.cronSecret;
  if (!secret) return false;
  const h = req.headers.get('authorization') ?? '';
  if (h === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get('secret') === secret;
}
