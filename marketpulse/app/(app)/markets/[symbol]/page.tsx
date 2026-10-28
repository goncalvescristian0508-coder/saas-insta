import { redirect } from 'next/navigation';
import { AssetDetail } from '@/components/AssetDetail';

export default async function AssetPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const s = symbol.toUpperCase();
  if (s === 'XAUUSD') redirect('/gold');
  return <AssetDetail symbol={s} />;
}
