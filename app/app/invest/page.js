'use client';
import { useState } from 'react';
import Shell, { Loading } from '../../components/Shell';
import useData from '../../components/useData';
import Seg from '../../components/Seg';
import CountUp from '../../components/CountUp';
import InvestChart from '../../components/InvestChart';
import { peso, usd } from '../../lib/money';

const SLEEVES = [
  { key: 'Beta', target: 0.7, color: '#4D7CFF', r: 56, picks: ['SPYL'] },
  { key: 'Alpha', target: 0.2, color: '#FF8A3D', r: 41, picks: ['GOOGL', 'MSFT'] },
  { key: 'Asymmetric', target: 0.1, color: '#C38BFF', r: 26, picks: ['ETH'] }
];
const askMoney = (text) => window.dispatchEvent(new CustomEvent('money:ask', { detail: text }));

export default function Invest() {
  const { data, error } = useData();
  const [cur, setCur] = useState('usd');
  if (!data) return <Shell glow="d"><Loading error={error} /></Shell>;

  const fx = (data.netWorth || {}).usdphp || 0;
  const money = (v) => (cur === 'usd' ? usd(v) : peso(v * fx));
  const hold = (data.holdings || []).filter((h) => h.usd > 0);
  const invested = hold.filter((h) => h.symbol !== 'CASH');
  const total = hold.reduce((a, h) => a + h.usd, 0);
  const value = invested.reduce((a, h) => a + h.usd, 0);
  const cost = invested.reduce((a, h) => a + h.cost, 0);
  const cash = total - value;
  const bySleeve = {};
  invested.forEach((h) => { bySleeve[h.sleeve] = (bySleeve[h.sleeve] || 0) + h.usd; });
  const hist = data.investHistory || [];
  // Deposited comes from IBKR's deposit history; until that loads, fall back to what the positions cost.
  const lastDep = hist.slice().reverse().find((h) => h.deposited !== null && h.deposited !== undefined);
  const deposited = lastDep ? lastDep.deposited : null;
  const base = deposited !== null ? deposited : cost + cash;
  const totalGain = total - base;
  const dayChange = invested.reduce((a, h) => a + h.qty * (h.price - (h.prev || h.price)), 0);
  const dayBase = value - dayChange;
  const tick = (v) => (cur === 'usd' ? '$' + Math.round(v).toLocaleString('en-US') : '₱' + Math.round((v * fx) / 1000) + 'k');

  if (!hold.length) {
    const ibkr = ((data.netWorth || {}).accounts || []).find((a) => a.name === 'IBKR');
    return (
      <Shell glow="d">
        <h1 className="h1">Invest</h1>
        <div className="glass card strong" style={{ borderRadius: 24 }}>
          <div className="small muted">IBKR</div>
          <div style={{ fontSize: 38, fontWeight: 800 }}>{ibkr ? usd(ibkr.balance) : '–'}</div>
          <div className="small muted">Add your positions to see your 70/20/10 mix and how it has grown.</div>
        </div>
        <button className="btn" onClick={() => askMoney('Here are my IBKR positions: ')}>Add positions with Moni</button>
      </Shell>
    );
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
          {deposited !== null ? 'Deposited' : 'Cost + cash'} <b style={{ color: 'var(--ink)' }}>{money(base)}</b> · {totalGain >= 0 ? 'up' : 'down'} <b style={{ color: totalGain >= 0 ? 'var(--under)' : 'var(--over)' }}>{money(Math.abs(totalGain))} ({base ? (totalGain >= 0 ? '+' : '−') + Math.abs((totalGain / base) * 100).toFixed(1) : 0}%)</b>
        </div>
        <div className="small muted">Invested {money(value)}{cash > 0.5 ? ' · Cash ' + money(cash) : ''}</div>
      </div>

      <div className="glass card" style={{ borderRadius: 24, padding: '12px 10px 10px' }}>
        <InvestChart history={hist} money={money} tick={tick} live={total} />
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        <div className="glass card"><div className="small muted">Day change</div><div style={{ fontSize: 20, fontWeight: 800, color: dayChange >= 0 ? 'var(--under)' : 'var(--over)' }}>{dayChange >= 0 ? '+' : '−'}{money(Math.abs(dayChange))} <span style={{ fontSize: 13 }}>{dayBase ? (dayChange >= 0 ? '+' : '−') + Math.abs((dayChange / dayBase) * 100).toFixed(1) + '%' : ''}</span></div></div>
        <div className="glass card"><div className="small muted">USD/PHP</div><div style={{ fontSize: 20, fontWeight: 800 }}>{fx ? fx.toFixed(2) : '–'}</div></div>
      </div>
    </Shell>
  );
}
