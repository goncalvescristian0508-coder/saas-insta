import { getRates } from '@/lib/market/rates';
import { json } from '@/lib/http';
export async function GET() { return json(await getRates()); }
