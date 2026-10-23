import { NextResponse } from 'next/server';
import { sheetPost } from '../../../lib/sheet';
import { useDb } from '../../../lib/db';
import { applyOps } from '../../../lib/ops';

// Undo only puts back cells the app captured before a change (or clears a nickname).
export async function POST(req) {
  const { ops } = await req.json();
  const clean = (Array.isArray(ops) ? ops : []).filter((o) => o && (o.op === 'restore' || o.op === 'restore_cells' || o.op === 'rename' || o.op === 'goal_unmove')).slice(0, 40);
  if (!clean.length) return NextResponse.json({ error: 'nothing to undo' }, { status: 400 });
  if (useDb()) return NextResponse.json({ results: await applyOps(clean.filter((o) => o.op !== 'restore_cells'), 'undo') });
  const out = await sheetPost({ action: 'apply', ops: clean });
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
