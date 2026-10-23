'use client';
import { peso } from '../lib/money';
import { detectBills } from '../lib/bills';
import { change } from './apply';

const COLORS = ['#FF8A3D', '#C38BFF', '#3DDC97', '#4D7CFF', '#FFD166', '#8A93A6'];
const short = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function Bills({ data, now }) {
  const { bills, monthlyTotal, next30 } = detectBills(data, now);
  const overdue = bills.filter((b) => b.overdue);
  const soon = bills.filter((b) => !b.overdue && b.daysTo <= 30);
  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="glass card" style={{ flex: 1, padding: '12px 14px', borderRadius: 20 }}><div className="small muted">Monthly</div><div style={{ fontSize: 22, fontWeight: 800 }}>{peso(monthlyTotal)}</div></div>
        <div className="glass card" style={{ flex: 1, padding: '12px 14px', borderRadius: 20 }}><div className="small muted">Next 30 days</div><div style={{ fontSize: 22, fontWeight: 800 }}>{peso(next30)}</div></div>
      </div>
      {overdue.map((b) => (
        <div key={b.name + b.amount} className="rise" style={{ padding: '14px 16px', borderRadius: 22, background: 'rgba(255,138,61,0.14)', border: '1px solid rgba(255,138,61,0.45)', fontSize: 13, lineHeight: 1.45, color: '#FFB27D' }}>
          <b>{b.name}</b> was due {short(b.next)} and hasn't shown up. Cancelled, or charged somewhere else?
        </div>
      ))}
      <div className="glass card strong" style={{ borderRadius: 24, paddingBottom: 6 }}>
        <div style={{ position: 'relative', height: 50, marginBottom: 6 }} aria-hidden="true">
          <div style={{ position: 'absolute', left: 0, right: 0, top: 22, height: 2, background: 'rgba(255,255,255,0.14)' }} />
          <div style={{ position: 'absolute', left: 0, top: 32, fontSize: 10, color: '#8A93A6' }}>Today</div>
          <div style={{ position: 'absolute', right: 0, top: 32, fontSize: 10, color: '#8A93A6' }}>+30 days</div>
          {soon.map((b, i) => (
            <div key={i}>
              <div className="rise" style={{ position: 'absolute', top: 15, left: (b.daysTo / 30) * 100 + '%', width: 16, height: 16, marginLeft: -8, borderRadius: 8, background: COLORS[bills.indexOf(b) % COLORS.length], border: '2px solid #0B0D10', animationDelay: i * 0.08 + 's' }} />
            </div>
          ))}
        </div>
        {bills.length === 0 && <div className="small muted" style={{ padding: '8px 0 12px' }}>No repeat charges found yet.</div>}
        {bills.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: b.overdue ? '#8A93A6' : COLORS[i % COLORS.length] }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{b.name}</div>
              <div style={{ fontSize: 12, color: b.overdue ? '#FFB27D' : '#8A93A6' }}>{b.overdue ? 'Expected ' + short(b.next) + ' · not seen' : b.every + ' · ' + b.source}</div>
            </div>
            <button onClick={() => change([{ op: 'bill_hide', key: b.key, name: b.name }], b.name + ' taken off Bills')} className="chip" style={{ minHeight: 32, fontSize: 12, padding: '0 10px' }}>Not a bill</button>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{peso(b.amount)}</div>
              <div style={{ fontSize: 12, color: '#8A93A6' }}>{b.overdue ? 'Overdue' : b.every === 'Yearly' ? new Date(b.next + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : short(b.next)}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
