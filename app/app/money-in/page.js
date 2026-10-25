'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Shell, { Loading } from '../../components/Shell';
import useData from '../../components/useData';
import useToday from '../../components/useToday';
import { openTx } from '../../components/apply';
import { peso, pad, netExpenses } from '../../lib/money';
import { ACCOUNT_COLORS, accountOf, direction, kindLabel, rowName, weekLabel, exact } from '../../lib/flow';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const FROM_COLORS = ['#3DDC97', '#C38BFF', '#4D7CFF', '#FF8A3D', '#5ECFD1'];

// Every peso that came in during a month, across all accounts. Moving your own money between accounts isn't counted.
export default function MoneyIn() {
  const { data, error } = useData();
  const now = useToday();
  const [back, setBack] = useState(0); // months before this one
  const [small, setSmall] = useState(false);

  const view = useMemo(() => {
    if (!data) return null;
    const d = new Date(now.y, now.m - 1 - back, 1);
    const y = d.getFullYear(), m = d.getMonth() + 1, prefix = y + '-' + pad(m) + '-';
    const rows = (data.transactions || []).filter((t) => t.date.startsWith(prefix) && direction(t) === 'in').sort((a, b) => (a.date < b.date ? 1 : -1));
    const moved = (data.transactions || []).filter((t) => t.date.startsWith(prefix) && direction(t) === 'move' && /In|Income/.test(t.type)).reduce((a, t) => a + t.amount, 0);
    const total = rows.reduce((a, t) => a + t.amount, 0);
    const earned = rows.filter((t) => t.type !== 'Refund').reduce((a, t) => a + t.amount, 0);
    const spent = netExpenses(data).filter((t) => t.date.startsWith(prefix)).reduce((a, t) => a + t.amount, 0);
    const payers = {};
    rows.forEach((t) => { const k = t.type === 'Refund' ? 'Refunds and cashback' : rowName(t); payers[k] = (payers[k] || 0) + t.amount; });
    const from = Object.entries(payers).sort((a, b) => b[1] - a[1]);
    const byAcct = {};
    rows.forEach((t) => { const a = accountOf(t.source); byAcct[a] = (byAcct[a] || 0) + t.amount; });
    const oldest = (data.transactions || []).reduce((a, t) => (t.date < a ? t.date : a), '9999');
    return { y, m, rows, moved, total, earned, spent, from, byAcct: Object.entries(byAcct).sort((a, b) => b[1] - a[1]), canBack: oldest < prefix };
  }, [data, now.y, now.m, back]);

  if (!data || !view) return <Shell tabs={false}><Loading error={error} /></Shell>;
  const { y, m, rows, moved, total, earned, spent, from, byAcct, canBack } = view;
  const kept = earned - spent;
  const top = from.slice(0, 5);
  const rest = from.slice(5).reduce((a, [, v]) => a + v, 0);
  const colorOf = (k, i) => (k === 'Refunds and cashback' ? 'var(--ahead)' : FROM_COLORS[i % FROM_COLORS.length]);
  // Tiny cashbacks crowd the list: folded into one line per week unless opened.
  const isSmall = (t) => t.type === 'Refund' && t.amount < 50;
  const groups = [];
  rows.forEach((t) => { const g = weekLabel(t.date, now); if (!groups.length || groups[groups.length - 1].label !== g) groups.push({ label: g, list: [] }); groups[groups.length - 1].list.push(t); });
  const day = (t) => new Date(t.date.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <Shell tabs={false} glow="b">
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <Link href="/networth" className="iconbtn" aria-label="Back to Worth">‹</Link>
        <h1 className="h1" style={{ flex: 1 }}>Money in</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="iconbtn" style={{ width: 40, height: 40, fontSize: 16 }} disabled={!canBack} onClick={() => setBack(back + 1)} aria-label="Month before">‹</button>
          <b className="small" style={{ minWidth: 34, textAlign: 'center' }}>{MONTHS[m - 1].slice(0, 3)}</b>
          <button className="iconbtn" style={{ width: 40, height: 40, fontSize: 16, opacity: back ? 1 : 0.35 }} disabled={!back} onClick={() => setBack(back - 1)} aria-label="Month after">›</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 2px 0' }}>
        <span className="small muted">All accounts, {MONTHS[m - 1]}{y !== now.y ? ' ' + y : ''}</span>
        <span className="big" style={{ color: total ? 'var(--under)' : 'var(--dim)' }}>{total ? '+' : ''}{peso(total)}</span>
        {earned > 0 && <span className="small muted">{peso(spent)} spent, so {kept >= 0 ? peso(kept) + ' kept (' + Math.round((kept / earned) * 100) + '%)' : peso(-kept) + ' more out than in'}</span>}
      </div>

      {from.length > 0 && (
        <div className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="small muted">Where it came from</span>
          <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
            {top.map(([k, v], i) => <span key={k} className="grow" style={{ flex: v, transformOrigin: 'left', background: colorOf(k, i) }} />)}
            {rest > 0 && <span style={{ flex: rest, background: 'var(--dim)' }} />}
          </div>
          {top.map(([k, v], i) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: colorOf(k, i) }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span><b>{peso(v)}</b>
            </div>
          ))}
          {rest > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}><span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--dim)' }} /><span style={{ flex: 1 }}>Everyone else</span><b>{peso(rest)}</b></div>}
          {moved > 0 && <span className="small muted">⇄ {peso(moved)} moved between your own accounts isn't counted.</span>}
        </div>
      )}

      {byAcct.length > 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, byAcct.length)}, minmax(0, 1fr))`, gap: 8 }}>
          {byAcct.slice(0, 3).map(([a, v]) => (
            <Link key={a} href={'/account/' + encodeURIComponent(a)} className="glass card press" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 12, borderRadius: 20, textDecoration: 'none' }}>
              <span className="small muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: ACCOUNT_COLORS[a] || '#8A93A6' }} />{a}</span>
              <b style={{ fontSize: 15 }}>{peso(v)}</b>
            </Link>
          ))}
        </div>
      )}

      {rows.length === 0 && <div className="glass card small muted" style={{ textAlign: 'center', padding: 24 }}>Nothing came in this month yet.</div>}

      {groups.map((g) => {
        const big = g.list.filter((t) => small || !isSmall(t));
        const tiny = g.list.filter((t) => !small && isSmall(t));
        return (
          <div key={g.label} className="glass card strong rise" style={{ display: 'flex', flexDirection: 'column', gap: 4, borderRadius: 22 }}>
            <div className="row small" style={{ fontWeight: 700, color: 'var(--muted)' }}><span>{g.label}</span><span style={{ color: 'var(--under)' }}>+{peso(g.list.reduce((a, t) => a + t.amount, 0))}</span></div>
            {big.map((t) => (
              <button key={t.row} onClick={() => openTx(t)} className="row press" style={{ width: '100%', border: 0, background: 'transparent', padding: '6px 0', textAlign: 'left', cursor: 'pointer', fontSize: 14 }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rowName(t)}</span>
                  <span className="small muted">{kindLabel(t)} · {accountOf(t.source)} · {day(t)}</span>
                </span>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--under)' }}>+{exact(t.amount)}</span>
              </button>
            ))}
            {tiny.length > 0 && <button className="chip" onClick={() => setSmall(true)} style={{ marginTop: 4, minHeight: 40 }}>Show {tiny.length} small {tiny.length === 1 ? 'cashback' : 'cashbacks'} · +{peso(tiny.reduce((a, t) => a + t.amount, 0))}</button>}
          </div>
        );
      })}
    </Shell>
  );
}
