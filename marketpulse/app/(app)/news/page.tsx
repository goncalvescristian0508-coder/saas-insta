'use client';
import { useState } from 'react';
import { NewsList } from '@/components/NewsList';
import { Seg } from '@/components/ui';
import { NEWS_TYPES } from '@/lib/prefs/types';

export default function NewsPage() {
  const [tag, setTag] = useState<string>('all');
  const opts = [{ id: 'all', label: 'Todas' }, ...NEWS_TYPES.map((t) => ({ id: t.id, label: t.label }))];
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Central de notícias</h1><p className="text-xs text-text-3">Manchetes de fontes oficiais e de mercado (RSS). Classificação por tema é automática e aproximada.</p></div>
      <Seg value={tag} options={opts} onChange={setTag} />
      <NewsList tag={tag === 'all' ? undefined : tag} limit={80} title="Manchetes" />
    </div>
  );
}
