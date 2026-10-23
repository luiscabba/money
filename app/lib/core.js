// Constants and helpers shared by the server-side money logic (ported from the Apps Script).
export const TZ = 'Asia/Manila';
export const CATEGORIES = ['Food & Drinks', 'Transport', 'Shopping', 'Subscriptions', 'Entertainment', 'Groceries', 'Fitness', 'Personal Care', 'Bills & Phone', 'Other'];
export const ACCOUNTS = ['Maya', 'GCash', 'GoTyme', 'BPI'];

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
  return '';
}

export function cleanMerchant(s) {
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/Indrive/, 'InDrive').replace(/^Send To /, 'Send to ');
}
