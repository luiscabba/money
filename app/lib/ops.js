// Applies confirmed changes from the app and Ask Money. Each op is checked before it touches the database,
// and returns what undoing it needs. Ported from the Apps Script's applyOps_.
import { select, insert, update, remove, eq } from './db';
import { CATEGORIES, ACCOUNTS, newId, parseWhen } from './core';
import { addRule } from './store';
import { recordBalance } from './balances';

const QUOTES = { SPYL: 'LON:SPYL', GOOGL: 'NASDAQ:GOOGL', MSFT: 'NASDAQ:MSFT', AMZN: 'NASDAQ:AMZN', AAPL: 'NASDAQ:AAPL', NVDA: 'NASDAQ:NVDA', ETH: 'CURRENCY:ETHUSD', BTC: 'CURRENCY:BTCUSD' };
const TX_COLS = ['ts', 'type', 'amount', 'merchant', 'category', 'source', 'ref', 'review', 'note', 'goal_id'];
// What undo may put back: table -> [key column, columns allowed].
const RESTORE = {
  transactions: ['n', TX_COLS],
  budgets: ['name', ['monthly']],
  owed: ['id', ['status', 'settled_at', 'match_row']],
  plans: ['id', ['status']],
  gaps: ['id', ['status']],
  notes: ['id', ['note']],
  goals: ['id', ['name', 'price', 'target_date', 'priority', 'status', 'closed_at', 'bought_row']],
  settings: ['key', ['value']]
};

export async function getTx(n) {
  const r = Number(n);
  if (!(r >= 2)) throw 'bad row';
  const rows = await select('transactions', eq('n', r));
  if (!rows[0]) throw 'bad row';
  return rows[0];
}

export async function addTx(tx) {
  const row = {
    ts: (tx.date instanceof Date ? tx.date : parseWhen(tx.date)).toISOString(), type: tx.type, amount: Math.round(Number(tx.amount) * 100) / 100,
    merchant: String(tx.merchant || ''), category: tx.category || '', source: tx.source || '', ref: tx.ref || '',
    review: !!(tx.review || tx.category === 'Other'), note: tx.note || ''
  };
  const [saved] = await insert('transactions', [row]);
  return Number(saved.n);
}

const patchTx = (n, patch) => update('transactions', eq('n', n), patch);
const pick = (row, cols) => Object.fromEntries(cols.map((c) => [c, row[c]]));
const restoreOf = (table, row) => ({ op: 'restore', table, key: row[RESTORE[table][0]], values: pick(row, RESTORE[table][1]) });
const voidUndo = (n) => ({ op: 'restore', table: 'transactions', key: n, values: { type: 'Void', review: false } });

function when(s) {
  const d = s ? parseWhen(s) : new Date();
  return isNaN(d) ? null : d;
}

// The review list's category picker: a category, or "Transfer" for not spending.
export async function categorize(n, category, remember) {
  if (CATEGORIES.indexOf(category) < 0 && category !== 'Transfer') throw 'bad request';
  const t = await getTx(n);
  const patch = { category, review: false };
  if (category === 'Transfer') patch.type = /In|Income|Refund/.test(t.type) ? 'Transfer In' : 'Transfer Out';
  await patchTx(t.n, patch);
  if (remember) await addRule(t.merchant, category, 'Luis');
  return [restoreOf('transactions', t)];
}

async function one(o) {
  const op = o.op;
  if (op === 'recategorize') {
    if (CATEGORIES.indexOf(o.category) < 0) throw 'bad row or category';
    const t = await getTx(o.row);
    const patch = { category: o.category, review: false };
    if (t.type !== 'Expense' && o.asExpense) patch.type = 'Expense';
    await patchTx(t.n, patch);
    if (o.remember) await addRule(t.merchant, o.category, 'Luis');
    return [restoreOf('transactions', t)];
  }
  if (op === 'mark_transfer') {
    const t = await getTx(o.row);
    const patch = { type: /In|Income|Refund/.test(t.type) ? 'Transfer In' : 'Transfer Out', category: 'Transfer', review: false };
    if (o.note) patch.merchant = String(o.note).slice(0, 80);
    await patchTx(t.n, patch);
    if (o.remember) await addRule(t.merchant, 'Transfer', 'Luis');
    return [restoreOf('transactions', t)];
  }
  if (op === 'set_budget') {
    const b = await select('budgets', eq('name', o.name));
    if (!b[0]) throw 'unknown budget';
    await update('budgets', eq('name', o.name), { monthly: Math.max(0, Number(o.amount) || 0) });
    return [restoreOf('budgets', b[0])];
  }
  if (op === 'add_expense') {
    const amt = Number(o.amount);
    if (!(amt > 0) || CATEGORIES.indexOf(o.category) < 0) throw 'bad amount or category';
    const n = await addTx({ date: when(o.date) || new Date(), type: 'Expense', amount: amt, merchant: String(o.merchant || 'Cash').slice(0, 60), category: o.category, source: o.source || 'Cash', ref: 'ask-' + newId(), note: o.note ? String(o.note).slice(0, 120) : '' });
    return [voidUndo(n)];
  }
  if (op === 'add_owed') {
    const amt = Number(o.amount);
    if (!(amt > 0) || !o.who) throw 'need who and amount';
    const id = newId();
    await insert('owed', [{ id, who: String(o.who).slice(0, 40), amount: amt, purpose: String(o.for || '').slice(0, 80), status: 'open' }]);
    const undo = [{ op: 'restore', table: 'owed', key: id, values: { status: 'removed' } }];
    if (o.row) undo.push(...(await one({ op: 'mark_transfer', row: o.row })));
    return undo;
  }
  if (op === 'settle_owed') {
    const ow = await select('owed', eq('id', o.id));
    if (!ow[0]) throw 'unknown IOU';
    const undo = [restoreOf('owed', ow[0])];
    let match = null;
    if (o.row) {
      const t = await getTx(o.row);
      undo.push(restoreOf('transactions', t));
      await patchTx(t.n, { type: 'Transfer In', category: 'Transfer', review: false });
      match = t.n;
    }
    await update('owed', eq('id', o.id), { status: 'settled', settled_at: new Date().toISOString(), match_row: match });
    return undo;
  }
  if (op === 'add_plan') {
    const amt = Number(o.amount);
    if (!(amt > 0) || !o.what) throw 'need what and amount';
    const id = newId();
    const due = /^\d{4}-\d\d-\d\d/.test(String(o.date || '')) ? String(o.date).slice(0, 10) : null;
    await insert('plans', [{ id, what: String(o.what).slice(0, 60), amount: amt, due, status: 'planned' }]);
    return [{ op: 'restore', table: 'plans', key: id, values: { status: 'removed' } }];
  }
  if (op === 'remove_plan') {
    const p = await select('plans', eq('id', o.id));
    if (!p[0]) throw 'unknown plan';
    await update('plans', eq('id', o.id), { status: 'removed' });
    return [restoreOf('plans', p[0])];
  }
  if (op === 'set_balance') {
    if (ACCOUNTS.indexOf(o.account) < 0 || !(Number(o.amount) >= 0)) throw 'need account and amount';
    await recordBalance(o.account, Number(o.amount), new Date(), 'told Ask Money');
    return [];
  }
  if (op === 'set_holding') {
    await setHolding(o);
    return [];
  }
  if (op === 'resolve_gap') {
    const g = await select('gaps', eq('id', o.id));
    if (!g[0]) throw 'unknown gap';
    await update('gaps', eq('id', o.id), { status: 'resolved' });
    return [restoreOf('gaps', g[0])];
  }
  if (op === 'rename') {
    // A nickname for a merchant or person, shown everywhere instead of the raw text. Empty name clears it.
    const raw = String(o.merchant || '').trim();
    if (!raw) throw 'need merchant';
    const key = raw.toLowerCase();
    const before = await select('names', eq('merchant', key));
    const name = String(o.name || '').slice(0, 40);
    if (name) await insert('names', [{ merchant: key, nickname: name }], { upsert: true, onConflict: 'merchant' });
    else await remove('names', eq('merchant', key));
    return [{ op: 'rename', merchant: raw, name: before[0] ? before[0].nickname : '' }];
  }
  if (op === 'set_note') {
    const t = await getTx(o.row);
    await patchTx(t.n, { note: String(o.note || '').slice(0, 120) });
    return [restoreOf('transactions', t)];
  }
  if (op === 'edit_tx') {
    // Fix a wrong amount, date, wallet or merchant on one row.
    const t = await getTx(o.row);
    const patch = {};
    if (o.amount !== undefined) { const a = Number(o.amount); if (!(a > 0)) throw 'bad amount'; patch.amount = a; }
    if (o.date) { const d = when(o.date); if (!d) throw 'bad date'; patch.ts = d.toISOString(); }
    if (o.source) patch.source = String(o.source).slice(0, 30);
    if (o.merchant) patch.merchant = String(o.merchant).slice(0, 60);
    if (Object.keys(patch).length) await patchTx(t.n, patch);
    return [restoreOf('transactions', t)];
  }
  if (op === 'void') {
    // Removes a duplicate or mistaken row from every total; the row stays, marked Void.
    const t = await getTx(o.row);
    await patchTx(t.n, { type: 'Void', review: false });
    return [restoreOf('transactions', t)];
  }
  if (op === 'split') {
    // One payment, several categories: the row keeps the first part, the rest become new rows.
    const t = await getTx(o.row);
    const parts = (o.parts || []).filter((x) => Number(x.amount) > 0 && CATEGORIES.indexOf(x.category) >= 0);
    if (parts.length < 2) throw 'need two parts';
    const sum = parts.reduce((a, x) => a + Number(x.amount), 0);
    if (Math.abs(sum - Number(t.amount)) > 0.5) throw 'parts must add up to ' + Number(t.amount);
    const undo = [restoreOf('transactions', t)];
    const patch = { amount: Number(parts[0].amount), category: parts[0].category, review: false };
    if (parts[0].note) patch.note = String(parts[0].note).slice(0, 120);
    await patchTx(t.n, patch);
    const id = newId();
    for (const x of parts.slice(1)) {
      const n = await addTx({ date: new Date(t.ts), type: 'Expense', amount: Number(x.amount), merchant: String(x.merchant || t.merchant).slice(0, 60), category: x.category, source: t.source, ref: 'split-' + id, note: x.note ? String(x.note).slice(0, 120) : '' });
      undo.push(voidUndo(n));
    }
    return undo;
  }
  if (op === 'remember') {
    // A standing note for Ask Money ("the 500s to GCash are me moving money").
    const text = String(o.text || '').trim().slice(0, 200);
    if (!text) throw 'need text';
    const id = newId();
    await insert('notes', [{ id, note: text }]);
    return [{ op: 'restore', table: 'notes', key: id, values: { note: '' } }];
  }
  if (op === 'forget') {
    const nt = await select('notes', eq('id', o.id));
    if (!nt[0]) throw 'unknown note';
    await update('notes', eq('id', o.id), { note: '' });
    return [restoreOf('notes', nt[0])];
  }
  if (op === 'goal_add') {
    const price = Number(o.price);
    const name = String(o.name || '').trim().slice(0, 40);
    if (!name || !(price > 0)) throw 'need a name and price';
    const date = goalDate(o.date);
    const last = await select('goals', 'select=priority&status=eq.active&order=priority.desc&limit=1');
    const [g] = await insert('goals', [{ name, price, target_date: date, priority: last[0] ? last[0].priority + 1 : 0 }]);
    return [{ op: 'restore', table: 'goals', key: g.id, values: { status: 'archived' } }];
  }
  if (op === 'goal_move') {
    // Money toward a goal (or back out of it, with a negative amount). It stays in Maya; this only tags it.
    const amt = Math.round(Number(o.amount) * 100) / 100;
    const g = await goalOf(o.id);
    if (!amt) throw 'need an amount';
    if (amt < 0) {
      const have = (await select('goal_moves', eq('goal_id', g.id) + '&select=amount')).reduce((a, m) => a + Number(m.amount), 0);
      if (have + amt < -0.005) throw 'only ' + Math.round(have) + ' in ' + g.name;
    }
    const kind = ['sweep', 'transfer', 'moni', 'manual'].includes(o.kind) ? o.kind : 'manual';
    const [mv] = await insert('goal_moves', [{ goal_id: g.id, amount: amt, kind, tx_row: o.row ? Number(o.row) : null, note: String(o.note || '').slice(0, 80) }]);
    return [{ op: 'goal_unmove', id: Number(mv.id) }];
  }
  if (op === 'goal_unmove') {
    const done = await remove('goal_moves', eq('id', Number(o.id)));
    if (!done.length) throw 'nothing to undo';
    return [];
  }
  if (op === 'goal_edit') {
    const g = await goalOf(o.id);
    const patch = {};
    if (o.name !== undefined) { const n = String(o.name).trim().slice(0, 40); if (!n) throw 'need a name'; patch.name = n; }
    if (o.price !== undefined) { const p = Number(o.price); if (!(p > 0)) throw 'bad price'; patch.price = p; }
    if (o.date !== undefined) patch.target_date = goalDate(o.date);
    if (!Object.keys(patch).length) throw 'nothing to change';
    await update('goals', eq('id', g.id), patch);
    return [restoreOf('goals', g)];
  }
  if (op === 'goal_order') {
    // ids in the new priority order, first is funded first.
    const ids = (o.ids || []).map(String);
    const gs = await select('goals', 'status=eq.active');
    if (!ids.length || ids.some((id) => !gs.find((g) => g.id === id))) throw 'unknown goal';
    for (let i = 0; i < ids.length; i++) await update('goals', eq('id', ids[i]), { priority: i });
    return gs.map((g) => restoreOf('goals', g));
  }
  if (op === 'goal_remove') {
    const g = await goalOf(o.id);
    await update('goals', eq('id', g.id), { status: 'archived', closed_at: new Date().toISOString() });
    return [restoreOf('goals', g)];
  }
  if (op === 'goal_sweep') {
    // The week's leftover into one or more goals: moves [{ id, amount }].
    const before = await select('settings', eq('key', 'goal_sweep_pending'));
    const pend = before[0] ? before[0].value : {};
    const parts = (o.moves || []).filter((x) => Number(x.amount) > 0);
    const total = parts.reduce((a, x) => a + Number(x.amount), 0);
    if (!parts.length) throw 'nothing to move';
    if (!pend.amount || total > pend.amount + 0.5) throw 'more than the leftover';
    const undo = [{ op: 'restore', table: 'settings', key: 'goal_sweep_pending', values: { value: pend } }];
    for (const x of parts) {
      const g = await goalOf(x.id);
      const [mv] = await insert('goal_moves', [{ goal_id: g.id, amount: Math.round(Number(x.amount) * 100) / 100, kind: 'sweep', note: 'week of ' + (pend.week || '') }]);
      undo.push({ op: 'goal_unmove', id: Number(mv.id) });
    }
    await update('settings', eq('key', 'goal_sweep_pending'), { value: {} });
    return undo;
  }
  if (op === 'goal_sweep_keep') {
    const before = await select('settings', eq('key', 'goal_sweep_pending'));
    if (!before[0] || !before[0].value.amount) throw 'nothing to keep';
    await update('settings', eq('key', 'goal_sweep_pending'), { value: {} });
    return [{ op: 'restore', table: 'settings', key: 'goal_sweep_pending', values: { value: before[0].value } }];
  }
  if (op === 'goal_buy') {
    // Pay a purchase from a goal: it leaves the budget, the goal closes, any leftover goes to the next goal.
    const g = await goalOf(o.id);
    const t = await getTx(o.row);
    if (t.type !== 'Expense' || t.goal_id) throw 'not a purchase';
    const have = (await select('goal_moves', eq('goal_id', g.id) + '&select=amount')).reduce((a, m) => a + Number(m.amount), 0);
    const amt = Number(t.amount);
    if (amt > have + 0.5) throw 'only ' + Math.round(have) + ' saved for ' + g.name;
    const undo = [restoreOf('transactions', t), restoreOf('goals', g)];
    await patchTx(t.n, { goal_id: g.id, review: false });
    const [paid] = await insert('goal_moves', [{ goal_id: g.id, amount: -amt, kind: 'purchase', tx_row: t.n, note: t.merchant }]);
    undo.push({ op: 'goal_unmove', id: Number(paid.id) });
    const rest = Math.round((have - amt) * 100) / 100;
    const next = (await select('goals', 'status=eq.active&id=neq.' + encodeURIComponent(g.id) + '&order=priority,created_at&limit=1'))[0];
    if (rest >= 1 && next) {
      const mv = await insert('goal_moves', [
        { goal_id: g.id, amount: -rest, kind: 'leftover', note: 'to ' + next.name },
        { goal_id: next.id, amount: rest, kind: 'leftover', note: 'from ' + g.name }
      ]);
      mv.forEach((m) => undo.push({ op: 'goal_unmove', id: Number(m.id) }));
    }
    await update('goals', eq('id', g.id), { status: 'done', closed_at: new Date().toISOString(), bought_row: t.n });
    const pend = await select('settings', eq('key', 'goal_matches'));
    if (pend[0] && Array.isArray(pend[0].value)) {
      undo.push({ op: 'restore', table: 'settings', key: 'goal_matches', values: { value: pend[0].value } });
      await update('settings', eq('key', 'goal_matches'), { value: pend[0].value.filter((m) => Number(m.row) !== t.n) });
    }
    return undo;
  }
  if (op === 'goal_match_dismiss') {
    const pend = await select('settings', eq('key', 'goal_matches'));
    if (!pend[0] || !Array.isArray(pend[0].value)) throw 'nothing to dismiss';
    await update('settings', eq('key', 'goal_matches'), { value: pend[0].value.filter((m) => Number(m.row) !== Number(o.row)) });
    return [{ op: 'restore', table: 'settings', key: 'goal_matches', values: { value: pend[0].value } }];
  }
  if (op === 'goal_cap') {
    const cap = Math.round(Number(o.amount));
    if (!(cap >= 0)) throw 'bad cap';
    const before = await select('settings', eq('key', 'goal_cap'));
    await insert('settings', [{ key: 'goal_cap', value: cap, updated_at: new Date().toISOString() }], { upsert: true, onConflict: 'key' });
    return [{ op: 'restore', table: 'settings', key: 'goal_cap', values: { value: before[0] ? before[0].value : 8000 } }];
  }
  if (op === 'restore') {
    // Undo: puts back values captured before a change. Only the app's own tables and columns.
    const spec = RESTORE[o.table];
    if (!spec || o.key === undefined || o.key === null || !o.values) throw 'not allowed';
    const patch = pick(o.values, spec[1].filter((c) => c in o.values));
    if (!Object.keys(patch).length) throw 'bad restore';
    const done = await update(o.table, eq(spec[0], o.key), patch);
    if (!done.length) throw 'nothing to restore';
    return [];
  }
  throw 'unknown op';
}

async function goalOf(id) {
  const g = await select('goals', eq('id', String(id || '')) + '&status=eq.active');
  if (!g[0]) throw 'unknown goal';
  return g[0];
}

// "2027-04-30", "2027-04" (end of that month), or empty for no date.
function goalDate(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  if (/^\d{4}-\d\d-\d\d$/.test(t)) return t;
  if (/^\d{4}-\d\d$/.test(t)) { const [y, m] = t.split('-').map(Number); return t + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0'); }
  throw 'bad date';
}

export async function setHolding(o) {
  const sym = String(o.symbol || '').toUpperCase().trim();
  if (!sym) throw 'need symbol';
  const qty = Number(o.quantity);
  if (!(qty >= 0)) throw 'need quantity';
  if (qty === 0) { await remove('holdings', eq('symbol', sym)); return; }
  const sleeve = o.sleeve || (sym === 'SPYL' ? 'Beta' : sym === 'CASH' ? 'Cash' : /^(ETH|BTC)$/.test(sym) ? 'Asymmetric' : 'Alpha');
  const row = { symbol: sym, sleeve, quantity: qty, avg_cost: sym === 'CASH' ? 1 : Number(o.avgCost) || 0, quote: sym === 'CASH' ? '' : (o.quote || QUOTES[sym] || sym), updated_at: new Date().toISOString() };
  await insert('holdings', [row], { upsert: true, onConflict: 'symbol' });
}

export async function applyOps(ops, actor = 'app') {
  const results = [];
  for (const o of ops || []) {
    try {
      const undo = await one(o);
      results.push({ ok: true, undo });
      await insert('changes', [{ actor, op: o, undo }]).catch(() => null);
    } catch (err) {
      results.push({ ok: false, error: String(err && err.message ? err.message : err) });
    }
  }
  return results;
}
