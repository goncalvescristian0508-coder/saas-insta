import { getCalendar, filterEvents, findEvent } from '@/lib/calendar/service';
import { indicatorInfo } from '@/lib/calendar/glossary';
import { getPrefs } from '@/lib/prefs/service';
import { affectedAssets } from '@/lib/notifications/rules';
import type { Impact } from '@/lib/calendar/types';
import { json, fail } from '@/lib/http';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const { snapshot } = await getCalendar();
  const eventId = url.searchParams.get('event');
  const prefs = await getPrefs();
  if (eventId) {
    const ev = findEvent(snapshot.events, eventId);
    if (!ev) return fail('evento não encontrado', 404);
    const info = indicatorInfo(ev.title);
    return json({ event: ev, info: info ? { name: info.name, what: info.what, why: info.why, scenarios: info.scenarios } : null, affectedAssets: affectedAssets(ev, prefs), supportsActuals: snapshot.supportsActuals, source: snapshot.source, fetchedAt: snapshot.fetchedAt });
  }
  const range = (url.searchParams.get('range') ?? 'today') as 'today' | 'tomorrow' | 'week' | 'next7' | 'all';
  const list = (k: string) => url.searchParams.get(k)?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const events = filterEvents(snapshot.events, { range, currencies: list('currencies'), countries: list('countries'), impacts: list('impacts')?.map((i) => i.toLowerCase()) as Impact[] | undefined, asset: url.searchParams.get('asset') ?? undefined, tz: prefs.timezone });
  return json({ events, total: snapshot.events.length, fetchedAt: snapshot.fetchedAt, source: snapshot.source, supportsActuals: snapshot.supportsActuals, stale: snapshot.stale, error: snapshot.error, rangeStart: snapshot.rangeStart, rangeEnd: snapshot.rangeEnd });
}
