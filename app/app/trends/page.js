'use client';
import useToday from '../../components/useToday';
import { useMemo, useState } from 'react';
import Shell, { Loading } from '../../components/Shell';
import useData from '../../components/useData';
import Seg from '../../components/Seg';
import CountUp from '../../components/CountUp';
import { peso, manilaNow, MONTHS } from '../../lib/money';
import { weekTrend, monthTrend, paceLines } from '../../lib/trends';

export default function Trends() {
  const { data, error } = useData();
  const now = useToday();
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
  const all = t.movers;

  return (
    <Shell glow="b">
      <div className="row">
        <h1 className="h1">Trends</h1>
        <Seg label="Period" options={[['week', 'Week'], ['month', 'Month']]} value={mode} onChange={setMode} />
      </div>

      <div>
        <div className="small muted">{M ? MONTHS[now.m - 1] + ' so far' : 'This week so far'}</div>
        <div className="row" style={{ justifyContent: 'flex-start', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 40, fontWeight: 800 }}><CountUp value={t.cur} format={peso} /></div>
        </div>
        <div className="small" style={{ fontWeight: 700, color: !t.prev ? 'var(--muted)' : t.cur > t.prev ? 'var(--over)' : 'var(--under)' }}>{!t.prev ? 'Nothing to compare yet' : peso(Math.abs(t.cur - t.prev)) + (t.cur > t.prev ? ' more' : ' less') + ' than this point ' + (M ? 'in ' + t.prevName : 'last week')}</div>
      </div>

      <div className="glass card" style={{ padding: '14px 12px 10px', borderRadius: 26 }}>
        <svg width="100%" viewBox="0 0 334 170" role="img" aria-label={'Running total, ' + (M ? MONTHS[now.m - 1] : 'this week') + ' against ' + prevName}>
          <line x1="0" y1="150" x2="334" y2="150" stroke="rgba(255,255,255,0.12)" />
          <polyline key={'p' + mode} className="fadein" points={pts(pace.prev)} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeDasharray="5 5" strokeLinejoin="round" />
          <polyline key={'n' + mode} className="draw" pathLength="1" points={pts(pace.now)} fill="none" stroke="var(--under)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
          <circle key={'d' + mode} className="pop" style={{ transformBox: 'fill-box', transformOrigin: 'center', animationDelay: '0.9s' }} cx={X(k)} cy={Y(pace.now[k] || 0)} r="6" fill="var(--under)" />
          {pace.ticks.map(([i, l]) => <text key={i} x={X(i)} y="166" fill="#8A93A6" fontSize="10" textAnchor="middle">{l}</text>)}
        </svg>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--muted)', padding: '4px 4px 0' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--under)' }} />{M ? MONTHS[now.m - 1] : 'This week'}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, borderTop: '2px dashed rgba(255,255,255,0.5)' }} />{prevName}</span>
        </div>
      </div>

      <div className="glass card strong" style={{ display: 'flex', flexDirection: 'column', gap: 14, borderRadius: 26 }}>
        <div className="small muted">What changed · {t.note}</div>
        {all.length === 0 && <div className="small muted">No change yet.</div>}
        {all.map((x, i) => {
          const up = x.change > 0;
          return (
            <div key={x.name} className="row" style={{ paddingBottom: i < all.length - 1 ? 12 : 0, borderBottom: i < all.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 0 }}>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <b style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</b>
                <span className="small muted">{peso(x.cur)} vs {peso(x.prev)}</span>
              </span>
              <b style={{ fontSize: 16, whiteSpace: 'nowrap', color: up ? 'var(--over)' : 'var(--under)' }}>{up ? '+' : '−'}{peso(Math.abs(x.change))}</b>
            </div>
          );
        })}
      </div>
    </Shell>
  );
}
