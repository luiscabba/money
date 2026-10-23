import { NextResponse } from 'next/server';
import { sheetPost } from '../../../lib/sheet';
import { useDb } from '../../../lib/db';
import { applyOps, markUndone } from '../../../lib/ops';

// Undo only puts back cells the app captured before a change (or clears a nickname).
export async function POST(req) {
  const { ops } = await req.json();
  const clean = (Array.isArray(ops) ? ops : []).filter((o) => o && (o.op === 'restore' || o.op === 'restore_cells' || o.op === 'rename' || o.op === 'goal_unmove' || o.op === 'add_rule' || o.op === 'forget_rule' || o.op === 'add_budget' || o.op === 'remove_budget' || o.op === 'holding_restore' || o.op === 'balance_drop')).slice(0, 40);
  if (!clean.length) return NextResponse.json({ error: 'nothing to undo' }, { status: 400 });
  if (useDb()) {
    const ops2 = clean.filter((o) => o.op !== 'restore_cells');
    const results = await applyOps(ops2, 'undo');
    if (results.every((r) => r.ok)) await markUndone(ops2).catch(() => null);
    return NextResponse.json({ results });
  }
  const out = await sheetPost({ action: 'apply', ops: clean });
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
