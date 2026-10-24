'use client';
import { useState } from 'react';
import { Sheet, CATS } from './TxSheet';
import { change } from './apply';
import { peso, MONTHS, netExpenses, daysIn, pad } from '../lib/money';

// Spending per month in these categories: the last three full months and this one so far.
function history(data, includes, now) {
  const exp = netExpenses(data);
  return [3, 2, 1, 0].map((back) => {
    const d = new Date(now.y, now.m - 1 - back, 1);
    const pre = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-';
    const amt = exp.filter((t) => t.date.startsWith(pre) && includes.indexOf(t.category) >= 0).reduce((a, t) => a + t.amount, 0);
    return { label: MONTHS[d.getMonth()].slice(0, 3), amount: Math.round(amt), current: back === 0 };
  });
}
const short = (n) => (n >= 1000 ? '₱' + (n / 1000).toFixed(1) + 'k' : peso(n));
const num = (s) => Math.max(0, Math.round(Number(String(s).replace(/[^\d.]/g, '')) || 0));

// What the daily limit becomes if the month's budget total changes by `delta`.
function limitAfter(data, now, delta) {
  const total = (data.budgets || []).reduce((a, b) => a + b.budget, 0);
  const setAside = (data.goalPlan && data.goalPlan.setAside) || 0;
  const n = daysIn(now.y, now.m);
  return [Math.round((total - setAside) / n), Math.round((total + delta - setAside) / n)];
}

function Bars({ months, target }) {
  const max = Math.max(target, ...months.map((x) => x.amount), 1);
  const h = (v) => Math.max(4, Math.round((v / max) * 84));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 18, background: 'rgba(0,0,0,0.35)' }}>
      <div style={{ position: 'relative', height: 90, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, alignItems: 'end' }} aria-hidden="true">
        {target > 0 && <div style={{ position: 'absolute', left: 0, right: 0, bottom: h(target), borderTop: '2px dashed rgba(242,244,248,0.6)' }} />}
        {months.map((x) => <div key={x.label} style={{ height: h(x.amount), borderRadius: '8px 8px 3px 3px', background: x.current ? (x.amount > target ? 'var(--over)' : 'var(--under)') : '#3A4050', transition: 'height 0.25s ease' }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
        {months.map((x) => <span key={x.label} style={x.current ? { fontWeight: 700, color: 'var(--ink)' } : undefined}>{x.label} {short(x.amount)}</span>)}
      </div>
    </div>
  );
}

function Limit({ data, now, delta }) {
  const [a, b] = limitAfter(data, now, delta);
  return (
    <div className="row" style={{ padding: '12px 14px', borderRadius: 16, background: 'rgba(61,220,151,0.1)' }}>
      <span className="small" style={{ color: '#D3D7E0' }}>Daily limit</span>
      <b style={{ fontSize: 15 }}>{a === b ? peso(a) : peso(a) + ' → ' + peso(b)}</b>
    </div>
  );
}

const pick = { minHeight: 40, fontSize: 13 };

export function EditBudget({ data, now, budget, onClose }) {
  const [amt, setAmt] = useState(String(budget.budget));
  const [busy, setBusy] = useState(false);
  const months = history(data, budget.includes, now);
  const full = months.filter((x) => !x.current);
  const avg = Math.round(full.reduce((a, x) => a + x.amount, 0) / full.length);
  const v = num(amt);
  const step = (d) => setAmt(String(Math.max(0, v + d)));
  const run = async (ops, text) => { setBusy(true); const r = await change(ops, text); setBusy(false); if (r.ok) onClose(); };
  const spent = months[3].amount;
  return (
    <Sheet title={budget.name} onClose={onClose}>
      <div className="row"><b style={{ fontSize: 20 }}>{budget.name}</b><span className="small muted">{peso(spent)} spent this month</span></div>
      <div className="row">
        <button className="iconbtn" aria-label="Less" onClick={() => step(-500)} style={{ width: 52, height: 52, fontSize: 24 }}>−</button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <label htmlFor="b-amt" className="small muted" style={{ fontWeight: 700 }}>A month</label>
          <input id="b-amt" inputMode="numeric" value={'₱' + v.toLocaleString('en-US')} onChange={(e) => setAmt(e.target.value)} style={{ width: 190, border: 0, background: 'transparent', color: 'var(--ink)', textAlign: 'center', fontSize: 40, fontWeight: 800, fontFamily: 'inherit' }} />
        </div>
        <button className="iconbtn" aria-label="More" onClick={() => step(500)} style={{ width: 52, height: 52, fontSize: 24 }}>+</button>
      </div>
      <Bars months={months} target={v} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="chip" style={pick} onClick={() => setAmt(String(avg))}>Average {peso(avg)}</button>
        <button className="chip" style={pick} onClick={() => setAmt(String(full[2].amount))}>Last month {peso(full[2].amount)}</button>
        {v !== budget.budget && <button className="chip" style={pick} onClick={() => setAmt(String(budget.budget))}>Was {peso(budget.budget)}</button>}
      </div>
      <Limit data={data} now={now} delta={v - budget.budget} />
      <button className="btn" disabled={busy || v === budget.budget} onClick={() => run([{ op: 'set_budget', name: budget.name, amount: v }], budget.name + ' → ' + peso(v) + ' a month')} style={{ minHeight: 54, background: 'var(--under)', color: '#08281A', fontWeight: 800 }}>Save</button>
      {budget.name !== 'Other' && (data.budgets || []).length > 1 && (
        <button disabled={busy} onClick={() => run([{ op: 'remove_budget', name: budget.name, merge: true }], budget.name + ' deleted · its spending moves to Other')} style={{ minHeight: 44, border: 0, background: 'transparent', color: 'var(--over)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Delete budget</button>
      )}
    </Sheet>
  );
}

export function NewBudget({ data, now, onClose }) {
  const [name, setName] = useState('');
  const [cats, setCats] = useState([]);
  const [amt, setAmt] = useState('');
  const [busy, setBusy] = useState(false);
  const owner = (c) => (data.budgets || []).find((b) => b.includes.indexOf(c) >= 0);
  // Picking one category names the budget after it, until he types a name of his own.
  const toggle = (c) => {
    const next = cats.includes(c) ? cats.filter((x) => x !== c) : cats.concat(c);
    setCats(next);
    if (!name.trim() || CATS.includes(name)) setName(next[0] || '');
  };
  const months = cats.length ? history(data, cats, now) : null;
  const full = months ? months.filter((x) => !x.current) : [];
  const avg = full.length ? Math.round(full.reduce((a, x) => a + x.amount, 0) / full.length) : 0;
  const v = num(amt);
  // A budget can't be left covering nothing.
  const emptied = (data.budgets || []).find((b) => b.includes.length && b.includes.every((c) => cats.includes(c)));
  const exists = (data.budgets || []).some((b) => b.name.toLowerCase() === name.trim().toLowerCase());
  const ok = name.trim() && cats.length && !emptied && !exists;
  const save = async () => { setBusy(true); const r = await change([{ op: 'add_budget', name: name.trim(), amount: v, includes: cats, take: true }], name.trim() + ' budget added'); setBusy(false); if (r.ok) onClose(); };
  return (
    <Sheet title="New budget" onClose={onClose}>
      <b style={{ fontSize: 20 }}>New budget</b>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="nb-name" className="small muted" style={{ fontWeight: 700 }}>Name</label>
        <input id="nb-name" className="input" style={{ minHeight: 48, fontSize: 16 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Entertainment" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="small muted" style={{ fontWeight: 700 }}>Covers</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CATS.map((c) => { const o = owner(c); return <button key={c} className={'chip' + (cats.includes(c) ? ' on' : '')} aria-pressed={cats.includes(c)} onClick={() => toggle(c)}>{c}{cats.includes(c) && o ? ' · from ' + o.name : ''}</button>; })}
        </div>
        {emptied && <span className="small" style={{ color: 'var(--over)' }}>That would leave {emptied.name} with nothing. Delete it instead.</span>}
        {exists && <span className="small" style={{ color: 'var(--over)' }}>There's already a budget called that.</span>}
      </div>
      {months && <Bars months={months} target={v} />}
      <div className="row">
        <label htmlFor="nb-amt" className="small muted" style={{ fontWeight: 700 }}>A month</label>
        <input id="nb-amt" inputMode="numeric" value={amt === '' ? '' : '₱' + v.toLocaleString('en-US')} placeholder="₱0" onChange={(e) => setAmt(e.target.value)} style={{ width: 160, border: 0, background: 'transparent', color: 'var(--ink)', textAlign: 'right', fontSize: 32, fontWeight: 800, fontFamily: 'inherit' }} />
      </div>
      {months && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="chip" style={pick} onClick={() => setAmt(String(avg))}>Average {peso(avg)}</button>
          <button className="chip" style={pick} onClick={() => setAmt(String(months[3].amount))}>This month {peso(months[3].amount)}</button>
        </div>
      )}
      <Limit data={data} now={now} delta={v} />
      <button className="btn" disabled={busy || !ok} onClick={save} style={{ minHeight: 54, background: 'var(--under)', color: '#08281A', fontWeight: 800 }}>Add budget</button>
    </Sheet>
  );
}
