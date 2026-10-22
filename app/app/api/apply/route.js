import { NextResponse } from 'next/server';
import { sheetPost } from '../../../lib/sheet';

const OPS = ['recategorize', 'mark_transfer', 'set_budget', 'add_expense', 'add_owed', 'settle_owed', 'add_plan', 'remove_plan'];

export async function POST(req) {
  const { ops } = await req.json();
  const clean = (Array.isArray(ops) ? ops : []).filter((o) => o && OPS.includes(o.op)).slice(0, 12);
  if (!clean.length) return NextResponse.json({ error: 'nothing to apply' }, { status: 400 });
  const out = await sheetPost({ action: 'apply', ops: clean });
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
