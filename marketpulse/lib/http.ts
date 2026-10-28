/** Helpers de resposta JSON para rotas. */
import { NextResponse } from 'next/server';

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { 'cache-control': 'no-store', ...(init?.headers ?? {}) } });
}
export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(extra ?? {}) }, { status, headers: { 'cache-control': 'no-store' } });
}
export async function readJson<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}
