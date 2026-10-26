// Reads the database into the same shape the Apps Script's doGet used to return, so the screens don't change.
import { select, insert, update, remove, eq, inList } from './db';
import { CATEGORIES, ACCOUNTS, manila, manilaDay, round2, sourceAccount } from './core';
import { goalPlan } from './goals';

export async function names() {
  const out = {};
  (await select('names')).forEach((r) => { if (r.nickname) out[r.merchant.toLowerCase()] = r.nickname; });
  return out;
}

export async function budgets() {
  return (await select('budgets', 'select=*&order=sort')).map((b) => ({ name: b.name, budget: Number(b.monthly) || 0, includes: b.includes.length ? b.includes : [b.name] }));
}

export async function allowance(bs) {
  const b = bs || (await budgets());
  const total = b.reduce((a, x) => a + x.budget, 0);
  const { plan } = await planGoals(null, b);
  const [y, m] = manilaDay().split('-').map(Number);
  return Math.round((total - plan.setAside) / new Date(y, m, 0).getDate());
}

export function txOut(r, nick) {
  const raw = r.merchant;
  return {
    row: Number(r.n), date: manila(r.ts), type: r.type, amount: Number(r.amount),
    merchant: (nick && nick[raw.toLowerCase()]) || raw, raw, category: r.category, source: r.source, ref: r.ref,
    review: !!r.review, note: r.note || '', goal: r.goal_id || ''
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
  const nk = (await nick) || (await names());
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

// What an account's money did through tracked rows after a moment. Void rows count for nothing.
export function rowEffect(type, amount) {
  const amt = Number(amount) || 0;
  if (/^(Income|Transfer In|Refund)$/.test(type)) return amt;
  if (/^(Expense|Transfer Out|Cash Withdrawal)$/.test(type)) return -amt;
  return 0;
}

// accounts.balance is the last balance read or set (the anchor). The live balance is that anchor plus every
// tracked row on the account since, so a logged, edited, voided or undone row moves the balance straight away.
export async function liveBalances(accts) {
  const tracked = accts.filter((a) => ACCOUNTS.indexOf(a.name) >= 0 && a.as_of);
  if (!tracked.length) return {};
  const from = tracked.reduce((m, a) => (a.as_of < m ? a.as_of : m), tracked[0].as_of);
  const rows = await select('transactions', 'select=ts,type,amount,source&type=neq.Void&ts=gt.' + encodeURIComponent(new Date(from).toISOString()));
  const out = {};
  tracked.forEach((a) => {
    const at = new Date(a.as_of).getTime();
    let flow = 0, since = 0;
    rows.forEach((r) => {
      if (sourceAccount(r.source) !== a.name || new Date(r.ts).getTime() <= at) return;
      const e = rowEffect(r.type, r.amount);
      if (e) { flow += e; since++; }
    });
    out[a.name] = { balance: round2((Number(a.balance) || 0) + flow), flow: round2(flow), since };
  });
  return out;
}

export async function netWorth() {
  const [fxRaw, accts, hist] = await Promise.all([setting('usd_php'), select('accounts', 'select=*&order=sort'), select('networth_history', 'select=date,total_php&order=date')]);
  const fx = Number(fxRaw) || null;
  const live = await liveBalances(accts);
  return {
    usdphp: fx,
    accounts: accts.map((a) => {
      const l = live[a.name];
      const bal = l ? l.balance : Number(a.balance) || 0;
      return {
        name: a.name, currency: a.currency, balance: bal, php: round2(a.currency === 'USD' ? bal * (fx || 0) : bal), asOf: a.as_of ? manilaDay(a.as_of) : '',
        anchor: Number(a.balance) || 0, sinceRows: l ? l.since : 0
      };
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

export async function goals() {
  return (await select('goals', 'select=*&status=neq.archived&order=priority,created_at')).map((g) => ({
    id: g.id, name: g.name, price: Number(g.price) || 0, target: g.target_date || '', priority: g.priority,
    status: g.status, created: g.created_at, closed: g.closed_at ? manilaDay(g.closed_at) : '', boughtRow: g.bought_row ? Number(g.bought_row) : null
  }));
}

export async function goalMoves() {
  return (await select('goal_moves', 'select=*&order=at')).map((m) => ({
    id: Number(m.id), goal: m.goal_id, at: manilaDay(m.at), amount: Number(m.amount) || 0, kind: m.kind, row: m.tx_row ? Number(m.tx_row) : null, note: m.note || ''
  }));
}

// Goals may take whatever keeps the daily limit at or above the floor Luis set (₱600 a day by default).
export async function planGoals(nw, bs) {
  const [gs, mv, floorRaw, bud] = await Promise.all([goals(), goalMoves(), setting('goal_floor'), bs ? Promise.resolve(bs) : budgets()]);
  return planFrom(gs, mv, floorRaw, bud, nw);
}

function planFrom(gs, mv, floorRaw, bud, nw) {
  const [y, m, d] = manilaDay().split('-').map(Number);
  const floor = floorRaw === null || floorRaw === undefined ? 600 : Number(floorRaw) || 0;
  const total = bud.reduce((a, b) => a + b.budget, 0);
  const cap = Math.max(0, Math.floor(total - floor * new Date(y, m, 0).getDate()));
  const maya = nw ? (nw.accounts.find((a) => a.name === 'Maya') || {}).php : null;
  const plan = goalPlan({ goals: gs, moves: mv, now: { y, m, d }, cap, maya });
  plan.floor = floor;
  return { list: gs, moves: mv, plan };
}

export async function pendingMatches() {
  const v = await setting('goal_matches');
  return Array.isArray(v) ? v : [];
}

export async function goalPending(pre) {
  const [sw, matches] = pre ? [pre.sweep, Array.isArray(pre.matches) ? pre.matches : []] : await Promise.all([setting('goal_sweep_pending'), pendingMatches()]);
  const rows = matches.length ? await select('transactions', 'select=n,amount,merchant,source,ts,goal_id&n=in.(' + matches.map((m) => Number(m.row)).join(',') + ')') : [];
  return {
    sweep: sw && sw.amount ? sw : null,
    matches: matches.map((mt) => {
      const t = rows.find((r) => Number(r.n) === Number(mt.row));
      return t && !t.goal_id ? { row: Number(t.n), goal: mt.goal, amount: Number(t.amount), merchant: t.merchant, source: t.source, ts: t.ts } : null;
    }).filter(Boolean)
  };
}

// Everything the screens need, fetched in parallel (about two round trips instead of six in a row).
export async function loadData(months = 13) {
  const nick = names();
  const SETTINGS = ['goal_floor', 'goal_sweep_pending', 'goal_matches', 'bills_hidden', 'calendar_events', 'calendar_dismissed'];
  const [bs, tx, nw, hold, ih, ow, pl, gp, nt, gs, mv, st] = await Promise.all([
    budgets(), transactions(months, nick), netWorth(), holdings(), investHistory(), owed(), plans(), gaps(), notes(),
    goals(), goalMoves(), select('settings', 'select=key,value&key=in.(' + SETTINGS.join(',') + ')')
  ]);
  const set = Object.fromEntries(st.map((r) => [r.key, r.value]));
  const g = planFrom(gs, mv, set.goal_floor === undefined ? null : set.goal_floor, bs, nw);
  const pending = await goalPending({ sweep: set.goal_sweep_pending, matches: set.goal_matches });
  const hiddenBills = set.bills_hidden;
  const total = bs.reduce((a, b) => a + b.budget, 0);
  const [yy, mm] = manilaDay().split('-').map(Number);
  return {
    updatedAt: manila(new Date()).replace(' ', 'T') + '+08:00',
    allowance: Math.round((total - g.plan.setAside) / new Date(yy, mm, 0).getDate()),
    goals: g.list, goalMoves: g.moves, goalPlan: g.plan, goalPending: pending, billsHidden: Array.isArray(hiddenBills) ? hiddenBills : [],
    calendarEvents: Array.isArray(set.calendar_events) ? set.calendar_events : [], calendarDismissed: Array.isArray(set.calendar_dismissed) ? set.calendar_dismissed : [],
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
  // Claude's guesses never overwrite a rule Luis set; his own choices do replace older ones.
  if (by === 'Claude') await insert('rules', [{ pattern: key, category, added_by: by }], { ignore: true, onConflict: 'pattern' });
  else await insert('rules', [{ pattern: key, category, added_by: by }], { upsert: true, onConflict: 'pattern' });
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
