// Pure calculations shared by the screens.
import { atmFee } from './core';

export const peso = (n) => '₱' + Math.round(n || 0).toLocaleString('en-US');
export const usd = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function manilaNow() {
  const s = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Manila', hour12: false });
  const [d] = s.split(',');
  const [y, m, day] = d.split('-').map(Number);
  return { y, m, d: day, key: d };
}

export const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
export const daysIn = (y, m) => new Date(y, m, 0).getDate();
// Monday = 0
export const weekdayOf = (y, m, d) => (new Date(y, m - 1, d).getDay() + 6) % 7;

export function totalBudget(data) {
  return (data.budgets || []).reduce((a, b) => a + b.budget, 0);
}

// What's left to spend after goal set-asides. They apply from the current month on, so past days keep the
// allowance they had.
export function spendBudget(data, y, m) {
  const plan = data.goalPlan;
  if (!plan || !plan.setAside) return totalBudget(data);
  const now = manilaNow();
  return totalBudget(data) - (y * 12 + m >= now.y * 12 + now.m ? plan.setAside : 0);
}

export function allowanceFor(data, y, m) {
  return Math.round(spendBudget(data, y, m) / daysIn(y, m));
}

export function expensesByDay(data, y, m) {
  const prefix = y + '-' + pad(m) + '-';
  const out = {};
  netExpenses(data).forEach((t) => {
    if (!t.date.startsWith(prefix)) return;
    const d = Number(t.date.slice(8, 10));
    (out[d] = out[d] || []).push(t);
  });
  return out;
}

export const sum = (xs) => xs.reduce((a, t) => a + t.amount, 0);

// Spending with refunds taken off. A refund that matches a purchase (same merchant and
// amount) cancels it, so both disappear. Any other refund becomes a negative line in the
// category of the merchant's most recent purchase.
const netCache = new WeakMap();
export function netExpenses(data) {
  if (netCache.has(data)) return netCache.get(data);
  // A purchase paid from a goal is savings spent, not budget spent.
  const all = (data.transactions || []).filter((t) => !t.goal);
  const exp = all.filter((t) => t.type === 'Expense');
  const cancelled = new Set();
  const extra = [];
  all.filter((t) => t.type === 'Refund').forEach((r) => {
    const same = exp.filter((e) => e.merchant === r.merchant && e.date <= r.date && !cancelled.has(e));
    const exact = same.filter((e) => Math.abs(e.amount - r.amount) < 0.01).pop();
    if (exact) { cancelled.add(exact); return; }
    const last = same.pop();
    if (last) extra.push({ ...r, type: 'Expense', amount: -r.amount, category: last.category, review: false, fromRefund: true });
  });
  // The cash from an ATM is still Luis's money; only the bank's fee on top of it is spent.
  all.filter((t) => t.type === 'Cash Withdrawal' && atmFee(t.amount)).forEach((t) => {
    extra.push({ ...t, type: 'Expense', amount: atmFee(t.amount), merchant: 'ATM fee', category: 'Bills & Phone', review: false, fromFee: true });
  });
  const out = exp.filter((e) => !cancelled.has(e)).concat(extra).sort((a, b) => (a.date < b.date ? -1 : 1));
  netCache.set(data, out);
  return out;
}

export function monthSpent(data, y, m) {
  const prefix = y + '-' + pad(m) + '-';
  return sum(netExpenses(data).filter((t) => t.date.startsWith(prefix)));
}

export function budgetGroups(data, y, m) {
  const prefix = y + '-' + pad(m) + '-';
  const tx = netExpenses(data).filter((t) => t.date.startsWith(prefix));
  return (data.budgets || []).map((b) => {
    const items = tx.filter((t) => b.includes.indexOf(t.category) >= 0);
    return { ...b, items, spent: sum(items) };
  });
}

export function needsReview(data) {
  // Flagged rows only. Picking a category (even Other) clears the flag, so a row never comes back once decided.
  return (data.transactions || []).filter((t) => t.type === 'Expense' && (t.review || !t.category)).slice(-30).reverse();
}

export function streakUnder(data, now) {
  const allow = allowanceFor(data, now.y, now.m);
  const byKey = {};
  netExpenses(data).forEach((t) => { byKey[t.date.slice(0, 10)] = (byKey[t.date.slice(0, 10)] || 0) + t.amount; });
  let streak = 0;
  const base = new Date(now.y, now.m - 1, now.d);
  for (let k = 0; k < 120; k++) {
    const d = new Date(base.getTime() - k * 86400000);
    const key = dayKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if ((byKey[key] || 0) <= allow) streak++; else break;
  }
  return streak;
}

export function avgMonthlySpend(data, now) {
  const totals = [];
  for (let k = 1; k <= 3; k++) {
    const d = new Date(now.y, now.m - 1 - k, 1);
    const s = monthSpent(data, d.getFullYear(), d.getMonth() + 1);
    if (s > 0) totals.push(s);
  }
  return totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
}

// App wallets (Lalamove, Grab, ShopeePay…): a top-up is a Transfer Out whose merchant is "<Brand> Wallet";
// spending paid from it has that name as its source. Maya Wallet is a bank account, not one of these.
export const isAppWallet = (s) => /\bwallet$/i.test(String(s || '').trim()) && !/^maya\b/i.test(String(s || '').trim());

export function appWallets(data) {
  // The server works these out over all time and from any balance set for them.
  if (data.netWorth && Array.isArray(data.netWorth.wallets)) return data.netWorth.wallets.filter((w) => Math.abs(w.php) >= 1 || w.anchored);
  const bal = {};
  (data.transactions || []).forEach((t) => {
    const to = t.raw || t.merchant;
    if (t.type === 'Transfer Out' && isAppWallet(to)) bal[to] = (bal[to] || 0) + t.amount;
    if (isAppWallet(t.source)) {
      if (t.type === 'Expense') bal[t.source] = (bal[t.source] || 0) - t.amount;
      if (t.type === 'Refund') bal[t.source] = (bal[t.source] || 0) + t.amount;
    }
  });
  return Object.entries(bal).map(([name, php]) => ({ name, php: Math.round(php * 100) / 100 })).filter((w) => Math.abs(w.php) >= 1).sort((a, b) => b.php - a.php);
}
