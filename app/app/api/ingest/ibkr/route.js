import { NextResponse } from 'next/server';
import { authorizedApp } from '../../../../lib/core';
import { syncPositions, syncHistory } from '../../../../lib/ibkr';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// The Apps Script fetches IBKR's Flex statements each morning and posts them: {positions: xml, history: xml}.
export async function POST(req) {
  if (!authorizedApp(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { positions, history } = await req.json();
  const out = {};
  try {
    if (positions) out.positions = await syncPositions(String(positions));
    if (history) out.history = await syncHistory(String(history));
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ error: String(e && e.message ? e.message : e), ...out }, { status: 500 });
  }
}
