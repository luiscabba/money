'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Shell, { Loading } from '../components/Shell';
import Ring from '../components/Ring';
import useData from '../components/useData';
import { enablePush } from '../components/SW';
import TrendPills from '../components/TrendPills';
import SafeCard from '../components/SafeCard';
import CountUp from '../components/CountUp';
import { peso, MONTHS, WEEKDAYS, manilaNow, daysIn, weekdayOf, allowanceFor, expensesByDay, sum, monthSpent, totalBudget, needsReview } from '../lib/money';

export default function Today() {
  const { data, error } = useData();
  const now = useMemo(() => manilaNow(), []);
  const [ym, setYm] = useState({ y: now.y, m: now.m });
  const [sel, setSel] = useState(now.d);
  const [pushMsg, setPushMsg] = useState('');
  const [pushNeeded, setPushNeeded] = useState(false);
  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem('pushSaved'); } catch (e) {}
    setPushNeeded(typeof Notification === 'undefined' || Notification.permission !== 'granted' || !saved);
  }, []);

  if (!data) return <Shell><Loading error={error} /></Shell>;

  const isNow = ym.y === now.y && ym.m === now.m;
  const lastDay = isNow ? now.d : daysIn(ym.y, ym.m);
  const allow = allowanceFor(data, ym.y, ym.m);
  const byDay = expensesByDay(data, ym.y, ym.m);
  const n = daysIn(ym.y, ym.m);
  const lead = weekdayOf(ym.y, ym.m, 1);
  let under = 0;
  for (let d = 1; d <= lastDay; d++) if (sum(byDay[d] || []) <= allow) under++;
  const spentMonth = monthSpent(data, ym.y, ym.m);
  const review = needsReview(data).length;

  const its = byDay[sel] || [];
  const s = sum(its);
  const over = s > allow;
  const selColor = over ? 'var(--over)' : 'var(--under)';

  const shift = (k) => {
    const d = new Date(ym.y, ym.m - 1 + k, 1);
    const y = d.getFullYear(), m = d.getMonth() + 1;
    if (y > now.y || (y === now.y && m > now.m)) return;
    setYm({ y, m });
    setSel(y === now.y && m === now.m ? now.d : daysIn(y, m));
  };

  const askPush = async () => {
    const r = await enablePush();
    setPushMsg(r === 'ok' ? 'Notifications on. A test is on its way.' : r);
    if (r === 'ok') setPushNeeded(false);
  };

  return (
    <Shell>
      <div className="row">
        <div className="row" style={{ gap: 6 }}>
          <button className="iconbtn" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
          <h1 className="h1">{MONTHS[ym.m - 1]}</h1>
          {!isNow && <button className="iconbtn" onClick={() => shift(1)} aria-label="Next month">›</button>}
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
      <div className="small muted">{under} of {lastDay} days under · {peso(spentMonth)} of {peso(totalBudget(data))}</div>
      {isNow && <SafeCard data={data} now={now} />}
      {isNow && <TrendPills data={data} now={now} />}

      <div className="glass card" style={{ padding: '12px 8px', borderRadius: 26 }}>
        <div className="grid7 small muted" style={{ textAlign: 'center', fontWeight: 700, fontSize: 11, marginBottom: 4 }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <div key={i}>{x}</div>)}
        </div>
        <div className="grid7" style={{ gap: 2 }}>
          {Array.from({ length: lead }).map((_, i) => <div key={'b' + i} />)}
          {Array.from({ length: n }).map((_, i) => {
            const d = i + 1;
            const future = d > lastDay;
            const ds = sum(byDay[d] || []);
            return (
              <button key={d} className={'day' + (d === sel ? ' sel' : '')} disabled={future} onClick={() => setSel(d)} aria-label={MONTHS[ym.m - 1] + ' ' + d + (future ? '' : ', ' + peso(ds))}>
                <Ring size={34} delay={d * 0.025} pct={ds / allow} full={!future && ds === 0} color={ds > allow ? 'var(--over)' : 'var(--under)'} track={future ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)'} />
                <span>{d}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div key={ym.m + '-' + sel} className="glass card strong rise" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 200 }}>
        <div className="row" style={{ justifyContent: 'flex-start', gap: 16 }}>
          <Ring size={104} r={50} width={14} pct={s / allow} full={s === 0} color={selColor} label={'Spent ' + peso(s) + ' of ' + peso(allow)}>
            <div className="small muted" style={{ fontWeight: 700 }}>{Math.round((s / allow) * 100)}%</div>
          </Ring>
          <div>
            <div className="small muted">{WEEKDAYS[weekdayOf(ym.y, ym.m, sel)]}, {MONTHS[ym.m - 1].slice(0, 3)} {sel}{isNow && sel === now.d ? ' · today' : ''}</div>
            <div className="big"><CountUp value={s} format={peso} ms={450} /></div>
            <div className="small" style={{ color: selColor }}>{over ? peso(s - allow) + ' over' : s === 0 ? 'No spend' : peso(allow - s) + ' under'} · {peso(allow)} a day</div>
          </div>
        </div>
        <div className="list">
          {its.map((t, i) => (
            <div key={i} className="row"><span>{t.merchant} <span className="muted small">· {t.category}</span></span><span>{peso(t.amount)}</span></div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
