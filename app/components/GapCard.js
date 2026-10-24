'use client';
import { useState } from 'react';
import { peso, MONTHS } from '../lib/money';
import { askMoney, change } from './apply';

const SOURCE = { Maya: 'Maya Wallet', GCash: 'GCash', GoTyme: 'GoTyme', BPI: 'BPI' };
const day = (s) => MONTHS[Number(s.slice(5, 7)) - 1].slice(0, 3) + ' ' + Number(s.slice(8, 10));
const span = (g) => { const a = day(g.from), b = day(g.to); return a === b ? a : a.slice(0, 3) === b.slice(0, 3) ? a + ' to ' + b.slice(4) : a + ' to ' + b; };

// Money a balance says moved that no transaction explains: answer what it was in one tap, or say it's already logged.
export default function GapCard({ g, owed }) {
  const [busy, setBusy] = useState(false);
  const out = g.amount < 0;
  const amt = Math.round(Math.abs(g.amount) * 100) / 100;
  const source = SOURCE[g.account] || g.account;
  const base = { amount: amt, source, date: g.to };
  const done = { op: 'resolve_gap', id: g.id };
  const run = async (ops, text) => { setBusy(true); await change(ops, text); setBusy(false); };
  // An open IOU of about this amount: money in may be it being paid back.
  const iou = !out && (owed || []).find((o) => o.status === 'open' && Math.abs(o.amount - amt) <= Math.max(1, amt * 0.02));
  const tone = out
    ? { border: 'rgba(255,138,61,0.5)', bg: 'rgba(255,138,61,0.12)', head: '#FFB27D', body: '#F2D2BC', chip: 'rgba(255,178,125,0.45)', ink: '#FFE3D0', solid: '#FFB27D', solidInk: '#3A1A08' }
    : { border: 'rgba(90,169,255,0.5)', bg: 'rgba(90,169,255,0.12)', head: '#A8D0FF', body: '#D2E6FF', chip: 'rgba(168,208,255,0.45)', ink: '#E2EEFF', solid: '#A8D0FF', solidInk: '#0A2440' };
  const chip = { minHeight: 40, padding: '0 14px', borderRadius: 20, border: '1px solid ' + tone.chip, background: 'transparent', color: tone.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' };
  const answers = out
    ? ['Food & Drinks', 'Transport', 'Shopping', 'Other'].map((c) => [c, [{ op: 'add_expense', ...base, merchant: g.account + ' (untracked)', category: c }, done], peso(amt) + ' ' + c + ' logged · ' + g.account])
        .concat([['Not spending', [{ op: 'add_tx', ...base, type: 'Transfer Out', merchant: g.account + ' (moved out)' }, done], peso(amt) + ' moved out of ' + g.account]])
    : [['Income', [{ op: 'add_tx', ...base, type: 'Income', merchant: g.account + ' (untracked)' }, done], peso(amt) + ' income logged · ' + g.account],
       ['Refund', [{ op: 'add_tx', ...base, type: 'Refund', merchant: g.account + ' (refund)' }, done], peso(amt) + ' refund logged · ' + g.account],
       ['From my other account', [{ op: 'add_tx', ...base, type: 'Transfer In', merchant: 'Own account' }, done], peso(amt) + ' moved into ' + g.account]]
        .concat(iou ? [['Paid back by ' + iou.who, [{ op: 'add_tx', ...base, type: 'Transfer In', merchant: iou.who }, { op: 'settle_owed', id: iou.id }, done], iou.who + ' paid back ' + peso(amt)]] : []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px', borderRadius: 22, border: '1px solid ' + tone.border, background: tone.bg }}>
      <div className="row" style={{ alignItems: 'baseline' }}>
        <b style={{ fontSize: 15, color: tone.head }}>{g.account}: {peso(amt)} {out ? 'not tracked' : 'extra'}</b>
        <span style={{ fontSize: 12, color: tone.head }}>{span(g)}</span>
      </div>
      <span style={{ fontSize: 13, color: tone.body }}>Money {out ? 'left' : 'came into'} {g.account} without a transaction. What was it?</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {answers.map(([label, ops, text]) => <button key={label} disabled={busy} style={chip} onClick={() => run(ops, text)}>{label}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={busy} onClick={() => run([done], g.account + ' gap closed')} style={{ ...chip, flex: 1, minHeight: 44, border: 0, background: tone.solid, color: tone.solidInk, fontWeight: 800, fontSize: 14 }}>Already logged</button>
        <button disabled={busy} onClick={() => askMoney(`${peso(amt)} ${out ? 'left' : 'came into'} ${g.account} between ${day(g.from)} and ${day(g.to)} without a transaction (gap ${g.id}). It was `)} style={{ ...chip, flex: 1, minHeight: 44, fontSize: 14 }}>Tell Moni</button>
      </div>
    </div>
  );
}
