import { NextResponse } from 'next/server';
import { authorizedApp } from '../../../../lib/core';
import { select } from '../../../../lib/db';
import { loadData } from '../../../../lib/store';
import { applyOps } from '../../../../lib/ops';
import { parseKnown, bankOf, balanceIn } from '../../../../lib/ingest';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Exercises reads, a few changes and their undo on the newest row, and the notification parser. Leaves nothing behind.
export async function POST(req) {
  if (!authorizedApp(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const out = {};
  const t0 = Date.now();
  const data = await loadData(13);
  out.load = { ms: Date.now() - t0, tx: data.transactions.length, allowance: data.allowance };
  const last = data.transactions[data.transactions.length - 1];
  const before = (await select('transactions', 'n=eq.' + last.row))[0];
  const r1 = await applyOps([{ op: 'set_note', row: last.row, note: 'selftest' }, { op: 'rename', merchant: last.raw, name: 'Selftest Name' }, { op: 'add_plan', what: 'selftest', amount: 1, date: '2026-12-31' }], 'selftest');
  const mid = await loadData(1);
  const midRow = mid.transactions.find((t) => t.row === last.row);
  out.applied = { ok: r1.map((r) => r.ok), note: midRow.note, merchant: midRow.merchant, plan: mid.plans.some((p) => p.what === 'selftest') };
  const undo = r1.flatMap((r) => r.undo || []).reverse();
  const r2 = await applyOps(undo, 'selftest');
  const after = (await select('transactions', 'n=eq.' + last.row))[0];
  const end = await loadData(1);
  out.undone = { ok: r2.map((r) => r.ok), errors: r2.filter((r) => !r.ok).map((r) => r.error), rowBack: JSON.stringify({ ...before, updated_at: 0 }) === JSON.stringify({ ...after, updated_at: 0 }), nameBack: end.transactions.find((t) => t.row === last.row).merchant === last.merchant, planGone: !end.plans.some((p) => p.what === 'selftest') };
  const samples = [
    ['GCash', 'You have sent PHP 1,250.00 of GCash to JUAN D. 09171234567 with Ref. No. 1234567890. Your new balance is PHP 304.97.'],
    ['Maya', 'Success! You paid PHP 126.00 at LALAMOVE. Ref. No. 998877'],
    ['GoTyme', 'You received PHP 50.00 from LUIS CABBAB MADRID.']
  ];
  out.parse = [];
  for (const [app, text] of samples) out.parse.push({ bank: bankOf(app), tx: await parseKnown(bankOf(app), text), balance: balanceIn(text) });
  return NextResponse.json(out);
}
