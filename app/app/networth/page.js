'use client';
import { useMemo, useState } from 'react';
import Shell, { Loading } from '../../components/Shell';
import useData from '../../components/useData';
import CountUp from '../../components/CountUp';
import Seg from '../../components/Seg';
import { peso, usd, manilaNow, avgMonthlySpend, pad, netExpenses } from '../../lib/money';

const COLORS = { Maya: '#4D7CFF', IBKR: '#FF8A3D', BPI: '#3DDC97', GoTyme: '#C38BFF', GCash: '#A3ABBA' };

export default function NetWorth() {
  const { data, error } = useData();
  const now = useMemo(() => manilaNow(), []);
  const [sel, setSel] = useState(-1);
  const [span, setSpan] = useState('30');
  if (!data) return <Shell glow="a"><Loading error={error} /></Shell>;

  const acc = (data.netWorth.accounts || []).filter((a) => a.php > 0);
  const total = acc.reduce((a, x) => a + x.php, 0);
  const cash = acc.filter((a) => a.name !== 'IBKR').reduce((a, x) => a + x.php, 0);
  const avg = avgMonthlySpend(data, now);
  const runway = avg ? cash / avg : 0;
  const prefix = now.y + '-' + pad(now.m) + '-';
  const mtx = data.transactions.filter((t) => t.date.startsWith(prefix));
  const income = mtx.filter((t) => t.type === 'Income').reduce((a, t) => a + t.amount, 0);
  const spent = netExpenses(data).filter((t) => t.date.startsWith(prefix)).reduce((a, t) => a + t.amount, 0);
  const kept = income ? Math.round(((income - spent) / income) * 100) : null;
  const hist = data.netWorth.history || [];
  const prevRow = hist.length > 1 ? hist[hist.length - 2] : null;
  const prev = prevRow ? prevRow.total : null;
  const sinceLabel = (d) => {
    const days = Math.round((new Date(now.y, now.m - 1, now.d) - new Date(d + 'T00:00:00')) / 86400000);
    return days <= 1 ? 'since yesterday' : days < 7 ? 'since ' + new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }) : 'since ' + new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  // Trend: total net worth per saved day, last 30 or 90 days.
  const cut = new Date(Date.now() - Number(span) * 86400000).toISOString().slice(0, 10);
  const tl = hist.filter((h) => h.total > 0 && h.date >= cut);
  let trend = null;
  if (tl.length >= 2) {
    const lo = Math.min(...tl.map((h) => h.total)), hi = Math.max(...tl.map((h) => h.total));
    const padv = (hi - lo || hi * 0.02) * 0.15;
    const X = (i) => 4 + (i / (tl.length - 1)) * 326, Y = (v) => 6 + (1 - (v - lo + padv) / (hi - lo + 2 * padv)) * 70;
    const line = tl.map((h, i) => X(i).toFixed(1) + ',' + Y(h.total).toFixed(1)).join(' ');
    trend = { line, area: X(0) + ',82 ' + line + ' ' + X(tl.length - 1) + ',82', change: tl[tl.length - 1].total - tl[0].total, first: tl[0].date, end: [X(tl.length - 1), Y(tl[tl.length - 1].total)] };
  }
  const stale = acc.filter((a) => a.name !== 'IBKR' && a.asOf && (Date.now() - new Date(a.asOf).getTime()) / 86400000 > 30).map((a) => a.name);

  const C = 2 * Math.PI * 100;
  let start = 0;
  const segs = acc.map((a, i) => {
    const len = (C * a.php) / total;
    const vis = Math.max(len - 3, 1.5);
    const s = { color: COLORS[a.name] || '#8A93A6', dash: vis + ' ' + (C - vis), off: -start, op: sel === -1 || sel === i ? 1 : 0.25 };
    start += len;
    return s;
  });
  const cur = sel >= 0 ? acc[sel] : null;

  return (
    <Shell glow="a">
      <div className="row" style={{ alignItems: 'baseline' }}>
        <h1 className="h1">Net Worth</h1>
        <div className="small muted">{prev !== null ? (total - prev >= 0 ? '+' : '−') + peso(Math.abs(total - prev)) + ' ' + sinceLabel(prevRow.date) : 'tracking since ' + (hist[0] ? hist[0].date.slice(5) : 'today')}</div>
      </div>

      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', height: 250 }}>
        <svg width="240" height="240" viewBox="0 0 240 240" role="img" aria-label={'Net worth ' + peso(total) + ' split by account'}>
          <g transform="rotate(-90 120 120)">
            <circle cx="120" cy="120" r="100" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="26" />
            {segs.map((s, i) => <circle key={i} className="ringfill fade" style={{ animationDelay: i * 0.12 + 's' }} cx="120" cy="120" r="100" fill="none" stroke={s.color} strokeWidth="26" strokeDasharray={s.dash} strokeDashoffset={s.off} opacity={s.op} />)}
          </g>
        </svg>
        <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div className="small muted">{cur ? cur.name : 'Total'}</div>
          <div style={{ fontSize: 30, fontWeight: 800 }}><CountUp value={cur ? cur.php : total} format={peso} ms={500} /></div>
          <div className="small muted">{cur ? (cur.currency === 'USD' ? usd(cur.balance) : Math.round((cur.php / total) * 100) + '% of total') : 'all accounts'}</div>
        </div>
      </div>

      {trend && (
        <div className="glass card" style={{ borderRadius: 24, padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="row" style={{ padding: '0 4px' }}>
            <div className="small"><span className="muted">{span} days </span><b style={{ color: trend.change >= 0 ? 'var(--under)' : 'var(--over)' }}>{trend.change >= 0 ? '+' : '−'}{peso(Math.abs(trend.change))}</b></div>
            <Seg label="Span" options={[['30', '30D'], ['90', '90D']]} value={span} onChange={setSpan} minWidth={44} />
          </div>
          <svg width="100%" viewBox="0 0 334 84" role="img" aria-label={'Net worth over the last ' + span + ' days'}>
            <polygon className="fadein" points={trend.area} fill="rgba(77,124,255,0.16)" />
            <polyline key={span} className="draw" pathLength="1" points={trend.line} fill="none" stroke="#4D7CFF" strokeWidth="2.6" strokeLinejoin="round" />
            <circle cx={trend.end[0]} cy={trend.end[1]} r="4" fill="#4D7CFF" stroke="#0B0D10" strokeWidth="2" />
          </svg>
        </div>
      )}

      <div className="glass card strong" style={{ padding: 6, display: 'flex', flexDirection: 'column' }}>
        {acc.map((a, i) => (
          <button key={a.name} onClick={() => setSel(sel === i ? -1 : i)} aria-pressed={sel === i}
            style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 46, padding: '0 12px', border: 0, borderRadius: 16, cursor: 'pointer', fontSize: 15, fontWeight: 700, background: sel === i ? 'rgba(255,255,255,0.14)' : 'transparent' }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: COLORS[a.name] || '#8A93A6' }} />
            <span style={{ flex: 1, textAlign: 'left' }}>{a.name}</span>
            <span className="muted" style={{ fontWeight: 500 }}>{(a.php / total) * 100 < 1 ? '<1' : Math.round((a.php / total) * 100)}%</span>
            <span style={{ minWidth: 86, textAlign: 'right' }}>{peso(a.php)}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        <div className="glass card"><div className="small muted">Cash runway</div><div style={{ fontSize: 22, fontWeight: 800 }}>{runway ? runway.toFixed(1) + ' months' : '–'}</div></div>
        <div className="glass card"><div className="small muted">Kept this month</div><div style={{ fontSize: 22, fontWeight: 800 }}>{kept === null ? '–' : kept + '%'}</div></div>
      </div>
      {stale.length > 0 && <div className="small" style={{ color: 'var(--ahead)' }}>Update {stale.join(', ')}: last balance is over 30 days old.</div>}
    </Shell>
  );
}
