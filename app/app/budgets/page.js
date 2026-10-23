'use client';
import { useMemo, useState } from 'react';
import Shell, { Loading } from '../../components/Shell';
import Ring from '../../components/Ring';
import useData from '../../components/useData';
import Bills from '../../components/Bills';
import Owed from '../../components/Owed';
import Seg from '../../components/Seg';
import Goals from '../../components/Goals';
import { openTx } from '../../components/apply';
import { peso, MONTHS, manilaNow, daysIn, budgetGroups, totalBudget, monthSpent } from '../../lib/money';

export default function Budgets() {
  const { data, error } = useData();
  const now = useMemo(() => manilaNow(), []);
  const [sel, setSel] = useState(0);
  const [tab, setTab] = useState('budgets');
  const [open, setOpen] = useState('');
  if (!data) return <Shell glow="b"><Loading error={error} /></Shell>;

  const n = daysIn(now.y, now.m);
  const pace = now.d / n;
  const groups = budgetGroups(data, now.y, now.m);
  const total = totalBudget(data);
  const setAside = (data.goalPlan && data.goalPlan.setAside) || 0;
  const left = total - setAside - monthSpent(data, now.y, now.m);
  const cur = groups[sel] || groups[0];
  // Same merchant once, with how many times and the total.
  const groupsOf = (items) => {
    const by = {};
    items.forEach((t) => { const g = (by[t.merchant] = by[t.merchant] || { merchant: t.merchant, amount: 0, n: 0 }); g.amount += t.amount; g.n++; });
    return Object.values(by).sort((a, b) => b.amount - a.amount);
  };
  const top = cur ? groupsOf(cur.items) : [];

  return (
    <Shell glow="b">
      <div className="row" style={{ alignItems: 'baseline' }}>
        <h1 className="h1">Budgets</h1>
        <div className="small muted">{Math.round(pace * 100)}% of {MONTHS[now.m - 1]} gone</div>
      </div>
      <Seg label="Section" options={[['budgets', 'Budgets'], ['goals', 'Goals'], ['bills', 'Bills'], ['owed', 'Owed']]} value={tab} onChange={setTab} />
      {tab === 'goals' && <Goals data={data} now={now} />}
      {tab === 'bills' && <Bills data={data} now={now} />}
      {tab === 'owed' && <Owed data={data} />}
      {tab === 'budgets' && <>
      <div className="glass card strong row">
        <div><div className="small muted">Left in {MONTHS[now.m - 1]}</div><div style={{ fontSize: 26, fontWeight: 800, color: left < 0 ? 'var(--over)' : undefined }}>{left < 0 ? '−' + peso(-left) : peso(left)}</div></div>
        <div style={{ textAlign: 'right' }}><div className="small muted">Budget</div><div style={{ fontSize: 18, fontWeight: 700 }}>{peso(total)}</div>{setAside > 0 && <button onClick={() => setTab('goals')} style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#C38BFF' }}>{peso(setAside)} to goals</button>}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
        {groups.map((g, i) => {
          const p = g.budget ? g.spent / g.budget : 0;
          const color = p > 1 ? 'var(--over)' : p > pace ? 'var(--ahead)' : 'var(--under)';
          return (
            <button key={g.name} onClick={() => setSel(i)} className="glass" aria-label={g.name + ', ' + peso(g.spent) + ' of ' + peso(g.budget)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minHeight: 128, padding: '10px 4px', borderRadius: 20, cursor: 'pointer', background: i === sel ? 'rgba(255,255,255,0.18)' : undefined, borderColor: i === sel ? 'rgba(255,255,255,0.4)' : undefined }}>
              <div style={{ position: 'relative' }}>
                <Ring size={72} r={28} width={8} pct={p} color={color} delay={i * 0.06} />
                <PaceTick pace={pace} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{g.name.replace('Subscriptions', 'Subs').replace('Food & Drinks', 'Food')}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: p > 1 ? 'var(--over)' : 'var(--muted)' }}>{g.budget - g.spent >= 0 ? peso(g.budget - g.spent) + ' left' : peso(g.spent - g.budget) + ' over'}</span>
            </button>
          );
        })}
      </div>

      {cur && (
        <div key={sel} className="glass card strong rise" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row small" style={{ fontWeight: 700 }}>
            <span>{cur.name} · {peso(cur.spent)} / {peso(cur.budget)}</span>
            <span style={{ color: cur.spent > cur.budget ? 'var(--over)' : 'var(--under)' }}>{cur.spent > cur.budget ? peso(cur.spent - cur.budget) + ' over' : peso(cur.budget - cur.spent) + ' left'}</span>
          </div>
          {top.length === 0 && <div className="small muted">Nothing yet this month.</div>}
          {top.slice(0, 8).map((t) => (
            <div key={t.merchant}>
              <button onClick={() => (t.n > 1 ? setOpen(open === t.merchant ? '' : t.merchant) : openTx(cur.items.find((x) => x.merchant === t.merchant)))} aria-expanded={open === t.merchant} className="row small" style={{ width: '100%', border: 0, background: 'transparent', padding: '4px 0', color: '#D3D7E0', cursor: 'pointer', fontSize: 13 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{t.merchant}{t.n > 1 && <span className="muted"> ×{t.n}</span>}</span><span>{peso(t.amount)}</span>
              </button>
              {open === t.merchant && t.n > 1 && cur.items.filter((x) => x.merchant === t.merchant).map((x, j) => (
                <button key={j} onClick={() => openTx(x)} className="row" style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#8A93A6', padding: '4px 0 4px 12px' }}><span>{new Date(x.date.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{x.note ? ' · ' + x.note : ''}</span><span>{peso(x.amount)}</span></button>
              ))}
            </div>
          ))}
        </div>
      )}
      </>}
    </Shell>
  );
}

function PaceTick({ pace }) {
  const a = pace * 2 * Math.PI - Math.PI / 2;
  const c = 36;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
      <line x1={c + 22 * Math.cos(a)} y1={c + 22 * Math.sin(a)} x2={c + 34 * Math.cos(a)} y2={c + 34 * Math.sin(a)} stroke="#F2F4F8" strokeWidth="2.5" />
    </svg>
  );
}
