'use client';
import { useEffect, useRef, useState } from 'react';
import { Sheet, CATS, WALLETS } from './TxSheet';
import { change } from './apply';
import { peso } from '../lib/money';

// Log a payment with no text or notification: amount, category, wallet.
export default function QuickAdd() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState('Food & Drinks');
  const [wallet, setWallet] = useState('Cash');
  const [what, setWhat] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  useEffect(() => {
    const on = () => { setOpen(true); setAmount(''); setWhat(''); setTimeout(() => input.current && input.current.focus(), 350); };
    window.addEventListener('money:add', on);
    return () => window.removeEventListener('money:add', on);
  }, []);
  if (!open) return null;
  const amt = Number(String(amount).replace(/,/g, ''));
  const save = async (e) => {
    e.preventDefault();
    if (!(amt > 0)) return;
    setBusy(true);
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }).slice(0, 16);
    const r = await change([{ op: 'add_expense', date: now, amount: amt, merchant: what.trim() || cat, category: cat, source: wallet }], peso(amt) + ' · ' + (what.trim() || cat) + ' logged');
    setBusy(false);
    if (r.ok) setOpen(false);
  };
  return (
    <Sheet title="Add a payment" onClose={() => setOpen(false)}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--muted)' }}>₱</span>
          <input ref={input} id="qa-amount" aria-label="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
            style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', fontSize: 44, fontWeight: 800, outline: 'none' }} />
        </div>
        <input id="qa-what" aria-label="What was it" className="input" style={{ minHeight: 46, fontSize: 16 }} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What was it? (optional)" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{CATS.map((c) => <button type="button" key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{WALLETS.map((w) => <button type="button" key={w} className={'chip' + (wallet === w ? ' on' : '')} onClick={() => setWallet(w)}>{w}</button>)}</div>
        <button className="btn" disabled={busy || !(amt > 0)} type="submit">{busy ? 'Saving…' : amt > 0 ? 'Add ' + peso(amt) : 'Add'}</button>
        {wallet !== 'Cash' && <span className="small muted">When the {wallet.split(' ')[0]} text arrives, it fills in this row instead of adding another.</span>}
      </form>
    </Sheet>
  );
}
