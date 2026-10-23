'use client';
import { useEffect, useState } from 'react';
import { change, askMoney } from './apply';
import { peso, appWallets, isAppWallet } from '../lib/money';
import useData from './useData';

export const CATS = ['Food & Drinks', 'Groceries', 'Shopping', 'Transport', 'Subscriptions', 'Bills & Phone', 'Entertainment', 'Fitness', 'Personal Care', 'Other'];
export const WALLETS = ['Maya Wallet', 'Maya Card', 'GCash', 'GoTyme', 'BPI', 'Cash'];
const when = (d) => new Date(d.replace(' ', 'T')).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div role="dialog" aria-label={title} style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div className="sheetup" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, maxHeight: '88dvh', overflowY: 'auto', background: '#14171C', borderRadius: '28px 28px 0 0', border: '1px solid var(--line)', borderBottom: 0, padding: '10px 16px calc(20px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.25)', alignSelf: 'center' }} aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

const label = { fontSize: 12, fontWeight: 700, color: 'var(--muted)' };
// Apps that hold a balance you top up first.
const WALLET_BRANDS = /lalamove|grab|shopee|lazada|angkas|joyride|move ?it|foodpanda|beep|steam|playstation|google play|coins\.ph|tiktok/i;

// Opens from any transaction row: category, not spending, nickname, note, fix, split, remove, ask.
export default function TxSheet() {
  const { data } = useData();
  const [t, setT] = useState(null);
  const [mode, setMode] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [fix, setFix] = useState({ amount: '', date: '', source: '' });
  const [parts, setParts] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const on = (e) => {
      const x = e.detail;
      setT(x); setMode(''); setName(x.raw && x.merchant !== x.raw ? x.merchant : ''); setNote(x.note || '');
      setFix({ amount: String(x.amount), date: x.date.slice(0, 16), source: x.source || '' });
      setParts([{ amount: String(x.amount), category: x.category && x.category !== 'Other' ? x.category : 'Food & Drinks' }, { amount: '', category: 'Shopping' }]);
    };
    window.addEventListener('money:tx', on);
    return () => window.removeEventListener('money:tx', on);
  }, []);
  if (!t) return null;
  const close = () => setT(null);
  const raw = t.raw || t.merchant;
  const person = /^Sen[dt] to /i.test(raw);
  const run = async (ops, text) => { setBusy(true); const r = await change(ops, text); setBusy(false); if (r.ok) close(); };
  const splitSum = parts.reduce((a, p) => a + (Number(p.amount) || 0), 0);
  // "Lalamove" → "Lalamove Wallet": where a top-up goes, and a source for what it pays.
  const bw = String(raw).replace(/\s*(wallet|top.?up|load|cash.?in|inc\.?|philippines|ph)\b.*$/i, '').trim().split(/\s+/).filter(Boolean);
  const walletName = bw.length ? (bw[0].length >= 4 ? [bw[0]] : bw.slice(0, 2)).join(' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) + ' Wallet' : '';
  const sources = WALLETS.concat((data ? appWallets(data) : []).map((w) => w.name)).concat(walletName && !isAppWallet(t.source) ? [walletName] : []).filter((w, i, a) => a.indexOf(w) === i);

  return (
    <Sheet title="Transaction" onClose={close}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, overflowWrap: 'anywhere' }}>{t.merchant}</div>
          {t.merchant !== raw && <div className="small muted" style={{ overflowWrap: 'anywhere' }}>{raw}</div>}
          <div className="small muted">{when(t.date)} · {t.source}</div>
          {t.note && <div className="small" style={{ marginTop: 4 }}>{t.note}</div>}
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, whiteSpace: 'nowrap' }}>{peso(t.amount)}</div>
      </div>

      {t.type === 'Expense' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={label}>Category</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATS.map((c) => <button key={c} disabled={busy} className={'chip' + (t.category === c && !t.review ? ' on' : '')} onClick={() => run([{ op: 'recategorize', row: t.row, category: c, remember: person }], t.merchant + ' → ' + c)}>{c}</button>)}
            <button disabled={busy} className="chip" onClick={() => run([{ op: 'mark_transfer', row: t.row, remember: person }], 'Not counted as spending')}>Not spending</button>
            {!person && walletName && (WALLET_BRANDS.test(raw) || isAppWallet(raw)) && <button disabled={busy} className="chip" onClick={() => run([{ op: 'mark_transfer', row: t.row, note: walletName }], 'Moved to ' + walletName)}>Top-up to {walletName}</button>}
          </div>
          {person && <span className="small muted">Remembered for this person from now on.</span>}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); run([{ op: 'rename', merchant: raw, name: name.trim() }], name.trim() ? 'Shows as ' + name.trim() : 'Nickname cleared'); }} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="tx-name" style={label}>{person ? 'Who is this?' : 'Nickname'}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="tx-name" className="input" style={{ minHeight: 44, fontSize: 15 }} value={name} onChange={(e) => setName(e.target.value)} placeholder={person ? 'e.g. Juan (wigs)' : 'Name shown everywhere'} />
          <button className="chip" disabled={busy} type="submit">Save</button>
        </div>
      </form>

      <form onSubmit={(e) => { e.preventDefault(); run([{ op: 'set_note', row: t.row, note }], 'Note saved'); }} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label htmlFor="tx-note" style={label}>Note</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id="tx-note" className="input" style={{ minHeight: 44, fontSize: 15 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was it for?" />
          <button className="chip" disabled={busy} type="submit">Save</button>
        </div>
      </form>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button className={'chip' + (mode === 'fix' ? ' on' : '')} onClick={() => setMode(mode === 'fix' ? '' : 'fix')}>Fix amount, date or wallet</button>
        {t.type === 'Expense' && <button className={'chip' + (mode === 'split' ? ' on' : '')} onClick={() => setMode(mode === 'split' ? '' : 'split')}>Split</button>}
        <button className="chip" onClick={() => { close(); askMoney('', t); }}>Ask about this</button>
      </div>

      {mode === 'fix' && (
        <form onSubmit={(e) => { e.preventDefault(); run([{ op: 'edit_tx', row: t.row, amount: Number(fix.amount), date: fix.date.replace('T', ' '), source: fix.source }], 'Saved'); }} className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 8 }}>
            <input aria-label="Amount" id="tx-amt" className="input" style={{ minHeight: 44, fontSize: 15 }} inputMode="decimal" value={fix.amount} onChange={(e) => setFix({ ...fix, amount: e.target.value })} />
            <input aria-label="Date and time" id="tx-date" className="input" style={{ minHeight: 44, fontSize: 15 }} type="datetime-local" value={fix.date.replace(' ', 'T')} onChange={(e) => setFix({ ...fix, date: e.target.value })} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{sources.map((w) => <button type="button" key={w} className={'chip' + (fix.source === w ? ' on' : '')} onClick={() => setFix({ ...fix, source: w })}>{w}</button>)}</div>
          <button className="btn" disabled={busy || !(Number(fix.amount) > 0)} type="submit">Save</button>
        </form>
      )}

      {mode === 'split' && (
        <form onSubmit={(e) => { e.preventDefault(); run([{ op: 'split', row: t.row, parts: parts.map((p) => ({ amount: Number(p.amount), category: p.category })) }], 'Split into ' + parts.length); }} className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {parts.map((p, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input aria-label={'Part ' + (i + 1) + ' amount'} id={'tx-part-' + i} className="input" style={{ minHeight: 44, fontSize: 15 }} inputMode="decimal" value={p.amount} placeholder="Amount"
                onChange={(e) => setParts(parts.map((q, k) => (k === i ? { ...q, amount: e.target.value } : k === 1 && i === 0 && parts.length === 2 ? { ...q, amount: String(Math.max(0, t.amount - (Number(e.target.value) || 0))) } : q)))} />
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>{CATS.map((c) => <button type="button" key={c} className={'chip' + (p.category === c ? ' on' : '')} style={{ flexShrink: 0 }} onClick={() => setParts(parts.map((q, k) => (k === i ? { ...q, category: c } : q)))}>{c}</button>)}</div>
            </div>
          ))}
          <div className="row small"><button type="button" className="chip" onClick={() => setParts([...parts, { amount: '', category: 'Other' }])}>Add part</button><span style={{ color: Math.abs(splitSum - t.amount) < 0.5 ? 'var(--under)' : 'var(--over)' }}>{peso(splitSum)} of {peso(t.amount)}</span></div>
          <button className="btn" disabled={busy || Math.abs(splitSum - t.amount) >= 0.5} type="submit">Split</button>
        </form>
      )}

      <button className="chip" disabled={busy} style={{ alignSelf: 'flex-start', color: '#FFB27D', borderColor: 'rgba(255,138,61,0.45)' }} onClick={() => run([{ op: 'void', row: t.row }], 'Removed from totals')}>Remove (duplicate or mistake)</button>
    </Sheet>
  );
}
