'use client';
import { useEffect, useRef, useState } from 'react';
import { Sheet, CATS, WALLETS } from './TxSheet';
import { change } from './apply';
import useData from './useData';
import { sourceAccount } from '../lib/core';
import { peso } from '../lib/money';

// Shrinks a photo so it uploads quickly: longest side 1600px, JPEG (receipts need a little more detail than chat photos).
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
const nowLocal = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Manila' }).slice(0, 16).replace(' ', 'T');
const whenLabel = (v) => { const d = new Date(v + ':00+08:00'); const o = { timeZone: 'Asia/Manila' }; return d.toLocaleDateString('en-US', { ...o, weekday: 'short' }) + ' ' + d.toLocaleDateString('en-US', { ...o, day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { ...o, hour: 'numeric', minute: '2-digit' }); };
// Pesos with centavos when there are any (receipts), whole otherwise.
const exact = (n) => '₱' + Number(n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

// Log a payment with no text or notification: scan a receipt, pick a photo, or type it.
export default function QuickAdd() {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState('Food & Drinks');
  const [wallet, setWallet] = useState(''); // picked every time, so a payment never lands on the wrong account
  const { data } = useData();
  const [what, setWhat] = useState('');
  const [when, setWhen] = useState(''); // '' = now
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState(null); // {photo, reading, receipt, error}
  const [split, setSplit] = useState(true);
  const input = useRef(null);
  const cam = useRef(null);
  const lib = useRef(null);
  useEffect(() => {
    const on = () => { setOpen(true); setWallet(''); setAmount(''); setWhat(''); setWhen(''); setPicking(false); setScan(null); setSplit(true); setTimeout(() => input.current && input.current.focus(), 350); };
    window.addEventListener('money:add', on);
    return () => window.removeEventListener('money:add', on);
  }, []);
  if (!open) return null;
  const amt = Number(String(amount).replace(/,/g, ''));

  const read = async (file) => {
    if (!file) return;
    let photo;
    try { photo = await shrink(file); } catch (e) { setScan({ error: "Couldn't open that photo." }); return; }
    setScan({ photo, reading: true });
    let j = null;
    try { j = await (await fetch('/api/receipt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: photo }) })).json(); } catch (e) { j = null; }
    if (!j || !j.ok) { setScan({ photo, error: (j && j.error ? j.error.charAt(0).toUpperCase() + j.error.slice(1) : "Couldn't read it") + '. Type it below instead.' }); return; }
    const r = j.receipt;
    setScan({ photo, receipt: r });
    setAmount(String(r.total)); setWhat(r.merchant); setCat(r.parts[0].category);
    if (r.wallet) setWallet(r.wallet);
    if (r.when) setWhen(r.when.replace(' ', 'T'));
  };

  const r = scan && scan.receipt;
  const parts = r && r.parts.length > 1 && split && Math.abs(r.total - amt) < 0.01 ? r.parts : null;
  const save = async (e) => {
    e.preventDefault();
    if (!(amt > 0) || !wallet) return;
    setBusy(true);
    const date = (when || nowLocal()).replace('T', ' ');
    const op = { op: 'add_expense', date, amount: amt, merchant: what.trim() || cat, category: parts ? parts[0].category : cat, source: wallet };
    if (parts) op.parts = parts.map((p) => ({ amount: p.amount, category: p.category }));
    if (r) op.note = 'receipt';
    const res = await change([op], peso(amt) + ' · ' + (what.trim() || cat) + ' · ' + wallet + (after ? ' · ' + after.name + ' now ' + exact(Math.round(after.next * 100) / 100) : ''));
    setBusy(false);
    if (res.ok) setOpen(false);
  };
  // The account this payment comes out of, with its balance before and after.
  const acctName = sourceAccount(wallet);
  const acct = acctName && data && data.netWorth ? (data.netWorth.accounts || []).find((a) => a.name === acctName) : null;
  const after = acct && amt > 0 ? { name: acctName, now: acct.php, next: acct.php - amt } : null;
  const tile = (primary) => ({ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '0 14px', borderRadius: 18, cursor: 'pointer', fontWeight: 800, fontSize: 14, border: primary ? 0 : '1px solid var(--line)', background: primary ? 'var(--ink)' : 'var(--glass)', color: primary ? 'var(--bg)' : 'var(--ink)' });

  return (
    <Sheet title="Add a payment" onClose={() => setOpen(false)}>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!scan && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <button type="button" style={tile(true)} onClick={() => cam.current && cam.current.click()}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>Scan receipt
            </button>
            <button type="button" style={tile(false)} onClick={() => lib.current && lib.current.click()}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M20 16l-5-5-8 9" /></svg>From Photos
            </button>
            <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; read(f); }} />
            <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; read(f); }} />
          </div>
        )}
        {scan && (
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            {scan.photo && <img src={scan.photo} alt="Receipt" style={{ width: 66, height: 88, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              {scan.reading && <span className="small muted">Reading the receipt…</span>}
              {scan.error && <span className="small" style={{ color: 'var(--over)' }}>{scan.error}</span>}
              {r && <span className="small" style={{ fontWeight: 700, color: 'var(--under)' }}>Read from your receipt</span>}
              {r && <span className="small muted">Check it, then add.</span>}
              <button type="button" className="chip" style={{ alignSelf: 'flex-start', marginTop: 4, minHeight: 36 }} onClick={() => { setScan(null); setAmount(''); setWhat(''); setWhen(''); }}>Start over</button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--muted)' }}>₱</span>
          <input ref={input} id="qa-amount" aria-label="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0"
            style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', fontSize: 44, fontWeight: 800, outline: 'none' }} />
        </div>
        <input id="qa-what" aria-label="What was it" className="input" style={{ minHeight: 46, fontSize: 16 }} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What was it? (optional)" />
        {r && r.parts.length > 1 && (
          <div className="glass" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 20 }}>
            <label className="row" style={{ cursor: 'pointer' }}>
              <b style={{ fontSize: 14 }}>Split by category</b>
              <input type="checkbox" role="switch" checked={split} onChange={(e) => setSplit(e.target.checked)} style={{ width: 22, height: 22, accentColor: '#3DDC97' }} />
            </label>
            {r.parts.map((p) => <div key={p.category} className="row" style={{ fontSize: 14, opacity: split ? 1 : 0.5 }}><span>{p.category}{p.items ? <span className="muted"> · {p.items} {p.items === 1 ? 'item' : 'items'}</span> : ''}</span><b>{exact(p.amount)}</b></div>)}
            {split && Math.abs(r.total - amt) >= 0.01 && <span className="small muted">You changed the amount, so it's logged as one category.</span>}
          </div>
        )}
        {!parts && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{CATS.map((c) => <button type="button" key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <b style={{ fontSize: 14, color: wallet ? 'var(--ink)' : 'var(--over)' }}>{wallet ? 'Paid with' : 'Paid with?'}</b>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{WALLETS.map((w) => <button type="button" key={w} className={'chip' + (wallet === w ? ' on' : '')} onClick={() => setWallet(w)}>{w}</button>)}</div>
          {after && <span className="small" style={{ color: after.next < 0 ? 'var(--over)' : 'var(--muted)' }}>{after.name} {exact(Math.round(after.now * 100) / 100)} → {after.next < 0 ? '−' + exact(Math.round(-after.next * 100) / 100) : exact(Math.round(after.next * 100) / 100)}{after.next < 0 ? ". That's more than the app thinks is in " + after.name + '. Set its balance after.' : ''}</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <button type="button" className="chip" aria-expanded={picking} onClick={() => setPicking((x) => !x)}>{when ? whenLabel(when) : 'Now'} ▾</button>
          {picking && <input type="datetime-local" aria-label="When" className="input" style={{ minHeight: 44, fontSize: 16, flex: 1, minWidth: 200 }} value={when || nowLocal()} max={nowLocal()} onChange={(e) => setWhen(e.target.value)} />}
        </div>
        <button className="btn" disabled={busy || !(amt > 0) || !wallet || (scan && scan.reading)} type="submit">{busy ? 'Saving…' : amt > 0 ? 'Add ' + exact(amt) : 'Add'}</button>
        {wallet && wallet !== 'Cash' && <span className="small muted">When the {wallet.split(' ')[0]} text arrives, it fills in this row instead of adding another.</span>}
      </form>
    </Sheet>
  );
}
