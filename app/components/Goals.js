'use client';
import { useMemo, useState } from 'react';
import { peso, totalBudget, daysIn } from '../lib/money';
import { goalPlan, behindBy } from '../lib/goals';
import { change } from './apply';

const GOAL = '#C38BFF';
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (k) => { if (!k) return ''; const [y, m] = k.split('-').map(Number); return SHORT[m - 1] + ' ' + y; };
const dateLabel = (d) => { const [y, m, day] = d.split('-').map(Number); return SHORT[m - 1] + ' ' + day + (y !== new Date().getFullYear() ? ', ' + y : ''); };
const addMonths = (now, n) => { const d = new Date(now.y, now.m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };

function Bar({ pct, h = 8, color = GOAL }) {
  return (
    <div aria-hidden="true" style={{ height: h, borderRadius: h / 2, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: Math.round(Math.min(1, pct) * 1000) / 10 + '%', borderRadius: h / 2, background: color, transition: 'width 0.5s ease' }} />
    </div>
  );
}

function Pill({ g }) {
  const [c, bg, t] = g.status === 'overcap' ? ['#FFB27D', 'rgba(255,138,61,0.18)', 'Hits the cap']
    : g.status === 'funded' ? ['var(--bg)', GOAL, 'Ready']
    : g.status === 'nodate' ? ['var(--muted)', 'rgba(255,255,255,0.1)', 'No date']
    : g.behind > 0 ? ['#FFB27D', 'rgba(255,138,61,0.18)', peso(g.behind) + ' behind']
    : ['var(--under)', 'rgba(61,220,151,0.16)', 'On track'];
  return <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 800, color: c, background: bg, whiteSpace: 'nowrap' }}>{t}</span>;
}

export default function Goals({ data, now }) {
  const [view, setView] = useState('list');
  const plan = data.goalPlan;
  if (!plan) return <div className="small muted">Goals need the database switched on.</div>;
  const rows = plan.goals.map((g) => ({ ...g, behind: g.dated ? behindBy(g, g.saved, now) : 0 }));
  const open = rows.find((g) => g.id === view);
  if (view === 'new') return <NewGoal data={data} now={now} onDone={() => setView('list')} />;
  if (open) return <GoalDetail g={open} data={data} now={now} onBack={() => setView('list')} />;

  const maya = (data.netWorth.accounts.find((a) => a.name === 'Maya') || {}).php || 0;
  const move = async (i) => {
    const ids = rows.map((g) => g.id);
    [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
    await change([{ op: 'goal_order', ids }], 'Moved ' + rows[i].name + ' up');
  };
  return (
    <>
      <div className="glass card strong" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row" style={{ fontSize: 14, fontWeight: 700 }}><span>Maya</span><span>{peso(maya)}</span></div>
        <div aria-hidden="true" style={{ display: 'flex', gap: 3, height: 10 }}>
          <div style={{ flexGrow: plan.tagged, flexBasis: 0, borderRadius: 5, background: GOAL, minWidth: plan.tagged ? 4 : 0 }} />
          <div style={{ flexGrow: Math.max(0, maya - plan.tagged), flexBasis: 0, borderRadius: 5, background: 'rgba(255,255,255,0.14)' }} />
        </div>
        <div className="row" style={{ fontSize: 12, color: 'var(--muted)' }}>
          <span><b style={{ color: GOAL }}>{peso(plan.tagged)}</b> for goals</span>
          <span>{peso(plan.setAside)} a month · cap {peso(plan.cap)}</span>
        </div>
        {plan.short > 0 && <div className="small" style={{ color: 'var(--over)' }}>Maya is {peso(plan.short)} short of what's tagged.</div>}
      </div>

      {rows.length === 0 && <div className="small muted" style={{ padding: '8px 4px' }}>No goals yet.</div>}
      {rows.map((g, i) => (
        <div key={g.id} className="glass card rise" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '14px 14px 14px 10px', borderRadius: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ width: 28, height: 28, borderRadius: 14, background: 'rgba(195,139,255,0.2)', color: GOAL, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            {i > 0 && (
              <button onClick={() => move(i)} aria-label={'Move ' + g.name + ' up'} style={{ width: 32, height: 32, border: 0, borderRadius: 16, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 9l4-4 4 4" fill="none" stroke="#B4BAC6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            )}
          </div>
          <button onClick={() => setView(g.id)} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8, border: 0, background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
            <span className="row"><span style={{ fontSize: 16, fontWeight: 800, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span><Pill g={g} /></span>
            <Bar pct={g.pct} />
            <span className="row" style={{ fontSize: 12, color: 'var(--muted)' }}>
              <span>{peso(g.saved)} of {peso(g.price)}</span>
              <span>{g.dated ? peso(g.setAside) + '/mo · ' + dateLabel(g.target) : g.eta ? 'About ' + monthLabel(g.eta) : 'Weekly leftovers'}</span>
            </span>
          </button>
        </div>
      ))}
      <button className="btn" onClick={() => setView('new')}>New goal</button>
    </>
  );
}

function NewGoal({ data, now, onDone }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [months, setMonths] = useState(6);
  const [busy, setBusy] = useState(false);
  const p = Number(String(price).replace(/[^\d.]/g, '')) || 0;
  const target = months ? addMonths(now, months - 1) : '';
  // The daily limit now and with this goal added, using the same math as everything else.
  const days = daysIn(now.y, now.m);
  const total = totalBudget(data);
  const before = Math.round((total - data.goalPlan.setAside) / days);
  const after = useMemo(() => {
    if (!p || !months) return before;
    const g = { id: 'new', name, price: p, target: target + '-28', priority: 1e6, status: 'active' };
    const pl = goalPlan({ goals: data.goals.concat([g]), moves: data.goalMoves, now, cap: data.goalPlan.cap });
    return Math.round((total - pl.setAside) / days);
  }, [p, months, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const monthly = months && p ? p / months : 0;
  const save = async () => {
    setBusy(true);
    const r = await change([{ op: 'goal_add', name, price: p, date: target }], 'Started ' + name);
    setBusy(false);
    if (r.ok) onDone();
  };
  return (
    <>
      <button onClick={onDone} className="chip" style={{ alignSelf: 'flex-start' }}>Back</button>
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ flex: 3, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="small muted" style={{ fontWeight: 700 }}>Item</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        <label style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="small muted" style={{ fontWeight: 700 }}>Price</span>
          <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="small muted" style={{ fontWeight: 700 }}>Buy it in</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {[[3, '3 mo'], [6, '6 mo'], [12, '12 mo'], [0, 'No date']].map(([m, l]) => (
            <button key={m} onClick={() => setMonths(m)} aria-pressed={m === months} className="chip" style={{ flex: 1, ...(m === months ? { background: GOAL, borderColor: GOAL, color: 'var(--bg)' } : {}) }}>{l}</button>
          ))}
        </div>
      </div>
      <div className="glass card strong" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div><div style={{ fontSize: 32, fontWeight: 800, color: GOAL }}>{peso(monthly)}</div><div className="small muted">a month</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 16, fontWeight: 800 }}>{months ? monthLabel(target) : 'Leftovers only'}</div><div className="small muted">ready</div></div>
        </div>
        <div className="row small"><span className="muted">Daily limit</span><b>{peso(before)} → {peso(after)}</b></div>
        <div aria-hidden="true" style={{ display: 'flex', gap: 3, height: 12 }}>
          <div style={{ flexGrow: Math.max(0, after), flexBasis: 0, borderRadius: 6, background: 'var(--under)' }} />
          {before > after && <div style={{ flexGrow: before - after, flexBasis: 0, borderRadius: 6, background: GOAL }} />}
        </div>
      </div>
      <button className="btn" disabled={busy || !name.trim() || !p} onClick={save} style={{ opacity: !name.trim() || !p ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Start goal'}</button>
    </>
  );
}

function GoalDetail({ g, data, now, onBack }) {
  const [amt, setAmt] = useState('');
  const [busy, setBusy] = useState(false);
  const moves = (data.goalMoves || []).filter((m) => m.goal === g.id);
  const run = async (ops, text) => { setBusy(true); const r = await change(ops, text); setBusy(false); return r; };
  const add = async (sign) => {
    const a = Number(String(amt).replace(/[^\d.]/g, ''));
    if (!(a > 0)) return;
    const r = await run([{ op: 'goal_move', id: g.id, amount: sign * a, kind: 'manual' }], (sign > 0 ? 'Added ' : 'Took out ') + peso(a));
    if (r.ok) setAmt('');
  };
  // Last three months in, this month included.
  const bars = [2, 1, 0].map((back) => {
    const d = new Date(now.y, now.m - 1 - back, 1);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    return { m: SHORT[d.getMonth()], v: moves.filter((x) => x.at.startsWith(key) && x.amount > 0 && x.kind !== 'purchase').reduce((a, x) => a + x.amount, 0) };
  });
  const top = Math.max(1, ...bars.map((b) => b.v));
  return (
    <>
      <div className="row">
        <button onClick={onBack} className="chip">Back</button>
        <button onClick={async () => { const r = await run([{ op: 'goal_remove', id: g.id }], 'Removed ' + g.name); if (r.ok) onBack(); }} className="chip" disabled={busy}>Remove</button>
      </div>
      <div className="glass card strong" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row"><span style={{ fontSize: 20, fontWeight: 800 }}>{g.name}</span><Pill g={g} /></div>
        <div className="row" style={{ alignItems: 'baseline' }}>
          <span style={{ fontSize: 30, fontWeight: 800 }}>{peso(g.saved)}</span>
          <span className="small muted">of {peso(g.price)}{g.dated ? ' · ' + dateLabel(g.target) : ''}</span>
        </div>
        <Bar pct={g.pct} h={12} />
        {g.dated && g.thisMonth && (
          <div className="row small"><span className="muted">This month</span><b>{peso(g.thisMonth.in)} of {peso(g.thisMonth.due)}</b></div>
        )}
        {!g.dated && (
          <div className="row small"><span className="muted">Ready around</span><b style={{ color: GOAL }}>{g.eta ? monthLabel(g.eta) : 'Add money to see'}</b></div>
        )}
      </div>

      {g.status === 'overcap' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, borderRadius: 24, background: 'rgba(255,138,61,0.12)', border: '1px solid rgba(255,138,61,0.5)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#FFB27D' }}>Hits the {peso(data.goalPlan.cap)} cap</div>
          <div className="row" style={{ fontSize: 15, fontWeight: 800 }}><span>Per month</span><span>{peso(g.need)} → {peso(g.setAside)}</span></div>
          <div className="row" style={{ fontSize: 15, fontWeight: 800 }}><span>Ready</span><span>{dateLabel(g.target)} → {monthLabel(g.suggest)}</span></div>
          <button className="btn" disabled={busy} onClick={() => run([{ op: 'goal_edit', id: g.id, date: g.suggest }], 'Moved to ' + monthLabel(g.suggest))}>Move to {monthLabel(g.suggest)}</button>
        </div>
      )}

      <div className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row small" style={{ fontWeight: 800 }}><span>Put in per month</span>{!g.dated && <span>{peso(g.pace)} avg</span>}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 110 }}>
          {bars.map((b, i) => (
            <div key={b.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' }}>
              <span style={{ fontSize: 12, fontWeight: 800 }}>{peso(b.v)}</span>
              <div style={{ width: '100%', height: Math.max(6, Math.round((b.v / top) * 70)), borderRadius: '10px 10px 4px 4px', background: i === 2 ? GOAL : 'rgba(195,139,255,0.4)' }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{b.m}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ flex: 1 }}>
          <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Amount</span>
          <input className="input" inputMode="decimal" placeholder="₱" value={amt} onChange={(e) => setAmt(e.target.value)} />
        </label>
        <button className="chip" disabled={busy} onClick={() => add(1)} style={{ minHeight: 52, background: GOAL, borderColor: GOAL, color: 'var(--bg)' }}>Add</button>
        <button className="chip" disabled={busy} onClick={() => add(-1)} style={{ minHeight: 52 }}>Take out</button>
      </div>
    </>
  );
}
