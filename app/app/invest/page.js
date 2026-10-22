'use client';
import { useMemo, useState } from 'react';
import Shell, { Loading } from '../../components/Shell';
import useData from '../../components/useData';
import Seg from '../../components/Seg';
import CountUp from '../../components/CountUp';
import { peso, usd, manilaNow, pad } from '../../lib/money';

const SLEEVES = [
  { key: 'Beta', target: 0.7, color: '#4D7CFF', r: 56, picks: ['SPYL'] },
  { key: 'Alpha', target: 0.2, color: '#FF8A3D', r: 41, picks: ['GOOGL', 'MSFT'] },
  { key: 'Asymmetric', target: 0.1, color: '#C38BFF', r: 26, picks: ['ETH'] }
];
const AMOUNTS = [5000, 10000, 20000];
const askMoney = (text) => window.dispatchEvent(new CustomEvent('money:ask', { detail: text }));

// Splits a new deposit so sleeves move toward 70/20/10 (money only goes to sleeves below target).
function splitDeposit(values, total, depositUsd) {
  const after = total + depositUsd;
  const need = SLEEVES.map((s) => Math.max(0, s.target * after - (values[s.key] || 0)));
  const sum = need.reduce((a, b) => a + b, 0) || 1;
  return SLEEVES.map((s, i) => ({ ...s, usd: (need[i] / sum) * depositUsd }));
}

export default function Invest() {
  const { data, error } = useData();
  const now = useMemo(() => manilaNow(), []);
  const [cur, setCur] = useState('usd');
  const [dep, setDep] = useState(10000);
  if (!data) return <Shell glow="d"><Loading error={error} /></Shell>;

  const fx = (data.netWorth || {}).usdphp || 0;
  const money = (v) => (cur === 'usd' ? usd(v) : peso(v * fx));
  const hold = (data.holdings || []).filter((h) => h.usd > 0);
  const invested = hold.filter((h) => h.symbol !== 'CASH');
  const total = hold.reduce((a, h) => a + h.usd, 0);
  const value = invested.reduce((a, h) => a + h.usd, 0);
  const cost = invested.reduce((a, h) => a + h.cost, 0);
  const gain = value - cost;
  const cash = total - value;
  const bySleeve = {};
  invested.forEach((h) => { bySleeve[h.sleeve] = (bySleeve[h.sleeve] || 0) + h.usd; });
  const split = fx ? splitDeposit(bySleeve, value, dep / fx) : [];
  const prefix = now.y + '-' + pad(now.m) + '-';
  const depositsThisMonth = (data.transactions || []).filter((t) => /Wise\/IBKR/.test(t.merchant) && t.date.startsWith(prefix)).reduce((a, t) => a + t.amount, 0);
  const hist = (data.investHistory || []).filter((h) => h.value > 0);

  if (!hold.length) {
    const ibkr = ((data.netWorth || {}).accounts || []).find((a) => a.name === 'IBKR');
    return (
      <Shell glow="d">
        <h1 className="h1">Invest</h1>
        <div className="glass card strong" style={{ borderRadius: 24 }}>
          <div className="small muted">IBKR</div>
          <div style={{ fontSize: 38, fontWeight: 800 }}>{ibkr ? usd(ibkr.balance) : '–'}</div>
          <div className="small muted">Add your positions to see your 70/20/10 mix, gains and where your next deposit should go.</div>
        </div>
        <button className="btn" onClick={() => askMoney('Here are my IBKR positions: ')}>Add positions with Ask Money</button>
      </Shell>
    );
  }

  // Chart: value against money put in, from the daily snapshots.
  const pts = hist.length >= 2 ? hist : null;
  let chart = null;
  if (pts) {
    const max = Math.max(...pts.map((p) => Math.max(p.value, p.cost))) * 1.06;
    const min = Math.min(...pts.map((p) => Math.min(p.value, p.cost))) * 0.94;
    const X = (i) => 4 + (i / (pts.length - 1)) * 326, Y = (v) => 140 - ((v - min) / (max - min || 1)) * 130;
    const line = (k) => pts.map((p, i) => X(i).toFixed(1) + ',' + Y(p[k]).toFixed(1)).join(' ');
    chart = { val: line('value'), cost: line('cost'), area: X(0) + ',140 ' + line('value') + ' ' + X(pts.length - 1) + ',140', first: pts[0].date.slice(5), last: pts[pts.length - 1].date.slice(5) };
  }

  return (
    <Shell glow="d">
      <div className="row">
        <h1 className="h1">Invest</h1>
        <Seg label="Currency" options={[['usd', 'USD'], ['php', 'PHP']]} value={cur} onChange={setCur} minWidth={52} />
      </div>

      <div>
        <div className="small muted">Worth now</div>
        <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em' }}><CountUp key={cur} value={cur === 'usd' ? total : total * fx} format={cur === 'usd' ? usd : peso} /></div>
        <div className="small muted" style={{ marginTop: 4 }}>
          Put in <b style={{ color: 'var(--ink)' }}>{money(cost)}</b> · {gain >= 0 ? 'up' : 'down'} <b style={{ color: gain >= 0 ? 'var(--under)' : 'var(--over)' }}>{money(Math.abs(gain))} ({cost ? (gain >= 0 ? '+' : '−') + Math.abs((gain / cost) * 100).toFixed(1) : 0}%)</b>
          {cash > 0.5 ? ' · ' + money(cash) + ' cash' : ''}
        </div>
      </div>

      <div className="glass card strong" style={{ display: 'flex', alignItems: 'center', gap: 16, borderRadius: 24 }}>
        <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label="Mix against 70/20/10 target">
          {SLEEVES.map((s, i) => {
            const C = 2 * Math.PI * s.r;
            const a = value ? (bySleeve[s.key] || 0) / value : 0;
            return (
              <g key={s.key} transform="rotate(-90 66 66)">
                <circle cx="66" cy="66" r={s.r} fill="none" stroke={s.color + '2E'} strokeWidth="11" />
                {a > 0 && <circle className="ringfill" style={{ animationDelay: i * 0.15 + 's' }} cx="66" cy="66" r={s.r} fill="none" stroke={s.color} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(C * a).toFixed(1)} ${C.toFixed(1)}`} />}
                <circle cx="66" cy="66" r={s.r} fill="none" stroke="#F2F4F8" strokeWidth="14" strokeDasharray={`2 ${C.toFixed(1)}`} strokeDashoffset={(-C * s.target + 1).toFixed(1)} />
              </g>
            );
          })}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          {SLEEVES.map((s) => {
            const a = value ? (bySleeve[s.key] || 0) / value : 0;
            const off = Math.abs(a - s.target) > 0.025;
            return (
              <div key={s.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}><span style={{ width: 9, height: 9, borderRadius: 5, background: s.color }} />{s.key}</div>
                <div style={{ paddingLeft: 15, color: off ? '#FFB27D' : '#8A93A6' }}>{Math.round(a * 100)}% · target {Math.round(s.target * 100)}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {fx > 0 && (
        <div style={{ padding: 16, borderRadius: 22, background: 'rgba(61,220,151,0.13)', border: '1px solid rgba(61,220,151,0.45)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row">
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--under)', letterSpacing: '0.04em' }}>NEXT DEPOSIT</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {AMOUNTS.map((a) => <button key={a} className={'chip' + (dep === a ? ' on' : '')} style={{ minHeight: 32, padding: '0 10px', fontSize: 12 }} onClick={() => setDep(a)}>₱{a / 1000}k</button>)}
            </div>
          </div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Split {peso(dep)} like this to move toward 70/20/10</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {split.filter((p) => p.usd > 0.5).map((p) => (
              <div key={p.key} className="rise" style={{ flex: Math.max(p.usd, 1), minWidth: 74, padding: '8px 10px', borderRadius: 12, background: p.color, color: '#0B0D10', fontSize: 12, fontWeight: 800 }}>
                <div>{p.picks.join('/')}</div><div>{peso(p.usd * fx)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass card strong" style={{ borderRadius: 24, paddingBottom: 6 }}>
        {invested.sort((a, b) => b.usd - a.usd).map((h) => {
          const g = h.cost ? (h.usd - h.cost) / h.cost : 0;
          return (
            <div key={h.symbol} className="row" style={{ padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div><div style={{ fontSize: 15, fontWeight: 800 }}>{h.symbol}</div><div style={{ fontSize: 12, color: '#8A93A6' }}>{h.sleeve} · {h.qty} @ {usd(h.price)}</div></div>
              <div style={{ textAlign: 'right' }}><div style={{ fontSize: 15, fontWeight: 800 }}>{money(h.usd)}</div><div style={{ fontSize: 12, color: g >= 0 ? 'var(--under)' : 'var(--over)' }}>{g >= 0 ? '+' : '−'}{Math.abs(g * 100).toFixed(1)}%</div></div>
            </div>
          );
        })}
      </div>

      <div className="glass card" style={{ borderRadius: 24, padding: '14px 10px 10px' }}>
        <div className="small muted" style={{ padding: '0 6px 6px' }}>Worth against money put in</div>
        {chart ? (
          <>
            <svg width="100%" viewBox="0 0 334 156" aria-hidden="true">
              <polygon className="fadein" points={chart.area} fill="rgba(61,220,151,0.14)" />
              <polyline points={chart.cost} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeDasharray="4 4" />
              <polyline className="draw" pathLength="1" points={chart.val} fill="none" stroke="var(--under)" strokeWidth="3.5" strokeLinejoin="round" />
              <text x="4" y="154" fill="#8A93A6" fontSize="10">{chart.first}</text>
              <text x="330" y="154" fill="#8A93A6" fontSize="10" textAnchor="end">{chart.last}</text>
            </svg>
            <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--muted)', padding: '2px 6px' }}><span>— Worth</span><span>- - Put in</span></div>
          </>
        ) : <div className="small muted" style={{ padding: '6px 6px 8px' }}>Builds from tonight: one point a day after the 10:39pm close.</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        <div className="glass card"><div className="small muted">Deposited this month</div><div style={{ fontSize: 20, fontWeight: 800 }}>{peso(depositsThisMonth)}</div></div>
        <div className="glass card"><div className="small muted">USD/PHP</div><div style={{ fontSize: 20, fontWeight: 800 }}>{fx ? fx.toFixed(2) : '–'}</div></div>
      </div>
    </Shell>
  );
}
