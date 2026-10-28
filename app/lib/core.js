// Constants and helpers shared by the server-side money logic (ported from the Apps Script).
export const TZ = 'Asia/Manila';
export const CATEGORIES = ['Food & Drinks', 'Transport', 'Shopping', 'Subscriptions', 'Entertainment', 'Groceries', 'Fitness', 'Personal Care', 'Bills & Phone', 'Other'];
export const ACCOUNTS = ['Maya', 'GCash', 'GoTyme', 'BPI', 'Cash'];

// "2026-10-23 14:05:09" in Manila time.
export function manila(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x)) return '';
  return x.toLocaleString('sv-SE', { timeZone: TZ, hour12: false }).slice(0, 19);
}
export const manilaDay = (d) => manila(d || new Date()).slice(0, 10);

// Accepts "YYYY-MM-DD", "YYYY-MM-DD HH:mm", ISO strings or Dates; bare text is read as Manila time.
export function parseWhen(s) {
  if (s instanceof Date) return s;
  const t = String(s || '').trim();
  if (!t) return new Date(NaN);
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(t)) return new Date(t);
  if (/^\d{4}-\d\d-\d\d$/.test(t)) return new Date(t + 'T12:00:00+08:00');
  return new Date(t.replace(' ', 'T') + (t.length <= 16 ? ':00' : '') + '+08:00');
}

export const peso = (n) => '₱' + Math.round(n || 0).toLocaleString('en-US');
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const newId = () => crypto.randomUUID().slice(0, 8);

export function authorizedApp(req) {
  const auth = req.headers.get('authorization') || '';
  return !!process.env.APP_TOKEN && auth === 'Bearer ' + process.env.APP_TOKEN;
}

export function sourceAccount(source) {
  const s = String(source || '');
  if (/^Maya/i.test(s)) return 'Maya';
  if (/^GCash/i.test(s)) return 'GCash';
  if (/^GoTyme/i.test(s)) return 'GoTyme';
  if (/^BPI/i.test(s)) return 'BPI';
  if (/^Cash\b/i.test(s)) return 'Cash';
  return '';
}

// An app wallet (Lalamove, Grab, ShopeePay…) is named "<Brand> Wallet"; Maya Wallet is part of Maya.
export const isAppWallet = (s) => /\bwallet$/i.test(String(s || '').trim()) && !/^maya\b/i.test(String(s || '').trim());
export const walletKey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

// ATMs add a small fee to the round amount: ₱518 is ₱500 in cash and an ₱18 fee.
export function atmFee(amount) {
  const r = round2(round2(amount) % 100);
  return r > 0 && r <= 25 ? r : 0;
}

const tsOf = (t) => (t.ts ? new Date(t.ts) : new Date(String(t.date || '').replace(' ', 'T') + '+08:00'));

// The other account in a move between Luis's own accounts: Cash for an ATM withdrawal, the wallet for an app
// top-up, the named account for "Own account (…)". '' when there is none tracked here (IBKR, "self").
export function moveOther(t) {
  if (t.type === 'Cash Withdrawal') return 'Cash';
  if (!/^Transfer (In|Out)$/.test(t.type)) return '';
  const merchant = String(t.raw || t.merchant || '').trim();
  if (t.type === 'Transfer Out' && isAppWallet(merchant)) return merchant;
  const m = /^Own account \((.+)\)$/i.exec(merchant);
  if (!m) return '';
  if (/^maya savings/i.test(m[1])) return 'Maya Savings';
  return sourceAccount(m[1]);
}

// When both sides of one move were logged (Maya's "sent" text and GoTyme's "received" one), each row then moves
// only its own account. Returns copies with paired set.
export function markPairs(rows) {
  const out = rows.map((r) => ({ ...r }));
  const ins = out.filter((r) => r.type === 'Transfer In' && /^Own account/i.test(String(r.raw || r.merchant || '')));
  out.forEach((r) => {
    if (r.type !== 'Transfer Out') return;
    const to = moveOther(r);
    if (!to || to === 'Maya Savings' || isAppWallet(to)) return;
    const from = sourceAccount(r.source);
    const at = tsOf(r).getTime();
    const hit = ins.find((x) => !x.paired && sourceAccount(x.source) === to && Math.abs(Number(x.amount) - Number(r.amount)) < 0.01
      && Math.abs(tsOf(x).getTime() - at) <= 2 * 86400000 && (!moveOther(x) || moveOther(x) === from));
    if (hit) { r.paired = true; hit.paired = true; }
  });
  return out;
}

// What one row does to each account: [[account, amount], …]. A move also lands on the other account (an ATM
// withdrawal lands as cash, less the fee). Maya Savings stays its own name so Maya's wallet-only checks see it.
export function rowEffects(t) {
  const amt = Number(t.amount) || 0;
  let e = 0;
  if (/^(Income|Transfer In|Refund)$/.test(t.type)) e = amt;
  else if (/^(Expense|Transfer Out|Cash Withdrawal)$/.test(t.type)) e = -amt;
  if (!e) return [];
  const out = [];
  const own = sourceAccount(t.source) || (isAppWallet(t.source) ? String(t.source).trim() : '');
  if (own) out.push([own, e]);
  const other = t.paired ? '' : moveOther(t);
  if (other) out.push([other, t.type === 'Cash Withdrawal' ? round2(amt - atmFee(amt)) : -e]);
  return out;
}

export { tsOf };

export function cleanMerchant(s) {
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/Indrive/, 'InDrive').replace(/^Send To /, 'Send to ');
}
