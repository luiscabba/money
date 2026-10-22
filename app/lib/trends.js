// Week-on-week and month-on-month comparisons. Weeks start Monday.
import { dayKey, daysIn, allowanceFor, netExpenses } from './money';

const DAY = 86400000;
const keyOf = (dt) => dayKey(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const label = (dt) => SHORT[dt.getMonth()] + ' ' + dt.getDate();

function expenses(data) {
  return netExpenses(data);
}

function byDay(data) {
  const m = {};
  expenses(data).forEach((t) => { const k = t.date.slice(0, 10); m[k] = (m[k] || 0) + t.amount; });
  return m;
}

function between(data, a, b) {
  const ka = keyOf(a), kb = keyOf(b);
  return expenses(data).filter((t) => { const k = t.date.slice(0, 10); return k >= ka && k <= kb; });
}

const total = (xs) => xs.reduce((s, t) => s + t.amount, 0);

export function pct(cur, prev) {
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

function mondayOf(dt) {
  const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  return new Date(d.getTime() - ((d.getDay() + 6) % 7) * DAY);
}

export function movers(data, a, b, pa, pb, n = 3) {
  const cur = {}, prev = {};
  between(data, a, b).forEach((t) => { cur[t.category] = (cur[t.category] || 0) + t.amount; });
  between(data, pa, pb).forEach((t) => { prev[t.category] = (prev[t.category] || 0) + t.amount; });
  const cats = Object.keys({ ...cur, ...prev });
  return cats
    .map((c) => ({ name: c, cur: cur[c] || 0, prev: prev[c] || 0, change: (cur[c] || 0) - (prev[c] || 0), pct: pct(cur[c] || 0, prev[c] || 0) }))
    .filter((m) => Math.abs(m.change) >= 1)
    .sort((x, y) => Math.abs(y.change) - Math.abs(x.change))
    .slice(0, n);
}

export function weekTrend(data, now) {
  const today = new Date(now.y, now.m - 1, now.d);
  const mon = mondayOf(today);
  const elapsed = Math.round((today - mon) / DAY);
  const pMon = new Date(mon.getTime() - 7 * DAY);
  const pSame = new Date(pMon.getTime() + elapsed * DAY);
  const days = byDay(data);
  const sumRange = (a, b) => { let s = 0; for (let t = a.getTime(); t <= b.getTime(); t += DAY) s += days[keyOf(new Date(t))] || 0; return s; };
  const cur = sumRange(mon, today), prev = sumRange(pMon, pSame);
  const bars = [];
  for (let k = 7; k >= 0; k--) {
    const a = new Date(mon.getTime() - k * 7 * DAY);
    const b = k === 0 ? today : new Date(a.getTime() + 6 * DAY);
    bars.push({ label: k === 0 ? 'Now' : label(a), value: sumRange(a, b), current: k === 0 });
  }
  return { cur, prev, pct: pct(cur, prev), bars, movers: movers(data, mon, today, pMon, pSame, 5), note: 'Mon to ' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][elapsed] + ', same days last week' };
}

export function monthTrend(data, now) {
  const a = new Date(now.y, now.m - 1, 1), b = new Date(now.y, now.m - 1, now.d);
  const pa = new Date(now.y, now.m - 2, 1);
  const pb = new Date(pa.getFullYear(), pa.getMonth(), Math.min(now.d, daysIn(pa.getFullYear(), pa.getMonth() + 1)));
  const cur = total(between(data, a, b)), prev = total(between(data, pa, pb));
  const bars = [];
  for (let k = 5; k >= 0; k--) {
    const s = new Date(now.y, now.m - 1 - k, 1);
    const e = k === 0 ? b : new Date(s.getFullYear(), s.getMonth(), daysIn(s.getFullYear(), s.getMonth() + 1));
    bars.push({ label: SHORT[s.getMonth()], value: total(between(data, s, e)), current: k === 0 });
  }
  return { cur, prev, pct: pct(cur, prev), bars, movers: movers(data, a, b, pa, pb, 5), prevName: SHORT[pa.getMonth()], note: 'Day ' + now.d + ' compared with day ' + pb.getDate() + ' of ' + SHORT[pa.getMonth()] };
}

// Last full week (Mon to Sun) against the week before it.
export function weekRecap(data, now) {
  const today = new Date(now.y, now.m - 1, now.d);
  const a = new Date(mondayOf(today).getTime() - 7 * DAY), b = new Date(a.getTime() + 6 * DAY);
  const pa = new Date(a.getTime() - 7 * DAY), pb = new Date(a.getTime() - DAY);
  const tx = between(data, a, b);
  const cur = total(tx), prev = total(between(data, pa, pb));
  const days = byDay(data);
  const week = [];
  let under = 0, zero = [];
  for (let k = 0; k < 7; k++) {
    const d = new Date(a.getTime() + k * DAY);
    const s = days[keyOf(d)] || 0;
    const allow = allowanceFor(data, d.getFullYear(), d.getMonth() + 1);
    if (s <= allow) under++;
    if (s === 0) zero.push(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][k]);
    week.push({ l: 'MTWTFSS'[k], spent: s, allow });
  }
  const up = movers(data, a, b, pa, pb, 10).filter((m) => m.change > 0)[0] || null;
  let top = [];
  if (up) {
    const by = {};
    tx.filter((t) => t.category === up.name).forEach((t) => { by[t.merchant] = (by[t.merchant] || 0) + t.amount; });
    top = Object.entries(by).sort((x, y) => y[1] - x[1]).slice(0, 3);
  }
  return { range: label(a) + ' to ' + label(b), cur, prev, pct: pct(cur, prev), ratio: prev ? cur / prev : null, week, under, zero, up, top, month: monthTrend(data, now) };
}

// Running totals day by day: this period so far against all of the previous one.
export function paceLines(data, now, mode) {
  const days = byDay(data);
  const run = (start, n) => { let s = 0; const out = []; for (let k = 0; k < n; k++) { s += days[keyOf(new Date(start.getTime() + k * DAY))] || 0; out.push(s); } return out; };
  const today = new Date(now.y, now.m - 1, now.d);
  if (mode === 'week') {
    const mon = mondayOf(today);
    const elapsed = Math.round((today - mon) / DAY) + 1;
    return { now: run(mon, elapsed), prev: run(new Date(mon.getTime() - 7 * DAY), 7), ticks: ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => [i, l]) };
  }
  const pStart = new Date(now.y, now.m - 2, 1);
  const pn = daysIn(pStart.getFullYear(), pStart.getMonth() + 1);
  return { now: run(new Date(now.y, now.m - 1, 1), now.d), prev: run(pStart, pn), ticks: [[0, '1'], [9, '10'], [19, '20'], [pn - 1, String(pn)]] };
}
