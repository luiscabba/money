import { NextResponse } from 'next/server';
import { authorizedApp, manilaDay, peso, round2 } from '../../../../lib/core';
import { insert, update, eq } from '../../../../lib/db';
import { allowance, transactions, gaps, holdings, netWorth } from '../../../../lib/store';
import { spentOn } from '../../../../lib/ingest';
import { netExpenses } from '../../../../lib/money';
import { push } from '../../../../lib/push';
import { investSnapshot } from '../../../../lib/ibkr';
import { sweepWeek } from '../../../../lib/goalJobs';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const dayBack = (k) => manilaDay(new Date(Date.now() - k * 86400000));

async function dailyClose() {
  const rows = await transactions(3); // reaches back past the 60 days the streak can count
  const allow = await allowance();
  const spent = spentOn(manilaDay(), rows);
  let streak = 0;
  for (let k = 0; k < 60; k++) { if (spentOn(dayBack(k), rows) <= allow) streak++; else break; }
  const body = spent <= allow ? (streak > 1 ? streak + ' days in a row under ₱' + allow + '.' : 'Under ₱' + allow + ' today.') : peso(spent - allow) + ' over today.';
  // A failed push must not stop tonight's net worth and portfolio snapshots.
  try { await push('Daily close: ' + peso(spent), body, '/'); } catch (e) { console.error('daily close push', e); }
  // Sunday's close is also the week's: offer what's left of the week to the goals.
  let sweep = null;
  if (new Date(manilaDay() + 'T12:00:00Z').getUTCDay() === 0) {
    try { sweep = await sweepWeek(); if (sweep.push) await push(...sweep.push); } catch (e) { sweep = { error: String(e) }; }
  }
  // Portfolio value for today, IBKR's line at live prices, and tonight's net worth snapshot.
  const h = await holdings();
  const nw0 = await netWorth();
  await investSnapshot(h, nw0.usdphp);
  if (h.length) await update('accounts', eq('name', 'IBKR'), { balance: round2(h.reduce((a, x) => a + x.usd, 0)), as_of: new Date().toISOString() });
  const nw = await netWorth();
  // Without today's USD rate the dollar accounts would count as ₱0, so no snapshot tonight.
  const fxMissing = !nw.usdphp && nw.accounts.some((a) => a.currency === 'USD' && a.balance);
  if (nw.accounts.some((a) => a.balance) && !fxMissing) {
    const accounts = {};
    nw.accounts.forEach((a) => { accounts[a.currency === 'USD' ? a.name + ' (PHP)' : a.name] = round2(a.php); });
    await insert('networth_history', [{ date: manilaDay(), accounts, total_php: round2(nw.accounts.reduce((s, a) => s + a.php, 0)), usd_php: nw.usdphp }], { upsert: true, onConflict: 'date' });
  }
  return { spent, streak, sweep };
}

async function weeklyRecap() {
  const rows = await transactions(2);
  const dow = (new Date(manilaDay() + 'T12:00:00Z').getUTCDay() + 6) % 7; // 0 = Monday
  const span = (from, to) => {
    const keys = [];
    for (let k = from; k >= to; k--) keys.push(dayBack(k));
    // Same sums as the app: refunds cancel their purchase, goal purchases left out.
    return netExpenses({ transactions: rows }).filter((r) => keys.indexOf(r.date.slice(0, 10)) >= 0).reduce((a, r) => a + r.amount, 0);
  };
  const cur = span(dow + 7, dow + 1), prev = span(dow + 14, dow + 8);
  let body = 'Tap for your recap.';
  if (prev > 0) {
    const p = Math.round((cur - prev) / prev * 100);
    body = (p > 0 ? '▲ ' : p < 0 ? '▼ ' : '') + Math.abs(p) + '% vs the week before. Tap for your recap.';
  }
  await push('Last week: ' + peso(cur), body, '/recap');
  return { cur, prev };
}

// 8pm: one push, only when something needs Luis.
async function eveningCheck() {
  const rows = await transactions(1);
  const review = rows.filter((r) => r.type === 'Expense' && (r.review || !r.category)).length;
  const g = (await gaps()).length;
  const over = spentOn(manilaDay(), rows) - (await allowance());
  const parts = [];
  if (review) parts.push(review + (review === 1 ? ' payment' : ' payments') + ' to explain');
  if (g) parts.push(g + ' untracked ' + (g === 1 ? 'amount' : 'amounts'));
  if (over > 0) parts.push(peso(over) + ' over today');
  if (parts.length) await push('Money check-in', parts.join(' · ') + '. Tap to sort it out.', '/?ask=checkin');
  return { parts };
}

const JOBS = {
  // A push from the Apps Script itself (e.g. the IBKR sync failed).
  push: (b) => push(String(b.title || 'Money').slice(0, 80), String(b.body || '').slice(0, 200), b.url || '/'),
  'daily-close': dailyClose, 'weekly-recap': weeklyRecap, 'evening-check': eveningCheck, 'goal-sweep': async () => { const r = await sweepWeek(); if (r.push) await push(...r.push); return r; }, 'test-push': () => push('Test from Money', 'Push is working.', '/') };

export async function POST(req, { params }) {
  if (!authorizedApp(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const job = JOBS[params.job];
  if (!job) return NextResponse.json({ error: 'unknown job' }, { status: 404 });
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json({ ok: true, result: await job(body || {}) });
  } catch (e) {
    return NextResponse.json({ error: String(e && e.message ? e.message : e) }, { status: 500 });
  }
}
