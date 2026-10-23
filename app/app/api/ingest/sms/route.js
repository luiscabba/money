import { NextResponse } from 'next/server';
import { authorizedApp, parseWhen } from '../../../../lib/core';
import { takeSmsRow, notifyNew } from '../../../../lib/ingest';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Rows the nightly Mac check read from texts: {rows: [[date, type, amount, merchant, category, source, ref], ...]}.
export async function POST(req) {
  if (!authorizedApp(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { rows = [] } = await req.json();
  const results = [], added = [];
  for (const r of rows.slice(0, 200)) {
    try {
      const out = await takeSmsRow({ when: parseWhen(r[0]), type: String(r[1] || '').trim(), amount: Number(String(r[2]).replace(/,/g, '')), merchant: r[3], category: r[4], source: r[5], ref: r[6] });
      if (out.tx) added.push(out.tx);
      results.push(out.result);
    } catch (e) {
      results.push('error: ' + String(e && e.message ? e.message : e).slice(0, 120));
    }
  }
  try { await notifyNew(added); } catch (e) { console.error('notify', e); }
  return NextResponse.json({ results });
}
