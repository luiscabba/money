import { NextResponse } from 'next/server';
import { authorizedApp } from '../../../../lib/core';
import { update, eq } from '../../../../lib/db';
import { setSetting } from '../../../../lib/store';

export const dynamic = 'force-dynamic';

// Live prices from the sheet's GOOGLEFINANCE formulas: {usdphp, holdings: [{symbol, price, prev}]}.
export async function POST(req) {
  if (!authorizedApp(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { usdphp, holdings = [] } = await req.json();
  if (Number(usdphp) > 0) await setSetting('usd_php', Number(usdphp));
  let n = 0;
  for (const h of holdings) {
    const price = Number(h.price), prev = Number(h.prev);
    if (!h.symbol || !(price > 0)) continue;
    await update('holdings', eq('symbol', String(h.symbol).toUpperCase()), { price, prev_close: prev > 0 ? prev : price });
    n++;
  }
  return NextResponse.json({ ok: true, prices: n });
}
