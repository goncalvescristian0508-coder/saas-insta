import { getPrefs, savePrefs } from '@/lib/prefs/service';
import { json, fail, readJson } from '@/lib/http';

export async function GET() { return json({ prefs: await getPrefs() }); }
export async function PUT(req: Request) {
  const b = await readJson<unknown>(req);
  if (!b || typeof b !== 'object') return fail('corpo inválido');
  return json({ prefs: await savePrefs(b) });
}
