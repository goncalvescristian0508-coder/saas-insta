import { getNews, configuredFeeds } from '@/lib/news/service';
import { json } from '@/lib/http';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol')?.toUpperCase();
  const tag = url.searchParams.get('tag');
  try {
    const n = await getNews();
    const items = n.items.filter((i) => (!symbol || i.assets.includes(symbol)) && (!tag || i.tags.includes(tag)));
    return json({ items, fetchedAt: n.fetchedAt, stale: n.stale, failures: n.failures, feeds: configuredFeeds().map((f) => f.name) });
  } catch (e) {
    return json({ items: [], fetchedAt: null, stale: true, failures: [e instanceof Error ? e.message : String(e)], feeds: configuredFeeds().map((f) => f.name) });
  }
}
