import { NextResponse } from 'next/server';
import { sheetPost } from '../../../lib/sheet';
import { useDb } from '../../../lib/db';
import { applyOps } from '../../../lib/ops';

const OPS = ['recategorize', 'mark_transfer', 'set_budget', 'add_expense', 'add_owed', 'settle_owed', 'add_plan', 'remove_plan', 'set_balance', 'resolve_gap', 'set_holding', 'rename', 'set_note', 'edit_tx', 'void', 'split', 'remember', 'forget', 'goal_add', 'goal_move', 'goal_edit', 'goal_order', 'goal_remove', 'goal_cap'];

export async function POST(req) {
  const { ops } = await req.json();
  const clean = (Array.isArray(ops) ? ops : []).filter((o) => o && OPS.includes(o.op)).slice(0, 20);
  if (!clean.length) return NextResponse.json({ error: 'nothing to apply' }, { status: 400 });
  if (useDb()) return NextResponse.json({ results: await applyOps(clean, 'app') });
  const out = await sheetPost({ action: 'apply', ops: clean });
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
