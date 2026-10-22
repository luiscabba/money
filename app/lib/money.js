// Pure calculations shared by the screens.
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

export function allowanceFor(data, y, m) {
  return Math.round(totalBudget(data) / daysIn(y, m));
}

export function expensesByDay(data, y, m) {
  const prefix = y + '-' + pad(m) + '-';
  const out = {};
  (data.transactions || []).forEach((t) => {
    if (t.type !== 'Expense' || !t.date.startsWith(prefix)) return;
    const d = Number(t.date.slice(8, 10));
    (out[d] = out[d] || []).push(t);
  });
  return out;
}

export const sum = (xs) => xs.reduce((a, t) => a + t.amount, 0);

export function monthSpent(data, y, m) {
  const prefix = y + '-' + pad(m) + '-';
  return sum((data.transactions || []).filter((t) => t.type === 'Expense' && t.date.startsWith(prefix)));
}

export function budgetGroups(data, y, m) {
  const prefix = y + '-' + pad(m) + '-';
  const tx = (data.transactions || []).filter((t) => t.type === 'Expense' && t.date.startsWith(prefix));
  return (data.budgets || []).map((b) => {
    const items = tx.filter((t) => b.includes.indexOf(t.category) >= 0);
    return { ...b, items, spent: sum(items) };
  });
}

export function needsReview(data) {
  return (data.transactions || []).filter((t) => t.type === 'Expense' && (t.review || t.category === 'Other' || !t.category)).slice(-30).reverse();
}

export function streakUnder(data, now) {
  const allow = allowanceFor(data, now.y, now.m);
  const byKey = {};
  (data.transactions || []).forEach((t) => { if (t.type === 'Expense') byKey[t.date.slice(0, 10)] = (byKey[t.date.slice(0, 10)] || 0) + t.amount; });
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
