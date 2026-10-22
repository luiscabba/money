'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Ring from '../../components/Ring';
import useData from '../../components/useData';
import { Loading } from '../../components/Shell';
import { peso, manilaNow, MONTHS } from '../../lib/money';
import { weekRecap } from '../../lib/trends';

const arrow = (p) => (p === null ? 'new' : (p > 0 ? '▲ ' : p < 0 ? '▼ ' : '') + Math.abs(p) + '%');

export default function Recap() {
  const { data, error } = useData();
  const now = useMemo(() => manilaNow(), []);
  const [i, setI] = useState(0);
  const [still, setStill] = useState(false);
  useEffect(() => { setStill(window.matchMedia('(prefers-reduced-motion: reduce)').matches); }, []);
  // Stories advance on their own every 6 seconds; tapping skips ahead.
  useEffect(() => {
    if (!data || still) return;
    const id = setTimeout(() => setI((k) => Math.min(k + 1, 3)), 6000);
    return () => clearTimeout(id);
  }, [i, data, still]);
  if (!data) return <div style={{ padding: 24 }}><Loading error={error} /></div>;

  const r = weekRecap(data, now);
  const m = r.month;
  const cards = [
    { bg: '#120E0B', glow: '#B8521E', kicker: 'You spent', big: peso(r.cur),
      line: r.ratio === null ? 'Nothing the week before' : r.ratio >= 1.5 ? r.ratio.toFixed(1) + '× the week before' : arrow(r.pct) + ' vs the week before',
      accent: r.pct > 0 ? '#FFB27D' : '#3DDC97', days: true },
    r.up
      ? { bg: '#0E0B14', glow: '#7A3DD6', kicker: 'Biggest jump', big: r.up.name, line: arrow(r.up.pct) + ' · ' + peso(r.up.cur), accent: '#FFB27D', rows: r.top.map(([a, b]) => [a, peso(b)]) }
      : { bg: '#0E0B14', glow: '#7A3DD6', kicker: 'No category went up', big: 'Steady', line: 'Every category flat or down', accent: '#3DDC97' },
    { bg: '#0B120E', glow: '#1E8A5C', kicker: 'Days under budget', big: r.under + ' of 7', line: r.zero.length ? 'No spend: ' + r.zero.join(', ') : 'Every day had spend', accent: '#3DDC97', days: true },
    { bg: '#0B0E14', glow: '#2B4BB8', kicker: MONTHS[now.m - 1] + ' so far', big: peso(m.cur), line: arrow(m.pct) + ' vs ' + m.prevName, accent: m.pct > 0 ? '#FFB27D' : '#3DDC97',
      rows: m.movers.map((x) => [x.name, arrow(x.pct)]) }
  ];
  const c = cards[i];
  const last = i === cards.length - 1;

  return (
    <div style={{ position: 'relative', minHeight: '100dvh', overflow: 'hidden', background: c.bg, transition: 'background-color 0.6s ease' }}>
      <div aria-hidden="true" style={{ position: 'absolute', left: -240, top: -40, width: 700, height: 700, borderRadius: 350, background: `radial-gradient(closest-side, ${c.glow}, transparent)`, opacity: 0.8, pointerEvents: 'none' }} />
      <button onClick={() => (last ? (window.location.href = '/') : setI(i + 1))} aria-label={last ? 'Done' : 'Next card'}
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 520, margin: '0 auto', minHeight: '100dvh', padding: 'calc(16px + env(safe-area-inset-top)) 20px calc(28px + env(safe-area-inset-bottom))', border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
        <div style={{ display: 'flex', gap: 4, width: '100%' }}>
          {cards.map((_, k) => (
            <div key={k} style={{ flex: 1, height: 3, borderRadius: 2, overflow: 'hidden', background: k < i ? '#F2F4F8' : 'rgba(255,255,255,0.25)' }}>
              {k === i && <div key={'f' + i} style={{ height: '100%', background: '#F2F4F8', transformOrigin: 'left', animation: still || k === cards.length - 1 ? 'none' : 'fillbar 6s linear both' }} />}
            </div>
          ))}
        </div>
        <div className="row" style={{ width: '100%', marginTop: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(242,244,248,0.7)' }}>Week of {r.range}</span>
          <Link href="/" onClick={(e) => e.stopPropagation()} className="iconbtn" aria-label="Close" style={{ background: 'rgba(255,255,255,0.1)' }}>✕</Link>
        </div>
        <div key={'c' + i} className="rise" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(242,244,248,0.8)' }}>{c.kicker}</div>
          <div style={{ fontSize: c.big.length > 9 ? 44 : 60, lineHeight: 1.05, fontWeight: 800, letterSpacing: '-0.02em' }}>{c.big}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: c.accent }}>{c.line}</div>
        </div>
        <div style={{ marginTop: 28, minHeight: 220, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 12 }}>
          {c.days && (
            <div className="row">
              {r.week.map((d, k) => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <Ring size={42} r={14} width={5} pct={d.spent / d.allow} full={d.spent === 0} color={d.spent > d.allow ? 'var(--over)' : 'var(--under)'} track="rgba(255,255,255,0.15)" />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(242,244,248,0.7)' }}>{d.l}</span>
                </div>
              ))}
            </div>
          )}
          {(c.rows || []).map(([a, b], k) => (
            <div key={i + a} className="row rise" style={{ animationDelay: 0.25 + k * 0.08 + 's', padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.16)', fontSize: 16, fontWeight: 700 }}>
              <span>{a}</span><span>{b}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, width: '100%', fontSize: 12, color: 'rgba(242,244,248,0.55)', textAlign: 'center' }}>{last ? 'Tap to finish' : 'Tap to continue'}</div>
      </button>
    </div>
  );
}
