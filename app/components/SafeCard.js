'use client';
import Ring from './Ring';
import CountUp from './CountUp';
import { peso } from '../lib/money';
import { safeToSpend } from '../lib/safe';

export default function SafeCard({ data, now }) {
  const s = safeToSpend(data, now);
  const ok = s.safe >= 0;
  const color = ok ? 'var(--under)' : 'var(--over)';
  return (
    <div className="glass card strong" style={{ display: 'flex', alignItems: 'center', gap: 16, borderRadius: 28 }}>
      <Ring size={104} r={50} width={14} pct={s.used} color={s.used >= 1 ? 'var(--over)' : 'var(--under)'} burst={ok} label={peso(s.before + s.today) + ' of ' + peso(s.week) + ' used this week'} />
      <div style={{ minWidth: 0 }}>
        <div className="small muted">Safe to spend today</div>
        <div style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.05, color: ok ? undefined : 'var(--over)' }}>{ok ? <CountUp value={s.safe} format={peso} /> : '−' + peso(-s.safe)}</div>
        <div className="small" style={{ color }}>{s.left >= 0 ? peso(s.left) + ' left this week' : peso(-s.left) + ' over this week'}</div>
        <div style={{ fontSize: 12, color: '#8A93A6' }}>{s.planned ? peso(s.planned) + ' planned · ' : ''}Unspent days roll forward · resets Monday</div>
      </div>
    </div>
  );
}
