import { NextResponse } from 'next/server';
import { authorizedApp } from '../../../../lib/core';
import { sheetGet } from '../../../../lib/sheet';
import { loadData } from '../../../../lib/store';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Side-by-side check: what the sheet and the database each say, month by month.
function sums(d) {
  const by = {};
  (d.transactions || []).forEach((t) => {
    const m = t.date.slice(0, 7);
    by[m] = by[m] || { rows: 0, expense: 0, income: 0, review: 0 };
    by[m].rows++;
    if (t.type === 'Expense') by[m].expense += t.amount;
    if (t.type === 'Income') by[m].income += t.amount;
    if (t.review) by[m].review++;
  });
  Object.values(by).forEach((v) => { v.expense = Math.round(v.expense * 100) / 100; v.income = Math.round(v.income * 100) / 100; });
  return {
    months: by, budgets: d.budgets, allowance: d.allowance,
    netWorth: (d.netWorth.accounts || []).map((a) => [a.name, a.balance, Math.round(a.php)]), history: (d.netWorth.history || []).length,
    holdings: (d.holdings || []).map((h) => [h.symbol, h.qty, h.price]), investDays: (d.investHistory || []).length,
    owed: (d.owed || []).length, plans: (d.plans || []).length, gaps: (d.gaps || []).length, notes: (d.notes || []).length
  };
}

export async function GET(req) {
  if (!authorizedApp(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const [sheet, db] = await Promise.all([sheetGet({ months: 13 }), loadData(13)]);
  const a = sums(sheet), b = sums(db);
  const diff = [];
  new Set([...Object.keys(a.months), ...Object.keys(b.months)]).forEach((m) => {
    if (JSON.stringify(a.months[m]) !== JSON.stringify(b.months[m])) diff.push({ month: m, sheet: a.months[m], db: b.months[m] });
  });
  ['budgets', 'allowance', 'netWorth', 'history', 'holdings', 'investDays', 'owed', 'plans', 'gaps', 'notes'].forEach((k) => {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diff.push({ field: k, sheet: a[k], db: b[k] });
  });
  return NextResponse.json({ same: !diff.length, diff, db: b });
}
