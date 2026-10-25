// Money moving through each account: which account a row belongs to, and what kind of money in or out it is.
// Safe on the phone and the server.

export const ACCOUNT_COLORS = { Maya: '#4D7CFF', IBKR: '#FF8A3D', BPI: '#3DDC97', GoTyme: '#C38BFF', GCash: '#A3ABBA', 'App wallets': '#FFD166' };

// Maya Wallet, Maya Card, Maya Savings and receipts paid with Maya are all the Maya account.
export function accountOf(source) {
  const s = String(source || '');
  if (/^maya/i.test(s)) return 'Maya';
  if (/^gcash/i.test(s)) return 'GCash';
  if (/^gotyme/i.test(s)) return 'GoTyme';
  if (/^bpi/i.test(s)) return 'BPI';
  if (/wallet$/i.test(s)) return 'App wallets';
  if (/^cash$/i.test(s)) return 'Cash';
  return s;
}

// Moving your own money: between your accounts, or topping up an app wallet. Never income or spending.
export const isOwnMove = (t) => /^Own account/i.test(t.merchant || '') || (/^Transfer/.test(t.type) && /wallet$/i.test(t.merchant || ''));

// in: real money in (income, money from people, refunds and cashback); out: spending and money sent;
// move: your own money changing places; null: not money (voided rows).
export function direction(t) {
  if (t.type === 'Void') return null;
  if (isOwnMove(t)) return 'move';
  if (t.type === 'Income' || t.type === 'Refund' || t.type === 'Transfer In') return 'in';
  return 'out';
}

export function kindLabel(t) {
  if (isOwnMove(t)) return 'Between your accounts';
  if (t.type === 'Income') return 'Income';
  if (t.type === 'Transfer In') return 'Sent to you';
  if (t.type === 'Refund') return /cashback/i.test(t.merchant) ? 'Cashback' : 'Refund';
  if (t.type === 'Transfer Out') return 'Sent';
  if (t.type === 'Cash Withdrawal') return 'Cash out';
  return t.category || 'Spending';
}

// Money that came in during a month (YYYY-MM-): income plus money people sent you. Refunds already lower spending.
export function earnedIn(data, prefix) {
  return (data.transactions || []).filter((t) => t.date.startsWith(prefix) && direction(t) === 'in' && t.type !== 'Refund').reduce((a, t) => a + t.amount, 0);
}

// Clean display name for a row: "Own account (GCash)" reads as "To GCash" or "From GCash".
export function rowName(t) {
  const m = /^Own account \((.+)\)$/i.exec(t.merchant || '');
  if (m) return (/In|Income/.test(t.type) ? 'From ' : 'To ') + (m[1] === 'self' ? 'your other account' : m[1]);
  return t.merchant;
}

// Monday-start week label for grouping long lists.
export function weekLabel(dateStr, now) {
  const d = new Date(dateStr.slice(0, 10) + 'T12:00:00');
  const today = new Date(now.y, now.m - 1, now.d, 12);
  const monday = (x) => { const c = new Date(x); c.setDate(c.getDate() - ((c.getDay() + 6) % 7)); return c; };
  const a = monday(d), b = monday(today);
  const weeks = Math.round((b - a) / (7 * 86400000));
  if (weeks === 0) return 'This week';
  if (weeks === 1) return 'Last week';
  const end = new Date(a); end.setDate(end.getDate() + 6);
  const f = (x) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return f(a) + ' to ' + (end.getMonth() === a.getMonth() ? end.getDate() : f(end));
}

// Pesos with centavos when there are any: ₱17.50, ₱15,890.63, ₱500.
export const exact = (n) => '₱' + (Math.round(n * 100) % 100 ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(n).toLocaleString('en-US'));
