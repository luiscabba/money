// Moving data between the Google Sheet and the database: the one-time copy in, and the mirror back out.
import { select, insert, remove, rpc } from './db';
import { manila, manilaDay, parseWhen } from './core';

const num = (v) => { const n = Number(String(v === null || v === undefined ? '' : v).replace(/[,₱\s]/g, '')); return isFinite(n) ? n : null; };
const str = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const has = (v) => str(v) !== '';
// Apps Script sends Dates as ISO (UTC); text cells come as typed. Both become a real moment.
const at = (v) => { if (!has(v)) return null; const d = parseWhen(str(v)); return isNaN(d) ? null : d.toISOString(); };
const day = (v) => { if (!has(v)) return null; const s = str(v); return /T.*Z$/.test(s) ? manilaDay(new Date(s)) : /^\d{4}-\d\d-\d\d/.test(s) ? s.slice(0, 10) : manilaDay(parseWhen(s)); };
const body = (tab) => (tab || []).slice(1);

const WIPE = {
  owed: 'id=not.is.null', transactions: 'n=gte.0', rules: 'id=gte.0', names: 'merchant=not.is.null', notes: 'id=not.is.null',
  budgets: 'name=not.is.null', plans: 'id=not.is.null', gaps: 'id=not.is.null', balances: 'id=gte.0', accounts: 'name=not.is.null',
  holdings: 'symbol=not.is.null', invest_history: 'date=not.is.null', networth_history: 'date=not.is.null', devices: 'endpoint=not.is.null',
  inbox_log: 'message_id=not.is.null'
};

export function mapTabs(t) {
  const out = {};
  out.transactions = body(t.Transactions).map((r, i) => ({ r, n: i + 2 })).filter(({ r }) => has(r[0]) && has(r[1]) && at(r[0])).map(({ r, n }) => ({
    n, ts: at(r[0]), type: str(r[1]), amount: num(r[2]) || 0, merchant: str(r[3]), category: str(r[4]), source: str(r[5]),
    ref: str(r[6]).replace(/^'/, ''), review: str(r[8]).toLowerCase() === 'yes', note: str(r[9])
  }));
  const seen = new Set();
  out.rules = body(t.Rules).filter((r) => has(r[0]) && has(r[1])).map((r) => ({ pattern: str(r[0]).toLowerCase(), category: str(r[1]), added_by: str(r[2]) }))
    .filter((r) => (seen.has(r.pattern) ? false : seen.add(r.pattern)));
  out.budgets = body(t.Budgets).filter((r) => has(r[0])).map((r, i) => ({ name: str(r[0]), monthly: num(r[1]) || 0, includes: str(r[2] || r[0]).split(',').map((s) => s.trim()).filter(Boolean), sort: i }));
  out.owed = body(t.Owed).filter((r) => has(r[0])).map((r) => ({ id: str(r[0]), who: str(r[1]), amount: num(r[2]) || 0, purpose: str(r[3]), created_at: at(r[4]) || new Date().toISOString(), status: str(r[5]) || 'open', settled_at: at(r[6]), match_row: num(r[7]) || null }));
  out.plans = body(t.Plans).filter((r) => has(r[0])).map((r) => ({ id: str(r[0]), what: str(r[1]), amount: num(r[2]) || 0, due: day(r[3]), status: str(r[4]) || 'planned', created_at: at(r[5]) || new Date().toISOString() }));
  out.gaps = body(t.Gaps).filter((r) => has(r[0])).map((r) => ({ id: str(r[0]), found_at: at(r[1]) || new Date().toISOString(), account: str(r[2]), amount: num(r[3]) || 0, from_ts: at(r[4]), to_ts: at(r[5]), status: str(r[6]) || 'open' }));
  out.balances = body(t.Balances).filter((r) => has(r[0]) && has(r[1]) && at(r[0])).map((r) => ({ at: at(r[0]), account: str(r[1]), balance: num(r[2]) || 0, note: str(r[3]) }));
  const nw = t['Net Worth'] || [];
  out.accounts = nw.slice(1, 6).filter((r) => has(r[0])).map((r, i) => ({ name: str(r[0]), currency: str(r[1]) || 'PHP', balance: num(r[2]) || 0, as_of: at(r[4]), updated_by: str(r[5]), sort: i }));
  out.usd_php = nw[1] ? num(nw[1][7]) : null;
  const nh = t['Net Worth History'] || [];
  const nhHead = (nh[0] || []).map(str);
  out.networth_history = body(nh).filter((r) => has(r[0])).map((r) => {
    const accounts = {};
    nhHead.forEach((h, i) => { if (i >= 1 && h && !/^total|^usd\/php/i.test(h) && has(r[i])) accounts[h] = num(r[i]); });
    const ti = nhHead.findIndex((h) => /^total/i.test(h)), fi = nhHead.findIndex((h) => /^usd\/php/i.test(h));
    return { date: day(r[0]), accounts, total_php: ti >= 0 ? num(r[ti]) : null, usd_php: fi >= 0 ? num(r[fi]) : null };
  }).filter((r, i, a) => r.date && a.findIndex((x) => x.date === r.date) === i);
  out.holdings = body(t.Holdings).filter((r) => has(r[0])).map((r) => ({
    symbol: str(r[0]).toUpperCase(), sleeve: str(r[1]), quantity: num(r[2]) || 0, avg_cost: num(r[3]), price: num(r[4]), mark: num(r[4]), quote: str(r[8]), prev_close: num(r[9])
  }));
  out.invest_history = body(t['Invest History']).filter((r) => has(r[0])).map((r) => ({ date: day(r[0]), value_usd: has(r[1]) ? num(r[1]) : null, cost_usd: has(r[2]) ? num(r[2]) : null, usd_php: has(r[3]) ? num(r[3]) : null, deposited_usd: has(r[4]) ? num(r[4]) : null }))
    .filter((r, i, a) => r.date && a.findIndex((x) => x.date === r.date) === i);
  out.devices = body(t.Devices).filter((r) => has(r[0]) && has(r[1])).map((r) => { let s = null; try { s = JSON.parse(str(r[1])); } catch (e) { s = null; } return s && { endpoint: str(r[0]), subscription: s, added_at: at(r[2]) || new Date().toISOString() }; })
    .filter(Boolean).filter((r, i, a) => a.findIndex((x) => x.endpoint === r.endpoint) === i);
  out.inbox_log = body(t['Inbox Log']).filter((r) => has(r[0])).map((r) => ({ message_id: str(r[0]), processed_at: at(r[1]) || new Date().toISOString(), result: str(r[2]) }))
    .filter((r, i, a) => a.findIndex((x) => x.message_id === r.message_id) === i);
  out.names = body(t.Names).filter((r) => has(r[0]) && has(r[1])).map((r) => ({ merchant: str(r[0]).toLowerCase(), nickname: str(r[1]) }))
    .filter((r, i, a) => a.findIndex((x) => x.merchant === r.merchant) === i);
  out.notes = body(t.Notes).filter((r) => has(r[0])).map((r) => ({ id: str(r[0]), note: str(r[1]), added_at: at(r[2]) || new Date().toISOString() }));
  return out;
}

// Replaces every table with what the sheet holds. Used for the first copy and to re-copy right before switching over.
export async function importTabs(tabs) {
  const m = mapTabs(tabs);
  const order = ['owed', 'transactions', 'rules', 'names', 'notes', 'budgets', 'plans', 'gaps', 'balances', 'accounts', 'holdings', 'invest_history', 'networth_history', 'devices', 'inbox_log'];
  for (const t of order) await remove(t, WIPE[t]);
  const counts = {};
  const load = ['transactions', 'owed', 'rules', 'names', 'notes', 'budgets', 'plans', 'gaps', 'balances', 'accounts', 'holdings', 'invest_history', 'networth_history', 'devices', 'inbox_log'];
  const txRows = new Set(m.transactions.map((r) => r.n));
  m.owed.forEach((o) => { if (o.match_row && !txRows.has(o.match_row)) o.match_row = null; });
  for (const t of load) {
    const rows = m[t];
    for (let i = 0; i < rows.length; i += 500) await insert(t, rows.slice(i, i + 500));
    counts[t] = rows.length;
  }
  if (m.usd_php) await insert('settings', [{ key: 'usd_php', value: m.usd_php, updated_at: new Date().toISOString() }], { upsert: true, onConflict: 'key' });
  await rpc('reset_tx_seq');
  return counts;
}

/* ---------- mirror: database → sheet ---------- */

const cell = (d) => (d ? manila(d).slice(0, 16) : '');

export async function exportTabs(since) {
  const now = new Date().toISOString();
  const filter = since ? '&updated_at=gt.' + encodeURIComponent(since) : '';
  const tx = (await select('transactions', 'select=*' + filter + '&order=n'))
    .map((r) => [Number(r.n), cell(r.ts), r.type, Number(r.amount), r.merchant, r.category, r.source, r.ref, r.review ? 'yes' : '', r.note]);
  const out = { now, transactions: tx, maxRow: 0 };
  const last = await select('transactions', 'select=n&order=n.desc&limit=1');
  out.maxRow = last[0] ? Number(last[0].n) : 1;
  if (since) return out;
  const t = {};
  t.Rules = [['Merchant contains', 'Category', 'Added by'], ...(await select('rules', 'select=*&order=id')).map((r) => [r.pattern, r.category, r.added_by])];
  t.Budgets = [['Budget', 'Monthly (PHP)', 'Includes'], ...(await select('budgets', 'select=*&order=sort')).map((b) => [b.name, Number(b.monthly), b.includes.join(', ')])];
  t.Owed = [['ID', 'Who', 'Amount', 'For', 'Created', 'Status', 'Settled', 'Match row'], ...(await select('owed', 'select=*&order=created_at')).map((o) => [o.id, o.who, Number(o.amount), o.purpose, cell(o.created_at), o.status, cell(o.settled_at), o.match_row || ''])];
  t.Plans = [['ID', 'What', 'Amount', 'Date', 'Status', 'Created'], ...(await select('plans', 'select=*&order=created_at')).map((p) => [p.id, p.what, Number(p.amount), p.due || '', p.status, cell(p.created_at)])];
  t.Gaps = [['ID', 'Found', 'Account', 'Amount', 'From', 'To', 'Status'], ...(await select('gaps', 'select=*&order=found_at')).map((g) => [g.id, cell(g.found_at), g.account, Number(g.amount), cell(g.from_ts), cell(g.to_ts), g.status])];
  t.Balances = [['Time', 'Account', 'Balance', 'Note'], ...(await select('balances', 'select=*&order=at')).map((b) => [cell(b.at), b.account, Number(b.balance), b.note])];
  t['Invest History'] = [['Date', 'Value (USD)', 'Cost (USD)', 'USD/PHP', 'Deposited (USD)'], ...(await select('invest_history', 'select=*&order=date')).map((r) => [r.date, r.value_usd ?? '', r.cost_usd ?? '', r.usd_php ?? '', r.deposited_usd ?? ''])];
  const nh = await select('networth_history', 'select=*&order=date');
  const cols = ['Maya', 'GoTyme', 'BPI', 'GCash', 'IBKR (PHP)'];
  nh.forEach((r) => Object.keys(r.accounts || {}).forEach((k) => { if (cols.indexOf(k) < 0) cols.push(k); }));
  t['Net Worth History'] = [['Date', ...cols, 'Total (PHP)', 'USD/PHP'], ...nh.map((r) => [r.date, ...cols.map((c) => (r.accounts || {})[c] ?? ''), r.total_php ?? '', r.usd_php ?? ''])];
  t.Devices = [['Endpoint', 'Subscription JSON', 'Added'], ...(await select('devices', 'select=*&order=added_at')).map((d) => [d.endpoint, JSON.stringify(d.subscription), cell(d.added_at)])];
  t.Names = [['Merchant', 'Nickname'], ...(await select('names', 'select=*&order=merchant')).map((n) => [n.merchant, n.nickname])];
  t.Notes = [['ID', 'Note', 'Added'], ...(await select('notes', 'select=*&order=added_at')).map((n) => [n.id, n.note, cell(n.added_at)])];
  t['Inbox Log'] = [['Message ID', 'Processed at', 'Result'], ...(await select('inbox_log', 'select=*&order=processed_at.desc&limit=1000')).reverse().map((l) => [l.message_id, cell(l.processed_at), l.result])];
  out.tabs = t;
  // Written cell by cell so the sheet's own formulas (PHP values, live prices) stay.
  out.accounts = (await select('accounts', 'select=*&order=sort')).map((a) => [a.name, Number(a.balance), a.as_of ? manilaDay(a.as_of) : '', a.updated_by]);
  out.holdings = (await select('holdings', 'select=*&order=symbol')).map((h) => [h.symbol, h.sleeve, Number(h.quantity), Number(h.avg_cost) || 0, h.quote, Number(h.mark) || Number(h.price) || Number(h.avg_cost) || 0]);
  return out;
}
