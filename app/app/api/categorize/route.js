import { NextResponse } from 'next/server';
import { sheetPost } from '../../../lib/sheet';
import { useDb } from '../../../lib/db';
import { categorize } from '../../../lib/ops';

export async function POST(req) {
  const { row, category, remember } = await req.json();
  if (useDb()) {
    try {
      return NextResponse.json({ ok: true, undo: await categorize(row, category, !!remember) });
    } catch (e) {
      return NextResponse.json({ error: String(e && e.message ? e.message : e) }, { status: 400 });
    }
  }
  const out = await sheetPost({ action: 'categorize', row, category, remember: !!remember });
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
