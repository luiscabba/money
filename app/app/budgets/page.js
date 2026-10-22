'use client';
import { useMemo, useState } from 'react';
import Shell, { Loading } from '../../components/Shell';
import Ring from '../../components/Ring';
import useData from '../../components/useData';
import Bills from '../../components/Bills';
import Owed from '../../components/Owed';
import { peso, MONTHS, manilaNow, daysIn, budgetGroups, totalBudget, monthSpent } from '../../lib/money';

export default function Budgets() {
  const { data, error } = useData();
  const now = useMemo(() => manilaNow(), []);
  const [sel, setSel] = useState(0);
  const [tab, setTab] = useState('budgets');
  if (!data) return <Shell glow="b"><Loading error={error} /></Shell>;

  const n = daysIn(now.y, now.m);
  const pace = now.d / n;
  const groups = budgetGroups(data, now.y, now.m);
  const total = totalBudget(data);
  const left = total - monthSpent(data, now.y, now.m);
  const cur = groups[sel] || groups[0];
  const top = cur ? cur.items.slice().sort((a, b) => b.amount - a.amount).slice(0, 6) : [];

  return (
    <Shell glow="b">
      <div className="row" style={{ alignItems: 'baseline' }}>
        <h1 className="h1">Budgets</h1>
        <div className="small muted">{Math.round(pace * 100)}% of {MONTHS[now.m - 1]} gone</div>
      </div>
      <div role="group" aria-label="Section" className="glass" style={{ display: 'flex', padding: 3, borderRadius: 22 }}>
        {[['budgets', 'Budgets'], ['bills', 'Bills'], ['owed', 'Owed']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} style={{ flex: 1, minHeight: 38, border: 0, borderRadius: 19, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: tab === k ? 'var(--ink)' : 'transparent', color: tab === k ? 'var(--bg)' : 'var(--ink)' }}>{l}</button>
        ))}
      </div>
      {tab === 'bills' && <Bills data={data} now={now} />}
      {tab === 'owed' && <Owed data={data} />}
      {tab === 'budgets' && <>
      <div className="glass card strong row">
        <div><div className="small muted">Left in {MONTHS[now.m - 1]}</div><div style={{ fontSize: 26, fontWeight: 800, color: left < 0 ? 'var(--over)' : undefined }}>{left < 0 ? '−' + peso(-left) : peso(left)}</div></div>
        <div style={{ textAlign: 'right' }}><div className="small muted">Budget</div><div style={{ fontSize: 18, fontWeight: 700 }}>{peso(total)}</div></div>
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
              <span style={{ fontSize: 12, color: p > 1 ? 'var(--over)' : 'var(--muted)' }}>{Math.round(p * 100)}%</span>
            </button>
          );
        })}
      </div>

      {cur && (
        <div className="glass card strong" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="row small" style={{ fontWeight: 700 }}>
            <span>{cur.name} · {peso(cur.spent)} / {peso(cur.budget)}</span>
            <span style={{ color: cur.spent > cur.budget ? 'var(--over)' : 'var(--under)' }}>{cur.spent > cur.budget ? peso(cur.spent - cur.budget) + ' over' : peso(cur.budget - cur.spent) + ' left'}</span>
          </div>
          {top.length === 0 && <div className="small muted">Nothing yet this month.</div>}
          {top.map((t, i) => <div key={i} className="row small" style={{ color: '#D3D7E0' }}><span>{t.merchant}</span><span>{peso(t.amount)}</span></div>)}
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
