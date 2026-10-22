'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Shell, { Loading } from '../components/Shell';
import Ring from '../components/Ring';
import useData from '../components/useData';
import CountUp from '../components/CountUp';
import TrendPanel from '../components/TrendPanel';
import MonthCalendar from '../components/MonthCalendar';
import { Delta } from '../components/TrendPills';
import { enablePush } from '../components/SW';
import { peso, MONTHS, WEEKDAYS, manilaNow, allowanceFor, netExpenses, needsReview, dayKey, sum } from '../lib/money';
import { safeToSpend } from '../lib/safe';
import { weekTrend, monthTrend } from '../lib/trends';

const DAY = 86400000;
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const labelOf = (k) => { const d = new Date(k + 'T12:00:00'); return SHORT[(d.getDay() + 6) % 7] + ', ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate(); };
const askMoney = (text) => window.dispatchEvent(new CustomEvent('money:ask', { detail: text }));

export default function Today() {
  const { data, error } = useData();
  const now = useMemo(() => manilaNow(), []);
  const [pick, setPick] = useState(null); // 'YYYY-MM-DD' or null for Recent
  const [panel, setPanel] = useState(null); // 'trend' | 'month' | null
  const [pushMsg, setPushMsg] = useState('');
  const [pushNeeded, setPushNeeded] = useState(false);
  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem('pushSaved'); } catch (e) {}
    setPushNeeded(typeof Notification === 'undefined' || Notification.permission !== 'granted' || !saved);
  }, []);

  if (!data) return <Shell><Loading error={error} /></Shell>;

  const s = safeToSpend(data, now);
  const ok = s.safe >= 0;
  const allow = allowanceFor(data, now.y, now.m);
  const review = needsReview(data).length;
  const gaps = data.gaps || [];
  const exp = netExpenses(data);
  const byKey = {};
  exp.forEach((t) => { const k = t.date.slice(0, 10); (byKey[k] = byKey[k] || []).push(t); });
  const today = new Date(now.y, now.m - 1, now.d);
  const mon = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon.getTime() + i * DAY);
    const k = dayKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return { k, l: 'MTWTFSS'[i], future: d > today, spent: sum(byKey[k] || []), today: d.getTime() === today.getTime() };
  });
  const w = weekTrend(data, now), m = monthTrend(data, now);
  const recent = exp.filter((t) => t.amount > 0).slice(-6).reverse();
  const pickedItems = pick ? (byKey[pick] || []) : [];

  const askPush = async () => {
    const r = await enablePush();
    setPushMsg(r === 'ok' ? 'Notifications on. A test is on its way.' : r);
    if (r === 'ok') setPushNeeded(false);
  };
  const toggle = (p) => setPanel(panel === p ? null : p);

  return (
    <Shell>
      <div className="row">
        <div>
          <div className="small muted">{WEEKDAYS[(today.getDay() + 6) % 7]}, {MONTHS[now.m - 1].slice(0, 3)} {now.d}</div>
          <h1 className="h1">Today</h1>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {review > 0 && <Link href="/review" className="chip warn">{review} to review</Link>}
          {pushNeeded && (
            <button className="iconbtn" onClick={askPush} aria-label="Turn on notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            </button>
          )}
        </div>
      </div>
      {pushMsg && <div className="small" style={{ color: 'var(--under)' }}>{pushMsg}</div>}

      {gaps.map((g) => (
        <button key={g.id} onClick={() => askMoney(`${peso(Math.abs(g.amount))} ${g.amount < 0 ? 'left' : 'came into'} ${g.account} between ${labelOf(g.from.slice(0, 10))} and ${labelOf(g.to.slice(0, 10))} without a transaction (gap ${g.id}). It was `)}
          className="press" style={{ textAlign: 'left', padding: '12px 16px', borderRadius: 20, border: '1px solid rgba(255,138,61,0.5)', background: 'rgba(255,138,61,0.14)', color: '#FFB27D', fontSize: 13, lineHeight: 1.45, cursor: 'pointer' }}>
          <b>{g.account}: {peso(Math.abs(g.amount))} {g.amount < 0 ? 'not tracked' : 'extra'}</b> between {labelOf(g.from.slice(0, 10)).slice(5)} and {labelOf(g.to.slice(0, 10)).slice(5)}. Tap to tell Ask Money what it was.
        </button>
      ))}

      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 2px' }}>
        <Ring size={210} r={52} width={12} pct={s.used} color={s.used >= 1 ? 'var(--over)' : 'var(--under)'} burst={ok} label={peso(s.before + s.today) + ' of ' + peso(s.week) + ' used this week'}>
          <div className="small muted">Safe to spend</div>
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.05, color: ok ? undefined : 'var(--over)' }}>{ok ? <CountUp value={s.safe} format={peso} /> : '−' + peso(-s.safe)}</div>
          <div className="small" style={{ color: s.left >= 0 ? 'var(--under)' : 'var(--over)' }}>{s.left >= 0 ? peso(s.left) + ' left this week' : peso(-s.left) + ' over this week'}</div>
          {s.planned > 0 && <div style={{ fontSize: 11, color: '#8A93A6' }}>{peso(s.planned)} planned</div>}
        </Ring>
      </div>

      <div className="glass" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 6px', borderRadius: 22 }}>
        {week.map((d, i) => (
          <button key={d.k} disabled={d.future} onClick={() => setPick(pick === d.k ? null : d.k)} aria-label={labelOf(d.k) + (d.future ? '' : ', ' + peso(d.spent))} aria-pressed={pick === d.k}
            className="press" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 5px', borderRadius: 14, border: 0, cursor: d.future ? 'default' : 'pointer', background: pick === d.k ? 'rgba(255,255,255,0.18)' : d.today ? 'rgba(255,255,255,0.08)' : 'transparent' }}>
            <Ring size={36} delay={i * 0.05} pct={d.spent / allow} full={!d.future && d.spent === 0} color={d.spent > allow ? 'var(--over)' : 'var(--under)'} track={d.future ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.14)'} />
            <span style={{ fontSize: 11, fontWeight: 700, color: d.future ? 'var(--dim)' : 'var(--muted)' }}>{d.l}</span>
          </button>
        ))}
      </div>

      <div className="row" style={{ padding: '0 4px', fontSize: 13 }}>
        <button onClick={() => toggle('trend')} aria-expanded={panel === 'trend'} style={{ border: 0, background: 'transparent', padding: '8px 0', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>
          Week <b><Delta p={w.pct} /></b> · Month <b><Delta p={m.pct} /></b> {panel === 'trend' ? '▴' : '▾'}
        </button>
        <button onClick={() => toggle('month')} aria-expanded={panel === 'month'} style={{ border: 0, background: 'transparent', padding: '8px 0', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>
          {panel === 'month' ? 'Hide month' : 'Month view ›'}
        </button>
      </div>
      {panel === 'trend' && <TrendPanel data={data} now={now} />}
      {panel === 'month' && <MonthCalendar data={data} now={now} picked={pick && (Number(pick.slice(0, 4)) + '-' + Number(pick.slice(5, 7)) + '-' + Number(pick.slice(8, 10)))} onPick={(y, mo, d) => setPick(dayKey(y, mo, d))} />}

      <div key={pick || 'recent'} className="glass card strong rise" style={{ display: 'flex', flexDirection: 'column', gap: 9, borderRadius: 24 }}>
        <div className="row">
          <span className="small" style={{ fontWeight: 700, color: 'var(--muted)' }}>{pick ? labelOf(pick) + ' · ' + peso(sum(pickedItems)) : 'Recent'}</span>
          {pick && <button className="chip" style={{ minHeight: 32, padding: '0 12px', fontSize: 12 }} onClick={() => setPick(null)}>Recent</button>}
        </div>
        {pick && pickedItems.length === 0 && <div className="small muted">No spend.</div>}
        {(pick ? pickedItems : recent).map((t, i) => (
          <div key={i} className="row" style={{ fontSize: 14 }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.merchant} <span className="muted small">· {pick ? t.category : labelOf(t.date.slice(0, 10)).slice(0, 3) + ' ' + t.date.slice(8, 10)}</span></span>
            <span style={{ fontWeight: 700, color: t.amount < 0 ? 'var(--under)' : undefined }}>{t.amount < 0 ? '−' + peso(-t.amount) : peso(t.amount)}</span>
          </div>
        ))}
      </div>
    </Shell>
  );
}
