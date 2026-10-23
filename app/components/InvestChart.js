'use client';
import { useMemo, useRef, useState } from 'react';
import Seg from './Seg';

// Worth against money deposited, from the daily history. Drag across to read any day.
const RANGES = [['1m', '1M'], ['3m', '3M'], ['all', 'All']];
const W = 334, H = 168, L = 40, R = 6, T = 10, B = 20;
const short = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function InvestChart({ history, money, tick, live }) {
  const [range, setRange] = useState('all');
  const [at, setAt] = useState(null);
  const box = useRef(null);

  const pts = useMemo(() => {
    let dep = null;
    let all = history.map((h) => { if (h.deposited !== null && h.deposited !== undefined) dep = h.deposited; return { ...h, dep }; }).filter((h) => h.value > 0);
    // End on today's live value so the chart and the headline agree.
    if (live > 0) {
      const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }).slice(0, 10);
      all = all.filter((h) => h.date < today).concat({ date: today, value: live, dep });
    }
    if (range === 'all' || !all.length) return all;
    const days = range === '1m' ? 31 : 92;
    const cut = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    return all.filter((h) => h.date >= cut);
  }, [history, range, live]);

  if (pts.length < 2) {
    return <div className="small muted" style={{ padding: '6px 6px 8px' }}>The chart fills in once IBKR history is loaded.</div>;
  }

  const hasDep = pts.some((p) => p.dep !== null);
  const vals = pts.flatMap((p) => (hasDep && p.dep !== null ? [p.value, p.dep] : [p.value]));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo || hi * 0.05 || 1) * 0.12;
  const min = lo - pad, max = hi + pad;
  const X = (i) => L + (i / (pts.length - 1)) * (W - L - R);
  const Y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const line = pts.map((p, i) => X(i).toFixed(1) + ',' + Y(p.value).toFixed(1)).join(' ');
  let step = '';
  pts.forEach((p, i) => {
    if (p.dep === null) return;
    const y = Y(p.dep).toFixed(1);
    step += step ? ' L' + X(i).toFixed(1) + ',' + Y(pts[i - 1].dep === null ? p.dep : pts[i - 1].dep).toFixed(1) + ' L' + X(i).toFixed(1) + ',' + y : 'M' + X(i).toFixed(1) + ',' + y;
  });
  const ticks = [lo, (lo + hi) / 2, hi];
  const k = at === null ? pts.length - 1 : at;
  const cur = pts[k];
  const gain = cur.dep !== null ? cur.value - cur.dep : null;

  const move = (e) => {
    const r = box.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    setAt(Math.max(0, Math.min(pts.length - 1, Math.round(((x - L) / (W - L - R)) * (pts.length - 1)))));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="row" style={{ padding: '0 4px', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: '#8A93A6' }}>{at === null ? 'Today' : short(cur.date)}</div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{money(cur.value)}{gain !== null && <span style={{ fontSize: 13, marginLeft: 8, color: gain >= 0 ? 'var(--under)' : 'var(--over)' }}>{gain >= 0 ? '+' : '−'}{money(Math.abs(gain))}</span>}</div>
        </div>
        <Seg label="Range" options={RANGES} value={range} onChange={(v) => { setRange(v); setAt(null); }} minWidth={40} />
      </div>
      <svg ref={box} width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Worth against money deposited"
        style={{ touchAction: 'pan-y', cursor: 'crosshair' }}
        onPointerDown={move} onPointerMove={(e) => (e.buttons || e.pointerType === 'touch' ? move(e) : null)} onPointerLeave={() => setAt(null)} onPointerUp={() => setAt(null)}>
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="rgba(255,255,255,0.08)" />
            <text x={L - 5} y={Y(v) + 3} fill="#8A93A6" fontSize="9.5" textAnchor="end">{tick(v)}</text>
          </g>
        ))}
        <polygon className="fadein" points={X(0) + ',' + (H - B) + ' ' + line + ' ' + X(pts.length - 1) + ',' + (H - B)} fill="rgba(61,220,151,0.13)" />
        {hasDep && <path d={step} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeDasharray="4 3" />}
        <polyline key={range} className="draw" pathLength="1" points={line} fill="none" stroke="var(--under)" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />
        {at !== null && <line x1={X(k)} x2={X(k)} y1={T} y2={H - B} stroke="rgba(255,255,255,0.35)" />}
        <circle cx={X(k)} cy={Y(cur.value)} r="4.5" fill="var(--under)" stroke="#0B0D10" strokeWidth="2" />
        <text x={L} y={H - 5} fill="#8A93A6" fontSize="9.5">{short(pts[0].date)}</text>
        <text x={W - R} y={H - 5} fill="#8A93A6" fontSize="9.5" textAnchor="end">{short(pts[pts.length - 1].date)}</text>
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--muted)', padding: '0 4px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: 'var(--under)' }} />Worth</span>
        {hasDep && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, borderTop: '2px dashed rgba(255,255,255,0.55)' }} />Deposited</span>}
      </div>
    </div>
  );
}
