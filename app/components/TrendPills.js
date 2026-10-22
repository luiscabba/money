'use client';
import { useState } from 'react';
import Link from 'next/link';
import { peso, MONTHS } from '../lib/money';
import { weekTrend, monthTrend } from '../lib/trends';

export function Delta({ p, suffix = '' }) {
  if (p === null) return <span style={{ color: 'var(--over)' }}>new{suffix}</span>;
  const up = p > 0;
  return <span style={{ color: up ? 'var(--over)' : 'var(--under)' }}>{up ? '▲' : p < 0 ? '▼' : '='} {Math.abs(p)}%{suffix}</span>;
}

export default function TrendPills({ data, now }) {
  const [open, setOpen] = useState(null);
  const w = weekTrend(data, now), m = monthTrend(data, now);
  const t = open === 'week' ? w : open === 'month' ? m : null;
  const max = t ? Math.max(1, ...t.bars.map((b) => b.value)) : 1;

  const pill = (key, title, x, suffix) => (
    <button onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key}
      className="glass" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 14px', borderRadius: 22, cursor: 'pointer', textAlign: 'left', background: open === key ? 'rgba(255,255,255,0.16)' : undefined, borderColor: open === key ? 'rgba(255,255,255,0.4)' : undefined }}>
      <span className="small muted">{title}</span>
      <span style={{ fontSize: 20, fontWeight: 800 }}>{peso(x.cur)}</span>
      <span style={{ fontSize: 13, fontWeight: 700 }}><Delta p={x.pct} suffix={suffix} /></span>
    </button>
  );

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        {pill('week', 'This week', w, ' vs last')}
        {pill('month', MONTHS[now.m - 1], m, ' vs ' + m.prevName)}
      </div>
      {t && (
        <div className="glass card strong" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="small muted">{t.note}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 112 }} role="img" aria-label={'Spend by ' + (open === 'week' ? 'week' : 'month')}>
            {t.bars.map((b, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: b.current ? 'var(--under)' : '#8A93A6' }}>{(b.value / 1000).toFixed(1)}k</div>
                <div style={{ width: '100%', height: Math.max(4, Math.round((b.value / max) * 76)), borderRadius: 6, background: b.current ? 'var(--under)' : 'rgba(255,255,255,0.22)' }} />
                <div style={{ fontSize: 10, color: '#8A93A6', whiteSpace: 'nowrap' }}>{b.label}</div>
              </div>
            ))}
          </div>
          {t.movers.length > 0 && <div style={{ height: 1, background: 'var(--line)' }} />}
          {t.movers.slice(0, 3).map((x) => (
            <div key={x.name} className="row" style={{ fontSize: 14 }}>
              <span>{x.name}</span>
              <span style={{ display: 'flex', gap: 10 }}><span className="muted">{peso(x.cur)}</span><span style={{ minWidth: 62, textAlign: 'right', fontWeight: 700 }}><Delta p={x.pct} /></span></span>
            </div>
          ))}
          {open === 'week' && <Link href="/recap" className="chip" style={{ alignSelf: 'flex-start' }}>Last week's recap ›</Link>}
        </div>
      )}
    </>
  );
}
