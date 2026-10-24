'use client';
import useToday from '../components/useToday';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Shell, { Loading } from '../components/Shell';
import Ring from '../components/Ring';
import useData from '../components/useData';
import CountUp from '../components/CountUp';
import TrendPanel from '../components/TrendPanel';
import MonthCalendar from '../components/MonthCalendar';
import ComingUp from '../components/ComingUp';
import { Delta } from '../components/TrendPills';
import { enablePush } from '../components/SW';
import { openTx, openAdd, askMoney } from '../components/apply';
import { peso, MONTHS, WEEKDAYS, manilaNow, allowanceFor, netExpenses, needsReview, dayKey, sum, monthSpent, totalBudget, pad } from '../lib/money';
import { safeToSpend } from '../lib/safe';
import { weekTrend, monthTrend } from '../lib/trends';

const DAY = 86400000;
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const labelOf = (k) => { const d = new Date(k + 'T12:00:00'); return SHORT[(d.getDay() + 6) % 7] + ', ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate(); };
const k = (n) => (n >= 1000 ? '₱' + (n / 1000).toFixed(1) + 'k' : peso(n));

export default function Today() {
  const { data, error, at, offline } = useData();
  const [closedSeen, setClosedSeen] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(id); }, []);
  const now = useToday();
  const [pick, setPick] = useState(null); // 'YYYY-MM-DD' or null for Recent
  const [panel, setPanel] = useState(null); // 'trend' | 'month' | null
  const [pushMsg, setPushMsg] = useState('');
  const [pushNeeded, setPushNeeded] = useState(false);
  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem('pushSaved'); } catch (e) {}
    setPushNeeded(typeof Notification === 'undefined' || Notification.permission !== 'granted' || !saved);
    try { setClosedSeen(localStorage.getItem('monthClose') === now.y + '-' + now.m); } catch (e) { setClosedSeen(false); }
  }, [now]);

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
  // Past days are judged against a normal day's share; today against the same rolling share as the ring.
  const share = (d) => (d.today ? Math.max(1, s.today + s.safe) : allow);
  const w = weekTrend(data, now), m = monthTrend(data, now);
  const recent = exp.filter((t) => t.amount > 0).slice(-6).reverse();
  const pickedItems = pick ? (byKey[pick] || []) : [];
  const ago = !at ? 'Saved copy' : (() => { const m = Math.round((Date.now() - at) / 60000); return m < 1 ? 'Updated just now' : 'Updated ' + m + ' min ago'; })();
  // First three days of a month: how last month closed.
  let close = null;
  if (now.d <= 3 && !closedSeen) {
    const lm = new Date(now.y, now.m - 2, 1), ly = lm.getFullYear(), lmo = lm.getMonth() + 1;
    const spent = monthSpent(data, ly, lmo), budget = totalBudget(data);
    const pre = ly + '-' + pad(lmo) + '-';
    const income = (data.transactions || []).filter((t) => t.type === 'Income' && t.date.startsWith(pre)).reduce((a, t) => a + t.amount, 0);
    const byCat = {};
    netExpenses(data).filter((t) => t.date.startsWith(pre)).forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    close = { name: MONTHS[lmo - 1], spent, budget, kept: income ? Math.round(((income - spent) / income) * 100) : null, top };
  }
  const dismissClose = () => { setClosedSeen(true); try { localStorage.setItem('monthClose', now.y + '-' + now.m); } catch (e) {} };

  const askPush = async () => {
    const r = await enablePush();
    setPushMsg(r === 'ok' ? 'Notifications on. A test is on its way.' : r);
    if (r === 'ok') setPushNeeded(false);
  };
  const toggle = (p) => setPanel(panel === p ? null : p);

  return (
    <Shell>
      <div className="row">
        <div style={{ minWidth: 0 }}>
          <div className="small muted">{WEEKDAYS[(today.getDay() + 6) % 7]}, {MONTHS[now.m - 1].slice(0, 3)} {now.d}</div>
          <h1 className="h1">Today</h1>
          <div style={{ fontSize: 11, whiteSpace: 'nowrap', color: offline ? 'var(--ahead)' : '#8A93A6' }} data-tick={tick}>{offline ? 'Offline · ' + ago.replace('Updated', 'last updated') : ago}</div>
        </div>
        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
          {review > 0 && <Link href="/review" className="chip warn" style={{ whiteSpace: 'nowrap', padding: '0 12px' }}>{review} to review</Link>}
          <Link href="/search" className="iconbtn" aria-label="Search transactions">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </Link>
          <button className="iconbtn" onClick={openAdd} aria-label="Add a payment" style={{ background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)', fontSize: 22, fontWeight: 800 }}>+</button>
          {pushNeeded && (
            <button className="iconbtn" onClick={askPush} aria-label="Turn on notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            </button>
          )}
        </div>
      </div>
      {pushMsg && <div className="small" style={{ color: 'var(--under)' }}>{pushMsg}</div>}

      {close && (
        <div className="glass card strong" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderRadius: 22 }}>
          <div className="row"><b>{close.name} closed</b><button className="chip" style={{ minHeight: 44, padding: '0 14px', fontSize: 12 }} onClick={dismissClose}>Got it</button></div>
          <div style={{ fontSize: 24, fontWeight: 800, color: close.spent > close.budget ? 'var(--over)' : 'var(--under)' }}>{peso(close.spent)} <span className="small muted" style={{ fontWeight: 600 }}>of {peso(close.budget)}</span></div>
          <div className="small muted">{close.spent > close.budget ? peso(close.spent - close.budget) + ' over budget' : peso(close.budget - close.spent) + ' under budget'}{close.kept !== null ? ' · kept ' + close.kept + '% of income' : ''}{close.top ? ' · most on ' + close.top[0] + ' (' + peso(close.top[1]) + ')' : ''}</div>
        </div>
      )}

      {gaps.map((g) => (
        <button key={g.id} onClick={() => askMoney(`${peso(Math.abs(g.amount))} ${g.amount < 0 ? 'left' : 'came into'} ${g.account} between ${labelOf(g.from.slice(0, 10))} and ${labelOf(g.to.slice(0, 10))} without a transaction (gap ${g.id}). It was `)}
          className="press" style={{ textAlign: 'left', padding: '12px 16px', borderRadius: 20, border: '1px solid rgba(255,138,61,0.5)', background: 'rgba(255,138,61,0.14)', color: '#FFB27D', fontSize: 13, lineHeight: 1.45, cursor: 'pointer' }}>
          <b>{g.account}: {peso(Math.abs(g.amount))} {g.amount < 0 ? 'not tracked' : 'extra'}</b> between {labelOf(g.from.slice(0, 10)).slice(5)} and {labelOf(g.to.slice(0, 10)).slice(5)}. Tap to tell Moni what it was.
        </button>
      ))}

      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 2px' }}>
        {/* One state for the ring and the number: orange as soon as today is over its share. */}
        <Ring size={210} r={52} width={12} pct={s.used} color={!ok || s.used >= 1 ? 'var(--over)' : 'var(--under)'} burst={ok} label={peso(s.before + s.today) + ' of ' + peso(s.week) + ' used this week'}>
          <div className="small muted">{ok ? 'Safe to spend' : 'Over today'}</div>
          <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.05, color: ok ? undefined : 'var(--over)' }}>{ok ? <CountUp value={s.safe} format={peso} /> : peso(-s.safe)}</div>
          <div className="small muted">{s.left >= 0 ? peso(s.left) + ' left this week' : peso(-s.left) + ' over this week'}</div>
        </Ring>
      </div>
      {s.planned > 0 && <button onClick={() => { const el = document.getElementById('coming-up'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} style={{ alignSelf: 'center', marginTop: -6, minHeight: 36, border: 0, background: 'transparent', color: '#C38BFF', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{peso(s.planned)} planned ›</button>}

      <div className="glass" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 6px', borderRadius: 22 }}>
        {week.map((d, i) => (
          <button key={d.k} disabled={d.future} onClick={() => setPick(pick === d.k ? null : d.k)} aria-label={labelOf(d.k) + (d.future ? '' : ', ' + peso(d.spent))} aria-pressed={pick === d.k}
            className="press" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 5px', borderRadius: 14, border: 0, cursor: d.future ? 'default' : 'pointer', background: pick === d.k ? 'rgba(255,255,255,0.18)' : d.today ? 'rgba(255,255,255,0.08)' : 'transparent' }}>
            <Ring size={36} delay={i * 0.05} pct={d.spent / share(d)} full={!d.future && d.spent === 0} color={d.spent > share(d) ? 'var(--over)' : 'var(--under)'} track={d.future ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.14)'} />
            <span style={{ fontSize: 11, fontWeight: 700, color: d.future ? 'var(--dim)' : 'var(--muted)' }}>{d.l}</span>
          </button>
        ))}
      </div>

      <div className="row" style={{ padding: '0 4px', fontSize: 13 }}>
        <button onClick={() => toggle('trend')} aria-expanded={panel === 'trend'} style={{ whiteSpace: 'nowrap', border: 0, background: 'transparent', padding: '8px 0', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>
          Wk <b style={{ color: 'var(--ink)' }}>{k(w.cur)}</b> <b><Delta p={w.pct} quiet={w.prev < 300} /></b> · Mo <b style={{ color: 'var(--ink)' }}>{k(m.cur)}</b> <b><Delta p={m.pct} quiet={now.d < 4} /></b> {panel === 'trend' ? '▴' : '▾'}
        </button>
        <button onClick={() => toggle('month')} aria-expanded={panel === 'month'} style={{ border: 0, background: 'transparent', padding: '8px 0', cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>
          {panel === 'month' ? 'Hide' : 'Calendar ›'}
        </button>
      </div>
      {panel === 'trend' && <TrendPanel data={data} now={now} />}
      {panel === 'month' && <MonthCalendar data={data} now={now} picked={pick && (Number(pick.slice(0, 4)) + '-' + Number(pick.slice(5, 7)) + '-' + Number(pick.slice(8, 10)))} onPick={(y, mo, d) => setPick(dayKey(y, mo, d))} />}

      <ComingUp data={data} now={now} />

      <div key={pick || 'recent'} className="glass card strong rise" style={{ display: 'flex', flexDirection: 'column', gap: 9, borderRadius: 24 }}>
        <div className="row">
          <span className="small" style={{ fontWeight: 700, color: 'var(--muted)' }}>{pick ? labelOf(pick) + ' · ' + peso(sum(pickedItems)) : 'Recent'}</span>
          {pick && <button className="chip" style={{ minHeight: 32, padding: '0 12px', fontSize: 12 }} onClick={() => setPick(null)}>Recent</button>}
        </div>
        {pick && pickedItems.length === 0 && <div className="small muted">No spend.</div>}
        {(pick ? pickedItems : recent).map((t, i) => (
          <button key={i} className="row press" onClick={() => t.row && openTx(t)} style={{ fontSize: 14, width: '100%', border: 0, background: 'transparent', padding: '2px 0', textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.merchant} <span className="muted small">· {pick ? t.category : labelOf(t.date.slice(0, 10)).slice(0, 3) + ' ' + t.date.slice(8, 10)}</span></span>
            <span style={{ fontWeight: 700, color: t.amount < 0 ? 'var(--under)' : undefined }}>{t.amount < 0 ? '−' + peso(-t.amount) : peso(t.amount)}</span>
          </button>
        ))}
      </div>
    </Shell>
  );
}
