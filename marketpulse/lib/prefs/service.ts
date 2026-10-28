import 'server-only';
import { kv } from '../kv';
import { DEFAULT_PREFS, sanitizePrefs, type Preferences } from './types';

const KEY = 'prefs:owner';

export async function getPrefs(): Promise<Preferences> {
  const stored = await kv().get<Preferences>(KEY);
  return stored ? sanitizePrefs(stored) : { ...DEFAULT_PREFS };
}

export async function savePrefs(input: unknown): Promise<Preferences> {
  const prefs = sanitizePrefs({ ...input as object, updatedAt: new Date().toISOString() });
  await kv().set(KEY, prefs);
  return prefs;
}
