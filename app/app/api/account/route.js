import { NextResponse } from 'next/server';
import { useDb, select, eq } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// Balance readings for one account, newest last: the line at the top of its screen.
export async function GET(req) {
  const name = new URL(req.url).searchParams.get('name') || '';
  if (!useDb() || !/^[\w .-]{1,30}$/.test(name)) return NextResponse.json({ readings: [] });
  try {
    const since = new Date(Date.now() - 100 * 86400000).toISOString();
    const rows = await select('balances', 'select=at,balance,note&' + eq('account', name) + '&at=gte.' + encodeURIComponent(since) + '&order=at');
    return NextResponse.json({ readings: rows.map((r) => ({ at: r.at, balance: Number(r.balance), note: r.note || '' })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ readings: [] });
  }
}
