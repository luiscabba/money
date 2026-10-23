'use client';
import { useState } from 'react';
import Link from 'next/link';
import Shell, { Loading } from '../../components/Shell';
import useData from '../../components/useData';
import { openTx } from '../../components/apply';
import { peso, needsReview } from '../../lib/money';

const CHOICES = ['Food & Drinks', 'Groceries', 'Shopping', 'Transport', 'Subscriptions', 'Bills & Phone', 'Entertainment', 'Fitness', 'Personal Care', 'Other'];

export default function Review() {
  const { data, error, reload } = useData();
  const [picked, setPicked] = useState({});
  const [remember, setRemember] = useState({});
  const [busy, setBusy] = useState(null);
  const [failed, setFailed] = useState({});

  if (!data) return <Shell tabs={false}><Loading error={error} /></Shell>;
  const items = needsReview(data);

  const pick = async (t, cat) => {
    setBusy(t.row);
    setPicked((p) => ({ ...p, [t.row]: cat }));
    const res = await fetch('/api/categorize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ row: t.row, category: cat, remember: remember[t.row] !== false }) }).catch(() => null);
    const ok = res && res.ok && !(await res.json().catch(() => ({ error: 1 }))).error;
    if (!ok) setPicked((p) => { const n = { ...p }; delete n[t.row]; return n; }); // didn't save: leave it open to tap again
    setFailed((f) => ({ ...f, [t.row]: !ok }));
    setBusy(null);
  };

  const open = items.filter((t) => !picked[t.row]).length;
  const guessOf = (t) => (t.category && t.category !== 'Other' ? t.category : '');
  const guessed = items.filter((t) => !picked[t.row] && guessOf(t));
  const acceptAll = async () => { for (const t of guessed) await pick(t, guessOf(t)); };

  return (
    <Shell tabs={false} glow="c">
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <Link href="/" className="iconbtn" aria-label="Back to Today" onClick={() => reload()}>‹</Link>
        <h1 className="h1">Review</h1>
      </div>
      <div className="row">
        <div className="small muted">{open === 0 ? 'All sorted. Budgets updated.' : open + ' left.'}</div>
        {guessed.length > 1 && <button className="chip on" disabled={busy !== null} onClick={acceptAll}>Accept all {guessed.length} guesses</button>}
      </div>
      {items.map((t) => (
        <div key={t.row} className="glass card strong" style={{ display: 'flex', flexDirection: 'column', gap: 12, transition: 'opacity 0.3s ease, transform 0.3s ease', opacity: picked[t.row] ? 0.55 : 1, transform: picked[t.row] ? 'scale(0.98)' : 'none' }}>
          <div className="row" style={{ alignItems: 'baseline' }}>
            <div>
              <button onClick={() => openTx(t)} style={{ border: 0, background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer', fontSize: 18, fontWeight: 800, textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.25)', textUnderlineOffset: 4 }}>{t.merchant}</button>
              {failed[t.row] && <div className="small" style={{ color: '#FF8A80' }}>Didn't save. Tap again.</div>}
              <div className="small muted">{t.source} · {t.date.slice(0, 16)}{t.note ? ' · ' + t.note : ''}</div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{peso(t.amount)}</div>
          </div>
          {guessOf(t) && !picked[t.row] && (
            <button className="btn" disabled={busy === t.row} onClick={() => pick(t, guessOf(t))} style={{ minHeight: 48, fontSize: 15, background: 'var(--under)' }}>✓ {guessOf(t)}</button>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(/^Sen[dt] to /.test(t.raw || t.merchant) ? CHOICES.concat('Transfer') : CHOICES).map((c) => (
              <button key={c} className={'chip' + (picked[t.row] === c ? ' on' : '')} disabled={busy === t.row} onClick={() => pick(t, c)} aria-pressed={picked[t.row] === c}>{c === 'Transfer' ? 'Not spending' : c}</button>
            ))}
          </div>
          <label className="row small" style={{ justifyContent: 'flex-start', minHeight: 44, cursor: 'pointer' }}>
            <input type="checkbox" checked={remember[t.row] !== false} onChange={(e) => setRemember((r) => ({ ...r, [t.row]: e.target.checked }))} style={{ width: 20, height: 20, accentColor: '#3DDC97' }} />
            {/^Sen[dt] to /.test(t.raw || t.merchant) ? 'Remember for ' + t.merchant.replace(/^Sen[dt] to /, '') : 'Always use this for ' + t.merchant}
          </label>
        </div>
      ))}
      <Link href="/" className="btn" onClick={() => reload()} style={{ marginTop: 'auto' }}>Done</Link>
    </Shell>
  );
}
