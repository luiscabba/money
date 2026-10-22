'use client';
import { useState } from 'react';
import { peso } from '../lib/money';
import { applyOps } from './apply';

// An incoming payment that looks like the repayment: same amount, after the IOU, from someone whose name matches.
function matchFor(o, data) {
  const first = String(o.who).toLowerCase().split(' ')[0];
  const used = new Set((data.owed || []).map((x) => x.matchRow).filter(Boolean));
  return (data.transactions || []).find((t) => (t.type === 'Income' || t.type === 'Transfer In') && !used.has(t.row) &&
    Math.abs(t.amount - o.amount) < 0.01 && t.date.slice(0, 10) >= o.created && String(t.merchant).toLowerCase().includes(first)) || null;
}

export default function Owed({ data }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const all = data.owed || [];
  const open = all.filter((o) => o.status === 'open');
  const done = all.filter((o) => o.status === 'settled').slice(-5).reverse();
  const total = open.reduce((a, o) => a + o.amount, 0);
  const settle = async (o, row) => {
    setBusy(o.id); setErr('');
    const r = await applyOps([{ op: 'settle_owed', id: o.id, row: row || undefined }]);
    setBusy(''); if (!r.ok) setErr(r.error);
  };
  return (
    <>
      <div className="glass card strong" style={{ borderRadius: 24 }}>
        <div className="small muted">Owed to you</div>
        <div style={{ fontSize: 36, fontWeight: 800 }}>{peso(total)}</div>
        <div style={{ fontSize: 13, color: '#8A93A6' }}>{open.length ? 'Not counted as spending' : 'Tell Ask Money when someone owes you'}</div>
      </div>
      {err && <div className="small" style={{ color: 'var(--over)' }}>{err}</div>}
      {open.map((o) => {
        const m = matchFor(o, data);
        return (
          <div key={o.id} className="glass card rise" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderRadius: 22 }}>
            <div className="row">
              <div><div style={{ fontSize: 15, fontWeight: 800 }}>{o.who}</div><div className="small muted">{o.for || 'IOU'} · {o.created}</div></div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{peso(o.amount)}</div>
            </div>
            {m ? (
              <div className="row" style={{ padding: '10px 12px', borderRadius: 16, background: 'rgba(61,220,151,0.12)', fontSize: 13, color: 'var(--under)' }}>
                <span>{peso(m.amount)} from {m.merchant} came in {m.date.slice(5, 10)}</span>
                <button onClick={() => settle(o, m.row)} disabled={busy === o.id} style={{ minHeight: 36, padding: '0 14px', border: 0, borderRadius: 18, background: 'var(--under)', color: 'var(--bg)', fontWeight: 800, cursor: 'pointer' }}>Match</button>
              </div>
            ) : (
              <button onClick={() => settle(o)} disabled={busy === o.id} className="chip" style={{ alignSelf: 'flex-start' }}>{busy === o.id ? 'Saving…' : 'Mark paid back'}</button>
            )}
          </div>
        );
      })}
      {done.length > 0 && <div style={{ fontSize: 12, color: '#8A93A6', textAlign: 'center' }}>Settled</div>}
      {done.map((o) => (
        <div key={o.id} className="row" style={{ padding: '12px 16px', borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 14, color: '#8A93A6' }}>
          <span>{o.who} · {o.for}</span><span>{peso(o.amount)} · paid back</span>
        </div>
      ))}
    </>
  );
}
