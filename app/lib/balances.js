// Balances read from notifications and texts, and the missing-money check that compares them with tracked rows.
import { select, insert, update, eq } from './db';
import { newId, round2, sourceAccount } from './core';
import { push } from './push';

export const GAP_MIN = 150;

// Net tracked movement for one account after `from`, up to and including `to`.
async function trackedFlow(account, from, to) {
  const rows = await select('transactions', 'select=ts,type,amount,source&ts=gt.' + encodeURIComponent(from.toISOString()) + '&ts=lte.' + encodeURIComponent(to.toISOString()));
  let flow = 0;
  rows.forEach((r) => {
    if (sourceAccount(r.source) !== account) return;
    const amt = Number(r.amount) || 0;
    if (/^(Income|Transfer In|Refund)$/.test(r.type)) flow += amt;
    else if (/^(Expense|Transfer Out|Cash Withdrawal)$/.test(r.type)) flow -= amt;
  });
  return flow;
}

// Maya's notification shows the wallet only, so Maya's net worth moves by the change; the others are the whole account.
async function updateNetWorth(account, balance, prevBalance, when) {
  const a = await select('accounts', eq('name', account));
  if (!a[0]) return;
  let next = balance;
  if (account === 'Maya') {
    if (prevBalance === null) return;
    next = round2(Number(a[0].balance) + balance - prevBalance);
  }
  await update('accounts', eq('name', account), { balance: next, as_of: when.toISOString() });
}

// Records a balance and checks it against the last one. Returns the gap id added, if any.
export async function recordBalance(account, balance, when, note) {
  if (!account || !(balance >= 0)) return null;
  const prevRows = await select('balances', eq('account', account) + '&order=at.desc&limit=1');
  const prev = prevRows[0] || null;
  await insert('balances', [{ at: when.toISOString(), account, balance, note: note || '' }]);
  await updateNetWorth(account, balance, prev ? Number(prev.balance) : null, when);
  if (!prev) return null;
  const from = new Date(prev.at);
  const expected = Number(prev.balance) + (await trackedFlow(account, from, when));
  const gap = round2(balance - expected);
  if (Math.abs(gap) < GAP_MIN) return null;
  const id = newId();
  await insert('gaps', [{ id, account, amount: gap, from_ts: from.toISOString(), to_ts: when.toISOString(), status: 'open' }]);
  const amt = '₱' + Math.round(Math.abs(gap)).toLocaleString('en-US');
  await push(account + ': ' + amt + (gap < 0 ? ' not tracked' : ' extra'),
    (gap < 0 ? 'Money left ' : 'Money came into ') + account + " that the app didn't see. Tell Ask Money what it was.", '/');
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
