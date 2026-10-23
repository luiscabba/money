import { NextResponse } from 'next/server';
import { authorizedApp, parseWhen } from '../../../../lib/core';
import { takeBalances } from '../../../../lib/balances';

export const dynamic = 'force-dynamic';

// Balances the nightly Mac check read from texts: {rows: [[time, account, balance], ...]}.
export async function POST(req) {
  if (!authorizedApp(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { rows = [] } = await req.json();
  const list = rows.map((r) => ({ when: parseWhen(r[0]), account: String(r[1] || '').trim(), balance: Number(String(r[2]).replace(/,/g, '')) }));
  return NextResponse.json({ results: await takeBalances(list) });
}
