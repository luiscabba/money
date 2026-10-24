'use client';
import { useState } from 'react';
import { peso } from '../lib/money';
import { upcomingEvents, eventBudget } from '../lib/calendar';
import { askMoney, change } from './apply';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const time = (iso) => { const h = Number(iso.slice(11, 13)), mi = iso.slice(14, 16); return (h % 12 || 12) + ':' + mi + (h < 12 ? 'am' : 'pm'); };
const dayOf = (iso) => new Date(iso.slice(0, 10) + 'T12:00:00');

// Calendar events with a place in the next week: what budget they come out of, plan them or say they cost nothing.
export default function ComingUp({ data, now }) {
  const [busy, setBusy] = useState('');
  const list = upcomingEvents(data).slice(0, 2);
  if (!list.length) return null;
  return (
    <div className="glass card strong rise" style={{ display: 'flex', flexDirection: 'column', gap: 14, borderRadius: 24 }}>
      <span className="small" style={{ fontWeight: 700, color: 'var(--muted)' }}>Coming up</span>
      {list.map((e) => {
        const d = dayOf(e.start);
        const b = eventBudget(data, e, d.getFullYear(), d.getMonth() + 1);
        const when = DAYS[d.getDay()] + ' ' + d.getDate();
        return (
          <div key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div aria-hidden="true" style={{ width: 48, height: 52, flexShrink: 0, borderRadius: 12, background: 'rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--over)' }}>{DAYS[d.getDay()]}</span>
                <span style={{ fontSize: 20, fontWeight: 800 }}>{d.getDate()}</span>
              </div>
              <div style={{ minWidth: 0, flexGrow: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}{e.allDay ? '' : ' · ' + time(e.start)}</div>
                <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b ? b.name + ' has ' + (b.left >= 0 ? peso(b.left) + ' left' : peso(-b.left) + ' over') : e.location}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="chip on" style={{ flexGrow: 1 }} disabled={busy === e.id} onClick={() => askMoney(`Plan for "${e.title}" on ${when} at ${e.location}. I'll spend about ₱`)}>Plan it</button>
              <button className="chip" disabled={busy === e.id} onClick={async () => { setBusy(e.id); await change([{ op: 'event_dismiss', id: e.id }], e.title + ': not spending'); setBusy(''); }}>Not spending</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
