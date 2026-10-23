import { NextResponse } from 'next/server';
import { authorizedApp } from '../../../../lib/core';
import { importTabs } from '../../../../lib/sheetio';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// One-time copy: the Apps Script posts every tab's values and the database is replaced with them.
export async function POST(req) {
  if (!authorizedApp(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (process.env.IMPORT_LOCKED === '1') return NextResponse.json({ error: 'import is locked' }, { status: 403 });
  const { tabs } = await req.json();
  if (!tabs || !tabs.Transactions) return NextResponse.json({ error: 'no tabs' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, counts: await importTabs(tabs) });
  } catch (e) {
    return NextResponse.json({ error: String(e && e.message ? e.message : e) }, { status: 500 });
  }
}
