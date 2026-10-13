/** Logger simples e estruturado (JSON em produção) para depurar jobs e integrações. */
type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, scope: string, msg: string, data?: Record<string, unknown>) {
  const line = { t: new Date().toISOString(), level, scope, msg, ...(data ?? {}) };
  const out = process.env.NODE_ENV === 'production' ? JSON.stringify(line) : `[${level}] ${scope}: ${msg}${data ? ' ' + JSON.stringify(data) : ''}`;
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.log(out);
}

export function logger(scope: string) {
  return {
    debug: (msg: string, data?: Record<string, unknown>) => { if (process.env.NODE_ENV !== 'production') emit('debug', scope, msg, data); },
    info: (msg: string, data?: Record<string, unknown>) => emit('info', scope, msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => emit('warn', scope, msg, data),
    error: (msg: string, data?: Record<string, unknown>) => emit('error', scope, msg, data),
  };
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
