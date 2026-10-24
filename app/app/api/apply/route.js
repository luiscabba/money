import { NextResponse } from 'next/server';
import { sheetPost } from '../../../lib/sheet';
import { useDb } from '../../../lib/db';
import { applyOps } from '../../../lib/ops';

const OPS = ['recategorize', 'mark_transfer', 'set_budget', 'add_expense', 'add_owed', 'settle_owed', 'add_plan', 'remove_plan', 'set_balance', 'resolve_gap', 'set_holding', 'rename', 'set_note', 'edit_tx', 'void', 'split', 'remember', 'forget', 'goal_add', 'goal_move', 'goal_edit', 'goal_order', 'goal_remove', 'goal_floor', 'goal_sweep', 'goal_sweep_keep', 'goal_buy', 'goal_match_dismiss', 'bill_hide', 'bill_unhide', 'add_tx', 'edit_owed', 'remove_owed', 'edit_plan', 'add_rule', 'forget_rule', 'add_budget', 'remove_budget', 'undo_change', 'event_dismiss'];

export async function POST(req) {
  const { ops } = await req.json();
  const clean = (Array.isArray(ops) ? ops : []).filter((o) => o && OPS.includes(o.op)).slice(0, 20);
  if (!clean.length) return NextResponse.json({ error: 'nothing to apply' }, { status: 400 });
  if (useDb()) return NextResponse.json({ results: await applyOps(clean, 'app') });
  const out = await sheetPost({ action: 'apply', ops: clean });
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
