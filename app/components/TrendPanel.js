'use client';
import { useState } from 'react';
import Link from 'next/link';
import Seg from './Seg';
import { Delta } from './TrendPills';
import { peso } from '../lib/money';
import { weekTrend, monthTrend } from '../lib/trends';

export default function TrendPanel({ data, now }) {
  const [mode, setMode] = useState('week');
  const t = mode === 'week' ? weekTrend(data, now) : monthTrend(data, now);
  const max = Math.max(1, ...t.bars.map((b) => b.value));
  return (
    <div className="glass card strong rise" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 24 }}>
      <div className="row">
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{peso(t.cur)} <span style={{ fontSize: 13 }}><Delta p={t.pct} /></span></div>
          <div className="small muted">{t.note}</div>
        </div>
        <Seg label="Period" options={[['week', 'Week'], ['month', 'Month']]} value={mode} onChange={setMode} minWidth={56} />
      </div>
      <div key={mode} style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 104 }} role="img" aria-label={'Spend by ' + mode}>
        {t.bars.map((b, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: b.current ? 'var(--under)' : '#8A93A6' }}>{(b.value / 1000).toFixed(1)}k</div>
            <div className="grow" style={{ width: '100%', height: Math.max(4, Math.round((b.value / max) * 70)), borderRadius: 6, background: b.current ? 'var(--under)' : 'rgba(255,255,255,0.22)', transformOrigin: 'bottom', animationName: 'growy', animationDelay: i * 0.04 + 's' }} />
            <div style={{ fontSize: 10, color: '#8A93A6', whiteSpace: 'nowrap' }}>{b.label}</div>
          </div>
        ))}
      </div>
      {t.movers.slice(0, 3).map((x) => (
        <div key={x.name} className="row" style={{ fontSize: 14 }}>
          <span>{x.name}</span>
          <span style={{ display: 'flex', gap: 10 }}><span className="muted">{peso(x.cur)}</span><span style={{ minWidth: 62, textAlign: 'right', fontWeight: 700 }}><Delta p={x.pct} /></span></span>
        </div>
      ))}
      <Link href="/recap" className="chip" style={{ alignSelf: 'flex-start' }}>Last week's recap ›</Link>
    </div>
  );
}
