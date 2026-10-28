// Balances read from notifications and texts, and the missing-money check that compares them with tracked rows.
import { select, insert, update, eq } from './db';
import { newId, round2, rowEffects, markPairs } from './core';
import { push } from './push';

export const GAP_MIN = 150;
const PAIR_MS = 2 * 86400000;

// Net tracked movement for one account after `from`, up to and including `to`, both sides of moves included.
// 'Maya' here is Maya's wallet; 'Maya Savings' is asked for separately.
async function trackedFlow(account, from, to) {
  const iso = (t) => encodeURIComponent(new Date(t).toISOString());
  const rows = markPairs(await select('transactions', 'select=ts,type,amount,source,merchant&type=neq.Void&ts=gt.' + iso(from.getTime() - PAIR_MS) + '&ts=lte.' + iso(to.getTime() + PAIR_MS)));
  let flow = 0;
  rows.forEach((r) => {
    const t = new Date(r.ts).getTime();
    if (t <= from.getTime() || t > to.getTime()) return;
    rowEffects(r).forEach(([acct, v]) => { if (acct === account) flow += v; });
  });
  return flow;
}

// Maya's notification shows the wallet only, so Maya's net worth moves by the change; the others are the whole account.
// A total Luis told Moni since the last real reading already moved the anchor past that point, so the tracked
// flow in between isn't added again on top of it. Money moved between savings and wallet changes the wallet
// reading but not the total, so it's taken back out.
async function updateNetWorth(account, balance, prev, when) {
  const a = await select('accounts', eq('name', account));
  if (!a[0]) return;
  let next = balance;
  if (account === 'Maya') {
    if (!prev) return;
    const prevAt = new Date(prev.at);
    let delta = balance - Number(prev.balance);
    const anchoredAt = a[0].as_of ? new Date(a[0].as_of) : null;
    const after = anchoredAt && anchoredAt > prevAt ? anchoredAt : prevAt;
    if (after > prevAt) delta -= await trackedFlow(account, prevAt, after);
    delta += await trackedFlow('Maya Savings', after, when);
    next = round2(Number(a[0].balance) + delta);
  }
  await update('accounts', eq('name', account), { balance: next, as_of: when.toISOString() });
}

// Records a balance and checks it against the last one. Returns the gap id added, if any.
// opts.noGap: a balance Luis states isn't checked for missing money. opts.out.id receives the saved reading's id.
export async function recordBalance(account, balance, when, note, opts = {}) {
  if (!account || !(balance >= 0)) return null;
  // For Maya, totals Luis told Moni aren't wallet readings, so the wallet's change is measured from the last real one.
  const prevRows = await select('balances', eq('account', account) + (account === 'Maya' ? '&note=not.like.told*' : '') + '&order=at.desc&limit=1');
  const prev = prevRows[0] || null;
  const [saved] = await insert('balances', [{ at: when.toISOString(), account, balance, note: note || '' }]);
  if (opts.out && saved) opts.out.id = saved.id;
  // A reading older than the last one (notifications handled out of order) is kept but changes nothing.
  if (prev && when.getTime() <= new Date(prev.at).getTime()) return null;
  await updateNetWorth(account, balance, prev, when);
  if (!prev || opts.noGap) return null;
  const from = new Date(prev.at);
  const expected = Number(prev.balance) + (await trackedFlow(account, from, when));
  const gap = round2(balance - expected);
  if (Math.abs(gap) < GAP_MIN) return null;
  const id = newId();
  await insert('gaps', [{ id, account, amount: gap, from_ts: from.toISOString(), to_ts: when.toISOString(), status: 'open' }]);
  const amt = '₱' + Math.round(Math.abs(gap)).toLocaleString('en-US');
  await push(account + ': ' + amt + (gap < 0 ? ' not tracked' : ' extra'),
    (gap < 0 ? 'Money left ' : 'Money came into ') + account + " that the app didn't see. Tell Moni what it was.", '/');
  return id;
}

// Balances read from texts by the nightly Mac check. Each newer than the account's last known balance is recorded.
export async function takeBalances(rows) {
  const out = [];
  const sorted = rows.filter((r) => !isNaN(r.when) && ['Maya', 'GCash', 'GoTyme', 'BPI'].indexOf(r.account) >= 0 && r.balance >= 0).sort((a, b) => a.when - b.when);
  for (const r of sorted) {
    const last = await select('balances', eq('account', r.account) + '&order=at.desc&limit=1');
    if (last[0] && new Date(last[0].at) >= r.when) { out.push('older'); continue; }
    out.push((await recordBalance(r.account, r.balance, r.when, 'text')) ? 'gap' : 'ok');
  }
  return out;
}
