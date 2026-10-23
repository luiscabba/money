// Reads the database into the same shape the Apps Script's doGet used to return, so the screens don't change.
import { select, insert, update, remove, eq, inList } from './db';
import { CATEGORIES, manila, manilaDay, round2 } from './core';

export async function names() {
  const out = {};
  (await select('names')).forEach((r) => { if (r.nickname) out[r.merchant.toLowerCase()] = r.nickname; });
  return out;
}

export async function budgets() {
  return (await select('budgets', 'select=*&order=sort')).map((b) => ({ name: b.name, budget: Number(b.monthly) || 0, includes: b.includes.length ? b.includes : [b.name] }));
}

export async function allowance(bs) {
  const total = (bs || (await budgets())).reduce((a, b) => a + b.budget, 0);
  const [y, m] = manilaDay().split('-').map(Number);
  return Math.round(total / new Date(y, m, 0).getDate());
}

export function txOut(r, nick) {
  const raw = r.merchant;
  return {
    row: Number(r.n), date: manila(r.ts), type: r.type, amount: Number(r.amount),
    merchant: (nick && nick[raw.toLowerCase()]) || raw, raw, category: r.category, source: r.source, ref: r.ref,
    review: !!r.review, note: r.note || ''
  };
}

// First day of the month `months` back, Manila time.
function cutoff(months) {
  const [y, m] = manilaDay().split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - (months || 3), 1));
  return d.toISOString().slice(0, 10) + 'T00:00:00+08:00';
}

export async function transactions(months, nick) {
  const rows = await select('transactions', 'select=*&type=neq.Void&ts=gte.' + encodeURIComponent(cutoff(months)) + '&order=ts,n');
  const nk = nick || (await names());
  return rows.map((r) => txOut(r, nk));
}

export async function holdings() {
  return (await select('holdings', 'select=*&order=symbol')).map((h) => {
    const qty = Number(h.quantity) || 0;
    const price = h.symbol === 'CASH' ? 1 : Number(h.price) || Number(h.mark) || Number(h.avg_cost) || 0;
    const avg = h.symbol === 'CASH' ? 1 : Number(h.avg_cost) || 0;
    return { symbol: h.symbol, sleeve: h.sleeve, qty, avg, price, usd: round2(qty * price), cost: round2(qty * avg), prev: h.symbol === 'CASH' ? 1 : Number(h.prev_close) || price };
  });
}

export async function setting(key) {
  const rows = await select('settings', eq('key', key));
  return rows[0] ? rows[0].value : null;
}

export async function setSetting(key, value) {
  await insert('settings', [{ key, value, updated_at: new Date().toISOString() }], { upsert: true, onConflict: 'key' });
}

export async function netWorth() {
  const fx = Number(await setting('usd_php')) || null;
  const accts = await select('accounts', 'select=*&order=sort');
  const hist = await select('networth_history', 'select=date,total_php&order=date');
  return {
    usdphp: fx,
    accounts: accts.map((a) => {
      const bal = Number(a.balance) || 0;
      return { name: a.name, currency: a.currency, balance: bal, php: round2(a.currency === 'USD' ? bal * (fx || 0) : bal), asOf: a.as_of ? manilaDay(a.as_of) : '' };
    }),
    history: hist.map((h) => ({ date: h.date, total: Number(h.total_php) || 0 }))
  };
}

export async function investHistory() {
  return (await select('invest_history', 'select=*&order=date')).map((r) => ({
    date: r.date, value: Number(r.value_usd) || 0, cost: Number(r.cost_usd) || 0, deposited: r.deposited_usd === null ? null : Number(r.deposited_usd)
  }));
}

export async function owed() {
  return (await select('owed', 'select=*&order=created_at')).map((o) => ({
    id: o.id, who: o.who, amount: Number(o.amount) || 0, for: o.purpose, created: manilaDay(o.created_at), status: o.status,
    settled: o.settled_at ? manilaDay(o.settled_at) : '', matchRow: o.match_row ? Number(o.match_row) : null
  }));
}

export async function plans() {
  return (await select('plans', 'select=*&status=neq.removed&order=created_at')).map((p) => ({ id: p.id, what: p.what, amount: Number(p.amount) || 0, date: p.due || '', status: p.status }));
}

export async function gaps() {
  return (await select('gaps', 'select=*&status=eq.open&order=found_at')).map((g) => ({
    id: g.id, account: g.account, amount: Number(g.amount), from: g.from_ts ? manila(g.from_ts).slice(0, 16) : '', to: g.to_ts ? manila(g.to_ts).slice(0, 16) : ''
  }));
}

export async function notes() {
  return (await select('notes', 'select=*&order=added_at')).filter((n) => n.note).map((n) => ({ id: n.id, text: n.note }));
}

export async function loadData(months = 13) {
  const nick = await names();
  const [bs, tx, nw, hold, ih, ow, pl, gp, nt] = await Promise.all([
    budgets(), transactions(months, nick), netWorth(), holdings(), investHistory(), owed(), plans(), gaps(), notes()
  ]);
  return {
    updatedAt: manila(new Date()).replace(' ', 'T') + '+08:00',
    allowance: await allowance(bs),
    budgets: bs, transactions: tx, netWorth: nw, holdings: hold, investHistory: ih, owed: ow, plans: pl, gaps: gp, notes: nt,
    categories: CATEGORIES
  };
}

/* ---------- rules ---------- */

export async function rules() {
  return select('rules', 'select=pattern,category&order=id');
}

export async function addRule(merchant, category, by) {
  // A person is remembered by full name (two "Send to Juan ..." are different people); shops by their first words.
  const key = /^send to /i.test(String(merchant)) ? String(merchant).toLowerCase().trim()
    : String(merchant || '').toLowerCase().replace(/[^a-z0-9& ]/g, ' ').trim().split(/\s+/).slice(0, 3).join(' ');
  if (key.length < 3) return;
  await insert('rules', [{ pattern: key, category, added_by: by }], { upsert: true, onConflict: 'pattern' });
}

export async function recipientRule(merchant) {
  const key = String(merchant).toLowerCase().trim();
  const hit = await select('rules', eq('pattern', key) + '&select=category');
  return hit[0] ? hit[0].category : '';
}

/* ---------- devices ---------- */

export async function devices() {
  return select('devices', 'select=endpoint,subscription');
}

export async function addDevice(sub) {
  await insert('devices', [{ endpoint: sub.endpoint, subscription: sub }], { ignore: true, onConflict: 'endpoint' });
}

export async function removeDevices(endpoints) {
  if (endpoints.length) await remove('devices', inList('endpoint', endpoints));
}

export { update };
