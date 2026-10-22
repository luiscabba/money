'use client';
import { useState } from 'react';
import Ring from './Ring';
import { peso, MONTHS, daysIn, weekdayOf, allowanceFor, expensesByDay, sum, monthSpent } from '../lib/money';

export default function MonthCalendar({ data, now, onPick, picked }) {
  const [ym, setYm] = useState({ y: now.y, m: now.m });
  const isNow = ym.y === now.y && ym.m === now.m;
  const lastDay = isNow ? now.d : daysIn(ym.y, ym.m);
  const allow = allowanceFor(data, ym.y, ym.m);
  const byDay = expensesByDay(data, ym.y, ym.m);
  const n = daysIn(ym.y, ym.m);
  const lead = weekdayOf(ym.y, ym.m, 1);
  let under = 0;
  for (let d = 1; d <= lastDay; d++) if (sum(byDay[d] || []) <= allow) under++;
  const shift = (k) => {
    const d = new Date(ym.y, ym.m - 1 + k, 1);
    if (d.getFullYear() > now.y || (d.getFullYear() === now.y && d.getMonth() + 1 > now.m)) return;
    setYm({ y: d.getFullYear(), m: d.getMonth() + 1 });
  };
  return (
    <div className="glass card rise" style={{ padding: '12px 8px', borderRadius: 26 }}>
      <div className="row" style={{ padding: '0 6px 8px' }}>
        <button className="iconbtn" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 800 }}>{MONTHS[ym.m - 1]}</div>
          <div style={{ fontSize: 11, color: '#8A93A6' }}>{under} of {lastDay} days under · {peso(monthSpent(data, ym.y, ym.m))}</div>
        </div>
        <button className="iconbtn" onClick={() => shift(1)} aria-label="Next month" disabled={isNow} style={{ opacity: isNow ? 0.3 : 1 }}>›</button>
      </div>
      <div className="grid7 small muted" style={{ textAlign: 'center', fontWeight: 700, fontSize: 11, marginBottom: 4 }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <div key={i}>{x}</div>)}
      </div>
      <div className="grid7" style={{ gap: 2 }}>
        {Array.from({ length: lead }).map((_, i) => <div key={'b' + i} />)}
        {Array.from({ length: n }).map((_, i) => {
          const d = i + 1;
          const future = d > lastDay;
          const ds = sum(byDay[d] || []);
          const key = ym.y + '-' + ym.m + '-' + d;
          return (
            <button key={key} className={'day' + (picked === key ? ' sel' : '')} disabled={future} onClick={() => onPick(ym.y, ym.m, d)} aria-label={MONTHS[ym.m - 1] + ' ' + d + (future ? '' : ', ' + peso(ds))}>
              <Ring size={34} delay={d * 0.02} pct={ds / allow} full={!future && ds === 0} color={ds > allow ? 'var(--over)' : 'var(--under)'} track={future ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)'} />
              <span>{d}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
