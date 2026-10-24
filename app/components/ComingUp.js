'use client';
import { useState } from 'react';
import { peso } from '../lib/money';
import { safeToSpend } from '../lib/safe';
import { upcomingEvents, eventBudget } from '../lib/calendar';
import { askMoney, change } from './apply';
import { Sheet } from './TxSheet';

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const time = (iso) => { const h = Number(iso.slice(11, 13)), mi = iso.slice(14, 16); return (h % 12 || 12) + ':' + mi + (h < 12 ? 'am' : 'pm'); };
const dayOf = (k) => new Date(k.slice(0, 10) + 'T12:00:00');
const keyOf = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const num = (s) => Math.max(0, Math.round(Number(String(s).replace(/[^\d.]/g, '')) || 0));

function Badge({ date, plan }) {
  const tint = plan ? { background: 'rgba(195,139,255,0.18)' } : { background: 'rgba(255,255,255,0.08)' };
  const box = { width: 48, height: 52, flexShrink: 0, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', ...tint };
  if (!date) return <span aria-hidden="true" style={box}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C38BFF" strokeWidth="2.2" strokeLinecap="round"><path d="M12 7v5l3 2" /><circle cx="12" cy="12" r="9" /></svg></span>;
  const d = dayOf(date);
  return <span aria-hidden="true" style={box}><span style={{ fontSize: 11, fontWeight: 800, color: plan ? '#C38BFF' : 'var(--over)' }}>{DAYS[d.getDay()]}</span><span style={{ fontSize: 20, fontWeight: 800 }}>{d.getDate()}</span></span>;
}

// Monday to Sunday of today's week, as YYYY-MM-DD.
function weekOf(now) {
  const t = new Date(now.y, now.m - 1, now.d);
  const mon = new Date(t.getTime() - ((t.getDay() + 6) % 7) * 86400000);
  return [keyOf(t), keyOf(new Date(mon.getTime() + 6 * 86400000))];
}

function PlanSheet({ data, now, plan, onClose }) {
  const [today, sun] = weekOf(now);
  const tmr = keyOf(new Date(now.y, now.m - 1, now.d + 1));
  const [what, setWhat] = useState(plan ? plan.what : '');
  const [amt, setAmt] = useState(plan ? String(plan.amount) : '');
  const [date, setDate] = useState(plan ? plan.date || '' : '');
  const [picking, setPicking] = useState(!!(plan && plan.date && plan.date !== today && plan.date !== tmr));
  const [busy, setBusy] = useState(false);
  const v = num(amt);
  // Safe to spend today with this plan as edited, versus without it.
  const others = (data.plans || []).filter((p) => !plan || p.id !== plan.id);
  const after = safeToSpend({ ...data, plans: v > 0 && what.trim() ? others.concat({ id: 'x', what, amount: v, date, status: 'planned' }) : others }, now).safe;
  const before = safeToSpend(data, now).safe;
  const run = async (ops, text) => { setBusy(true); const r = await change(ops, text); setBusy(false); if (r.ok) onClose(); };
  const save = () => plan
    ? run([{ op: 'edit_plan', id: plan.id, what: what.trim(), amount: v, date: date || 'none' }], what.trim() + ' updated')
    : run([{ op: 'add_plan', what: what.trim(), amount: v, date: date || undefined }], what.trim() + ' planned · ' + peso(v));
  const chip = (label, on, fn) => <button className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={fn}>{label}</button>;
  return (
    <Sheet title={plan ? 'Plan' : 'New plan'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="pl-what" className="small muted" style={{ fontWeight: 700 }}>What</label>
        <input id="pl-what" className="input" style={{ minHeight: 48, fontSize: 16 }} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Haircut" />
      </div>
      <div className="row">
        <label htmlFor="pl-amt" className="small muted" style={{ fontWeight: 700 }}>Amount</label>
        <input id="pl-amt" inputMode="numeric" value={amt === '' ? '' : '₱' + v.toLocaleString('en-US')} placeholder="₱0" onChange={(e) => setAmt(e.target.value)} style={{ width: 170, border: 0, background: 'transparent', color: 'var(--ink)', textAlign: 'right', fontSize: 34, fontWeight: 800, fontFamily: 'inherit' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="small muted" style={{ fontWeight: 700 }}>When</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {chip('No date', !date, () => { setDate(''); setPicking(false); })}
          {chip('Today', date === today, () => { setDate(today); setPicking(false); })}
          {chip('Tomorrow', date === tmr, () => { setDate(tmr); setPicking(false); })}
          {chip('Pick a date', picking, () => setPicking(true))}
        </div>
        {picking && <input type="date" aria-label="Date" className="input" style={{ minHeight: 48, fontSize: 16 }} value={date} min={today} onChange={(e) => setDate(e.target.value)} />}
        {date && date > sun && <span className="small muted">Counts from that week.</span>}
      </div>
      <div className="row" style={{ padding: '12px 14px', borderRadius: 16, background: 'rgba(195,139,255,0.12)' }}>
        <span className="small" style={{ color: '#D3D7E0' }}>Safe to spend today</span>
        <b style={{ fontSize: 15 }}>{after === before ? peso(after) : peso(before) + ' → ' + peso(after)}</b>
      </div>
      <button className="btn" disabled={busy || !what.trim() || !v} onClick={save} style={{ minHeight: 54, background: 'var(--under)', color: '#08281A', fontWeight: 800 }}>Save</button>
      {plan && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="chip" style={{ flex: 1, minHeight: 48 }} disabled={busy} onClick={() => run([{ op: 'plan_done', id: plan.id }], plan.what + ' bought')}>Bought it</button>
          <button className="chip" style={{ flex: 1, minHeight: 48, color: 'var(--over)' }} disabled={busy} onClick={() => run([{ op: 'remove_plan', id: plan.id }], plan.what + ' removed')}>Remove</button>
        </div>
      )}
    </Sheet>
  );
}

// Plans and calendar events with a place, soonest first: what they'll take from the week, plan or dismiss them.
export default function ComingUp({ data, now }) {
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(null); // a plan, 'new', or null
  const [today, sun] = weekOf(now);
  const plans = (data.plans || []).filter((p) => p.status === 'planned' && (!p.date || p.date >= today))
    .map((p) => ({ kind: 'plan', key: 'p' + p.id, sort: p.date || '0', plan: p }));
  const events = upcomingEvents(data).slice(0, 3).map((e) => ({ kind: 'event', key: 'e' + e.id, sort: e.start.slice(0, 10), event: e }));
  const items = plans.concat(events).sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0)).slice(0, 6);
  const sheet = open && <PlanSheet data={data} now={now} plan={open === 'new' ? null : open} onClose={() => setOpen(null)} />;
  if (!items.length) return <>{sheet}<button className="chip" onClick={() => setOpen('new')} style={{ alignSelf: 'center', borderStyle: 'dashed' }}>+ Plan a purchase</button></>;
  return (
    <div id="coming-up" className="glass card strong rise" style={{ display: 'flex', flexDirection: 'column', gap: 14, borderRadius: 24 }}>
      <div className="row">
        <span className="small" style={{ fontWeight: 700, color: 'var(--muted)' }}>Coming up</span>
        <button className="chip" onClick={() => setOpen('new')} style={{ minHeight: 36, padding: '0 14px', fontSize: 13 }}>+ Plan</button>
      </div>
      {items.map((it, i) => {
        const sep = i > 0 && <div aria-hidden="true" style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />;
        if (it.kind === 'plan') {
          const p = it.plan;
          const note = !p.date ? 'No date · counts this week' : p.date > sun ? 'Next week or later' : p.date === today ? 'Today' : 'This week';
          return (
            <div key={it.key} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{sep}
              <button className="press" onClick={() => setOpen(p)} style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', border: 0, background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'var(--ink)' }}>
                <Badge date={p.date} plan />
                <span style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 }}><b style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.what}</b><span className="small muted">{note}</span></span>
                <b style={{ fontSize: 16 }}>{peso(p.amount)}</b>
              </button>
            </div>
          );
        }
        const e = it.event;
        const d = dayOf(e.start);
        const b = eventBudget(data, e, d.getFullYear(), d.getMonth() + 1);
        return (
          <div key={it.key} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{sep}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Badge date={e.start} />
              <div style={{ minWidth: 0, flexGrow: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}{e.allDay ? '' : ' · ' + time(e.start)}</div>
                <div className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b ? b.name + ' has ' + (b.left >= 0 ? peso(b.left) + ' left' : peso(-b.left) + ' over') : e.location}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="chip on" style={{ flexGrow: 1 }} disabled={busy === e.id} onClick={() => askMoney(`Plan for "${e.title}" on ${DAYS[d.getDay()]} ${d.getDate()} at ${e.location}. I'll spend about ₱`)}>Plan it</button>
              <button className="chip" disabled={busy === e.id} onClick={async () => { setBusy(e.id); await change([{ op: 'event_dismiss', id: e.id }], e.title + ': not spending'); setBusy(''); }}>Not spending</button>
            </div>
          </div>
        );
      })}
      {sheet}
    </div>
  );
}
