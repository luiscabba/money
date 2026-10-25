'use client';
import { useState } from 'react';

// Charts, tables and what-if sliders Moni draws under a reply. Moni sends the numbers; this only draws them.
const p = (n) => '₱' + Math.round(n || 0).toLocaleString('en-US');
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const card = { display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 22, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)' };
const Title = ({ t }) => (t ? <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{t}</span> : null);

function Bars({ v }) {
  const items = (v.items || []).slice(0, 10);
  const max = Math.max(1, ...items.map((x) => num(x.value)));
  return (
    <figure className="rise" style={{ ...card, margin: 0 }} aria-label={v.title || 'Chart'}>
      <Title t={v.title} />
      {items.map((x, k) => (
        <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}><b style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.label}</b><b>{p(x.value)}</b></div>
          <div style={{ height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <div className="grow" style={{ transformOrigin: "left", width: (num(x.value) / max) * 100 + '%', height: 12, borderRadius: 6, background: x.hot ? 'var(--over)' : k === 0 && !items.some((i) => i.hot) ? 'var(--under)' : '#8A93A6', animationDelay: k * 0.05 + 's' }} />
          </div>
        </div>
      ))}
    </figure>
  );
}

function Columns({ v }) {
  const items = (v.items || []).slice(0, 14);
  const max = Math.max(1, ...items.map((x) => num(x.value)));
  const [pick, setPick] = useState(-1);
  const shown = pick >= 0 ? items[pick] : null;
  return (
    <figure className="rise" style={{ ...card, margin: 0 }} aria-label={v.title || 'Chart'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', minHeight: 18 }}><Title t={v.title} />{shown && <b style={{ fontSize: 13 }}>{shown.label} · {p(shown.value)}</b>}</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: items.length > 8 ? 4 : 8, alignItems: 'end', height: 110 }}>
        {items.map((x, k) => (
          <button key={k} onClick={() => setPick(pick === k ? -1 : k)} aria-label={x.label + ' ' + p(x.value)} style={{ border: 0, background: 'none', padding: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 4, cursor: 'pointer', color: 'inherit' }}>
            <div className="growy" style={{ width: "100%", height: Math.max(4, (num(x.value) / max) * 86), borderRadius: 6, background: x.hot ? 'var(--over)' : x.now ? 'rgba(255,255,255,0.35)' : 'var(--under)', opacity: pick >= 0 && pick !== k ? 0.4 : 1, transformOrigin: 'bottom', animationDelay: k * 0.04 + 's' }} />
            <span style={{ fontSize: 11, color: x.now ? 'var(--ink)' : 'var(--muted)', fontWeight: x.now ? 800 : 500 }}>{x.label}</span>
          </button>
        ))}
      </div>
    </figure>
  );
}

function Table({ v }) {
  const cols = v.columns || [];
  const rows = (v.rows || []).slice(0, 30);
  let main = cols.findIndex((c, k) => k > 0 && /total|spent|amount|sum/i.test(c));
  if (main < 0) main = cols.length - 1;
  return (
    <figure className="rise" style={{ ...card, margin: 0, gap: 4, padding: '12px 14px' }}>
      <Title t={v.title} />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead><tr>{cols.map((c, k) => <th key={k} scope="col" style={{ textAlign: k ? 'right' : 'left', padding: '8px 0 8px ' + (k ? '10px' : '0'), fontSize: 12, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                {r.map((c, k) => k === 0
                  ? <th key={k} scope="row" style={{ textAlign: 'left', padding: '10px 0', fontWeight: 700 }}>{c}</th>
                  : <td key={k} style={{ textAlign: 'right', padding: '10px 0 10px 10px', whiteSpace: 'nowrap', fontWeight: k === main ? 800 : 500, color: i === v.hotRow && k === main ? 'var(--over)' : k === main ? undefined : 'var(--muted)' }}>{c}</td>)}
              </tr>
            ))}
            {v.total && v.total.length > 0 && (
              <tr style={{ borderTop: '1px solid rgba(255,255,255,0.22)' }}>
                {v.total.map((c, k) => k === 0 ? <th key={k} scope="row" style={{ textAlign: 'left', padding: '10px 0', fontWeight: 800 }}>{c}</th> : <td key={k} style={{ textAlign: 'right', padding: '10px 0 10px 10px', fontWeight: 800, whiteSpace: 'nowrap' }}>{c}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function WhatIf({ v }) {
  const min = num(v.min), max = num(v.max) > min ? num(v.max) : min + 10, step = num(v.step) || 1;
  const current = Math.min(max, Math.max(min, num(v.current)));
  const [n, setN] = useState(Math.max(min, current - step)); // one step in, so the payoff shows straight away
  const kept = Math.round((current - n) * num(v.perUnit));
  const g = v.goal && num(v.goal.price) > 0 ? v.goal : null;
  let eta = '', sooner = 0, pct = 0;
  if (g) {
    const need = Math.max(0, num(g.price) - num(g.saved));
    const now = new Date();
    const when = (perMonth) => (perMonth > 0 ? Math.ceil(need / perMonth) : Infinity);
    const base = when(num(g.monthly)), next = when(num(g.monthly) + kept);
    if (isFinite(next)) { const d = new Date(now.getFullYear(), now.getMonth() + next, 1); eta = MON[d.getMonth()] + ' ' + d.getFullYear(); }
    sooner = isFinite(base) && isFinite(next) ? base - next : 0;
    pct = Math.min(100, (num(g.saved) / num(g.price)) * 100);
  }
  const monthsLeft = 12 - new Date().getMonth();
  return (
    <figure className="rise" style={{ ...card, margin: 0, gap: 16 }}>
      <Title t={v.title} />
      <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)' }}><span>{v.label || 'How much'}</span><b style={{ color: 'var(--ink)', fontSize: 15 }}>{n}</b></span>
        <input type="range" min={min} max={max} step={step} value={n} onChange={(e) => setN(Number(e.target.value))} style={{ width: '100%', accentColor: '#3DDC97', height: 28 }} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 12, borderRadius: 16, background: 'rgba(255,255,255,0.06)' }}><span style={{ fontSize: 12, color: 'var(--muted)' }}>{kept >= 0 ? 'Kept each month' : 'Extra each month'}</span><b style={{ fontSize: 22, color: kept >= 0 ? 'var(--under)' : 'var(--over)' }}>{p(Math.abs(kept))}</b></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 12, borderRadius: 16, background: 'rgba(255,255,255,0.06)' }}><span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g ? g.name + ' ready' : 'By December'}</span><b style={{ fontSize: 22 }}>{g ? eta || 'Not yet' : p(Math.max(0, kept) * monthsLeft)}</b></div>
      </div>
      {g && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.1)' }}><div style={{ width: pct + '%', height: 12, borderRadius: 6, background: '#C38BFF' }} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}><span>{p(g.saved)} saved</span><span>{sooner > 0 ? sooner + (sooner === 1 ? ' month' : ' months') + ' sooner' : sooner < 0 ? -sooner + ' months later' : 'Same as now'}</span><span>{p(g.price)}</span></div>
        </div>
      )}
    </figure>
  );
}

export default function Visual({ v }) {
  if (!v || typeof v !== 'object') return null;
  if (v.kind === 'bars') return <Bars v={v} />;
  if (v.kind === 'columns') return <Columns v={v} />;
  if (v.kind === 'table') return <Table v={v} />;
  if (v.kind === 'whatif') return <WhatIf v={v} />;
  return null;
}
