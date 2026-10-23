'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Shell, { Loading } from '../../components/Shell';
import useData from '../../components/useData';
import { openTx } from '../../components/apply';
import { peso } from '../../lib/money';

const day = (d) => new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Matches merchant, nickname, category, wallet or note; a number also matches the amount.
export default function Search() {
  const { data, error } = useData();
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const all = (data && data.transactions) || [];
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const num = Number(term.replace(/[₱,]/g, ''));
    return all.filter((t) => {
      if (num > 0 && Math.abs(t.amount - num) < 1) return true;
      return [t.merchant, t.raw, t.category, t.source, t.note].some((x) => String(x || '').toLowerCase().includes(term));
    }).slice().reverse();
  }, [data, q]);
  if (!data) return <Shell tabs={false}><Loading error={error} /></Shell>;
  const spent = rows.filter((t) => t.type === 'Expense').reduce((a, t) => a + t.amount, 0);
  const byMonth = {};
  rows.forEach((t) => { (byMonth[t.date.slice(0, 7)] = byMonth[t.date.slice(0, 7)] || []).push(t); });

  return (
    <Shell tabs={false} glow="b">
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <Link href="/" className="iconbtn" aria-label="Back to Today">‹</Link>
        <h1 className="h1">Search</h1>
      </div>
      <input id="search-q" className="input" autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Grab, wigs, 1200, GCash…" aria-label="Search transactions" />
      {q.trim() && (
        <div className="small muted">{rows.length} {rows.length === 1 ? 'match' : 'matches'}{spent ? ' · ' + peso(spent) + ' spent' : ''} · last 13 months</div>
      )}
      {Object.entries(byMonth).map(([m, list]) => (
        <div key={m} className="glass card strong" style={{ display: 'flex', flexDirection: 'column', gap: 4, borderRadius: 22 }}>
          <div className="row small" style={{ fontWeight: 700, color: 'var(--muted)' }}>
            <span>{new Date(m + '-01T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
            <span>{peso(list.filter((t) => t.type === 'Expense').reduce((a, t) => a + t.amount, 0))}</span>
          </div>
          {list.map((t) => (
            <button key={t.row} onClick={() => openTx(t)} className="row press" style={{ width: '100%', border: 0, background: 'transparent', padding: '6px 0', textAlign: 'left', cursor: 'pointer', fontSize: 14 }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.merchant}</span>
                <span className="small muted">{day(t.date)} · {t.type === 'Expense' ? t.category : t.type} · {t.source}</span>
              </span>
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: t.type === 'Expense' ? undefined : 'var(--muted)' }}>{peso(t.amount)}</span>
            </button>
          ))}
        </div>
      ))}
    </Shell>
  );
}
