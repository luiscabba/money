'use client';
import useToday from '../../components/useToday';
import { useMemo, useState } from 'react';
import Shell, { Loading } from '../../components/Shell';
import useData from '../../components/useData';
import CountUp from '../../components/CountUp';
import Seg from '../../components/Seg';
import WorthSwitch from '../../components/WorthSwitch';
import Link from 'next/link';
import { earnedIn, colorOf } from '../../lib/flow';
import { peso, usd, manilaNow, pad, netExpenses, appWallets, daysIn, totalBudget } from '../../lib/money';

export default function NetWorth() {
  const { data, error } = useData();
  const now = useToday();
  const sel = -1;
  const [span, setSpan] = useState('30');
  if (!data) return <Shell glow="a"><Loading error={error} /></Shell>;

  const acc = (data.netWorth.accounts || []).filter((a) => a.php > 0)
    .concat(appWallets(data).filter((w) => w.php > 0).map((w) => ({ name: w.name, currency: 'PHP', balance: w.php, php: w.php, asOf: w.asOf })));
  const total = acc.reduce((a, x) => a + x.php, 0);
  const cash = acc.filter((a) => a.name !== 'IBKR').reduce((a, x) => a + x.php, 0);
  const prefix = now.y + '-' + pad(now.m) + '-';
  const mtx = data.transactions.filter((t) => t.date.startsWith(prefix));
  // Income plus money people sent (family included); moving your own money between accounts doesn't count.
  const income = earnedIn(data, prefix);
  const spent = netExpenses(data).filter((t) => t.date.startsWith(prefix)).reduce((a, t) => a + t.amount, 0);
  const kept = income ? Math.round(((income - spent) / income) * 100) : null;
  const invested = (acc.find((a) => a.name === 'IBKR') || {}).php || 0;
  const budget = totalBudget(data);
  const pace = Math.round((spent / now.d) * daysIn(now.y, now.m));
  const forGoals = (data.goalPlan && data.goalPlan.tagged) || 0;
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
    trend = { line, area: X(0) + ',82 ' + line + ' ' + X(tl.length - 1) + ',82', change: tl[tl.length - 1].total - tl[0].total, points: tl.length, first: tl[0].date, end: [X(tl.length - 1), Y(tl[tl.length - 1].total)] };
  }
  const stale = acc.filter((a) => a.name !== 'IBKR' && a.asOf && (Date.now() - new Date(a.asOf).getTime()) / 86400000 > 30).map((a) => a.name);

  const C = 2 * Math.PI * 100;
  let start = 0;
  const segs = acc.map((a, i) => {
    const len = (C * a.php) / total;
    const vis = Math.max(len - 3, 1.5);
    const s = { color: colorOf(a.name), dash: vis + ' ' + (C - vis), off: -start, op: sel === -1 || sel === i ? 1 : 0.25 };
    start += len;
    return s;
  });
  const cur = sel >= 0 ? acc[sel] : null;

  return (
    <Shell glow="a">
      <div className="row" style={{ alignItems: 'baseline' }}>
        <h1 className="h1">Worth</h1>
        <div className="small muted">{prev !== null ? (total - prev >= 0 ? '+' : '−') + peso(Math.abs(total - prev)) + ' ' + sinceLabel(prevRow.date) : 'tracking since ' + (hist[0] ? hist[0].date.slice(5) : 'today')}</div>
      </div>

      <WorthSwitch on="accounts" />

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
          {trend.points < 5 && <div className="small muted" style={{ padding: '0 4px' }}>Fills in as days are recorded.</div>}
          <svg width="100%" viewBox="0 0 334 84" role="img" aria-label={'Net worth over the last ' + span + ' days'}>
            <polygon className="fadein" points={trend.area} fill="rgba(77,124,255,0.16)" />
            <polyline key={span} className="draw" pathLength="1" points={trend.line} fill="none" stroke="#4D7CFF" strokeWidth="2.6" strokeLinejoin="round" />
            <circle cx={trend.end[0]} cy={trend.end[1]} r="4" fill="#4D7CFF" stroke="#0B0D10" strokeWidth="2" />
          </svg>
        </div>
      )}

      <div className="glass card strong" style={{ padding: 6, display: 'flex', flexDirection: 'column' }}>
        {acc.map((a) => (
          <Link key={a.name} href={a.name === 'IBKR' ? '/invest' : '/account/' + encodeURIComponent(a.name)} className="press"
            style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 46, padding: '0 8px 0 12px', borderRadius: 16, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: colorOf(a.name) }} />
            <span style={{ flex: 1, textAlign: 'left' }}>{a.name}</span>
            <span className="muted" style={{ fontWeight: 500 }}>{(a.php / total) * 100 < 1 ? '<1' : Math.round((a.php / total) * 100)}%</span>
            <span style={{ minWidth: 86, textAlign: 'right' }}>{peso(a.php)}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5C6370" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        <Stat href="/money-in" label="Savings rate" value={kept === null ? '–' : kept + '%'} sub={income ? peso(Math.max(0, income - spent)) + ' kept of ' + peso(income) + ' in' : 'Nothing came in yet this month'} pct={kept === null ? null : Math.max(0, kept) / 100} color="var(--under)" />
        <Stat label="Invested" value={total ? Math.round((invested / total) * 100) + '%' : '–'} sub={peso(invested) + ' in IBKR'} pct={total ? invested / total : null} color="#F0974F" />
        <Stat label={MONTH_NAMES[now.m - 1] + ' pace'} value={peso(pace)} valueColor={pace > budget ? 'var(--over)' : undefined} sub={pace > budget ? peso(pace - budget) + ' over the ' + peso(budget) + ' budget' : peso(budget - pace) + ' under the ' + peso(budget) + ' budget'} pct={budget ? Math.min(1, pace / Math.max(pace, budget)) : null} mark={budget && pace > budget ? budget / pace : null} color={pace > budget ? 'var(--over)' : 'var(--under)'} />
        <Stat label="For goals" value={peso(forGoals)} sub="Set aside in Maya" pct={cash ? Math.min(1, forGoals / cash) : null} color="#C38BFF" />
      </div>
      {stale.length > 0 && <div className="small" style={{ color: 'var(--ahead)' }}>Update {stale.join(', ')}: last balance is over 30 days old.</div>}
    </Shell>
  );
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// One small metric: label, value, an optional bar (with a tick where a limit sits), and a line under it.
function Stat({ label, value, sub, pct, color, mark, valueColor, href }) {
  const Box = href ? Link : 'div';
  return (
    <Box href={href} className={'glass card' + (href ? ' press' : '')} style={{ display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none' }}>
      <div className="small muted" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>{label}{href && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: valueColor }}>{value}</div>
      {pct !== null && pct !== undefined && (
        <div aria-hidden="true" style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.12)' }}>
          <div style={{ width: Math.max(2, Math.round(pct * 100)) + '%', height: 6, borderRadius: 3, background: color }} />
          {mark && <div style={{ position: 'absolute', left: Math.round(mark * 100) + '%', top: -3, width: 2, height: 12, background: 'var(--ink)' }} />}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</div>
    </Box>
  );
}
