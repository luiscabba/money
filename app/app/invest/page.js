'use client';
import { useState } from 'react';
import Shell, { Loading } from '../../components/Shell';
import Ring from '../../components/Ring';
import useData from '../../components/useData';
import Seg from '../../components/Seg';
import CountUp from '../../components/CountUp';
import { peso, usd } from '../../lib/money';

const SLEEVES = [
  { key: 'Beta', label: 'Beta · SPYL', target: 0.7, color: '#4D7CFF', r: 64 },
  { key: 'Alpha', label: 'Alpha · GOOGL, MSFT', target: 0.2, color: '#FF8A3D', r: 46 },
  { key: 'Asymmetric', label: 'Asymmetric · ETH', target: 0.1, color: '#C38BFF', r: 28 }
];

export default function Invest() {
  const { data, error } = useData();
  const [inUsd, setInUsd] = useState(true);
  if (!data) return <Shell glow="d"><Loading error={error} /></Shell>;

  const ibkr = (data.netWorth.accounts || []).find((a) => a.name === 'IBKR') || { balance: 0, php: 0 };
  const fx = data.netWorth.usdphp || 0;
  const hold = data.holdings || [];
  const totalHold = hold.reduce((a, h) => a + h.usd, 0);
  const actual = (k) => (totalHold ? hold.filter((h) => h.sleeve === k).reduce((a, h) => a + h.usd, 0) / totalHold : null);
  const deposits = (data.transactions || []).filter((t) => /Wise\/IBKR/.test(t.merchant)).reduce((a, t) => a + t.amount, 0);

  return (
    <Shell glow="d">
      <div className="row">
        <h1 className="h1">Invest</h1>
        <Seg label="Currency" options={[['usd', 'USD'], ['php', 'PHP']]} value={inUsd ? 'usd' : 'php'} onChange={(k) => setInUsd(k === 'usd')} minWidth={52} />
      </div>

      <div className="glass card strong">
        <div className="small muted">IBKR</div>
        <div style={{ fontSize: 38, fontWeight: 800 }}>{inUsd ? <CountUp key="u" value={ibkr.balance} format={usd} /> : <CountUp key="p" value={ibkr.php} format={peso} />}</div>
        <div className="small muted">{inUsd ? peso(ibkr.php) : usd(ibkr.balance)} · as of {ibkr.asOf || '–'}</div>
      </div>

      <div className="glass card strong row" style={{ justifyContent: 'flex-start', gap: 14 }}>
        <div style={{ position: 'relative', width: 150, height: 150 }}>
          {SLEEVES.map((s) => {
            const a = actual(s.key);
            return (
              <div key={s.key} style={{ position: 'absolute', inset: 0 }}>
                <Ring size={150} box={150} r={s.r} width={12} delay={SLEEVES.indexOf(s) * 0.15} pct={a === null ? s.target : a} color={s.color} track={s.color + '2E'} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, flex: 1 }}>
          {SLEEVES.map((s) => {
            const a = actual(s.key);
            return (
              <div key={s.key}>
                <div className="row" style={{ justifyContent: 'flex-start', gap: 8, fontWeight: 700 }}><span style={{ width: 10, height: 10, borderRadius: 5, background: s.color }} />{s.label}</div>
                <div className="muted" style={{ paddingLeft: 18 }}>{a === null ? 'target ' + s.target * 100 + '%' : Math.round(a * 100) + '% / ' + s.target * 100 + '%'}</div>
              </div>
            );
          })}
        </div>
      </div>
      {!hold.length && <div className="small muted">Ring shows the target until holdings sync from IBKR each night.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
        <div className="glass card"><div className="small muted">USD/PHP</div><div style={{ fontSize: 22, fontWeight: 800 }}>{fx ? fx.toFixed(2) : '–'}</div><div className="small muted">{'₱'}1 move = {peso(ibkr.balance)}</div></div>
        <div className="glass card"><div className="small muted">Deposited</div><div style={{ fontSize: 22, fontWeight: 800 }}>{peso(deposits)}</div><div className="small muted">via Wise, last 6 months</div></div>
      </div>
    </Shell>
  );
}
