'use client';
import { useMemo, useState } from 'react';
import Shell, { Loading } from '../../components/Shell';
import useData from '../../components/useData';
import { Delta } from '../../components/TrendPills';
import { peso, manilaNow, MONTHS } from '../../lib/money';
import { weekTrend, monthTrend, paceLines } from '../../lib/trends';

export default function Trends() {
  const { data, error } = useData();
  const now = useMemo(() => manilaNow(), []);
  const [mode, setMode] = useState('month');
  if (!data) return <Shell glow="b"><Loading error={error} /></Shell>;

  const M = mode === 'month';
  const t = M ? monthTrend(data, now) : weekTrend(data, now);
  const pace = paceLines(data, now, mode);
  const n = pace.prev.length;
  const k = pace.now.length - 1;
  const max = Math.max(1, pace.prev[n - 1] || 0, pace.now[k] || 0) * 1.08;
  const X = (i) => (i / Math.max(1, n - 1)) * 326 + 4;
  const Y = (v) => 150 - (v / max) * 138;
  const pts = (a) => a.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ');
  const prevName = M ? t.prevName : 'Last week';
  const seg = (on) => ({ minHeight: 38, minWidth: 64, border: 0, borderRadius: 19, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: on ? 'var(--ink)' : 'transparent', color: on ? 'var(--bg)' : 'var(--ink)' });
  const all = t.movers;

  return (
    <Shell glow="b">
      <div className="row">
        <h1 className="h1">Trends</h1>
        <div role="group" aria-label="Period" className="glass" style={{ display: 'flex', padding: 3, borderRadius: 22 }}>
          <button style={seg(!M)} aria-pressed={!M} onClick={() => setMode('week')}>Week</button>
          <button style={seg(M)} aria-pressed={M} onClick={() => setMode('month')}>Month</button>
        </div>
      </div>

      <div>
        <div className="small muted">{M ? MONTHS[now.m - 1] + ' so far' : 'This week so far'}</div>
        <div className="row" style={{ justifyContent: 'flex-start', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 40, fontWeight: 800 }}>{peso(t.cur)}</div>
          <div style={{ fontSize: 15, fontWeight: 800 }}><Delta p={t.pct} /></div>
        </div>
        <div className="small muted">{peso(t.prev)} at this point {M ? 'in ' + t.prevName : 'last week'}</div>
      </div>

      <div className="glass card" style={{ padding: '14px 12px 10px', borderRadius: 26 }}>
        <svg width="100%" viewBox="0 0 334 170" role="img" aria-label={'Running total, ' + (M ? MONTHS[now.m - 1] : 'this week') + ' against ' + prevName}>
          <line x1="0" y1="150" x2="334" y2="150" stroke="rgba(255,255,255,0.12)" />
          <polyline points={pts(pace.prev)} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeDasharray="5 5" strokeLinejoin="round" />
          <polyline points={pts(pace.now)} fill="none" stroke="var(--under)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={X(k)} cy={Y(pace.now[k] || 0)} r="6" fill="var(--under)" />
          {pace.ticks.map(([i, l]) => <text key={i} x={X(i)} y="166" fill="#8A93A6" fontSize="10" textAnchor="middle">{l}</text>)}
        </svg>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--muted)', padding: '4px 4px 0' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--under)' }} />{M ? MONTHS[now.m - 1] : 'This week'}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, borderTop: '2px dashed rgba(255,255,255,0.5)' }} />{prevName}</span>
        </div>
      </div>

      <div className="glass card strong" style={{ display: 'flex', flexDirection: 'column', gap: 14, borderRadius: 26 }}>
        <div className="small muted">Movers · {t.note}</div>
        {all.length === 0 && <div className="small muted">No change yet.</div>}
        {all.map((x) => {
          const p = x.pct === null ? 200 : x.pct;
          const w = Math.min(Math.abs(p) / 200, 1) * 50;
          const up = x.change > 0;
          return (
            <div key={x.name} style={{ display: 'grid', gridTemplateColumns: '100px minmax(0,1fr) 70px', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</span>
              <div style={{ position: 'relative', height: 10 }} aria-hidden="true">
                <div style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 1, background: 'rgba(255,255,255,0.25)' }} />
                <div style={{ position: 'absolute', top: 0, height: 10, borderRadius: 5, left: up ? '50%' : 50 - w + '%', width: Math.max(w, 2) + '%', background: up ? 'var(--over)' : 'var(--under)' }} />
              </div>
              <span style={{ textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}><Delta p={x.pct} /></span>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
