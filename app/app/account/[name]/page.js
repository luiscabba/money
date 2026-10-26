'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Shell, { Loading } from '../../../components/Shell';
import useData from '../../../components/useData';
import useToday from '../../../components/useToday';
import Seg from '../../../components/Seg';
import { change, openTx } from '../../../components/apply';
import { peso, usd, pad, appWallets } from '../../../lib/money';
import { ACCOUNT_COLORS, accountOf, direction, kindLabel, rowName, weekLabel, exact } from '../../../lib/flow';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SUB = { Maya: 'Wallet and savings', GCash: 'Wallet', GoTyme: 'Savings', BPI: 'Savings', 'App wallets': 'Money held in apps' };

// One account: its balance over time, what came in and went out this month, and every row, newest first.
export default function Account({ params }) {
  const name = decodeURIComponent(params.name);
  const router = useRouter();
  const { data, error } = useData();
  const now = useToday();
  const [show, setShow] = useState('all');
  const [span, setSpan] = useState('30');
  const [readings, setReadings] = useState([]);
  const [setting, setSetting] = useState(false);
  const [bal, setBal] = useState('');
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(6);

  useEffect(() => { if (name === 'IBKR') router.replace('/invest'); }, [name, router]);
  useEffect(() => {
    fetch('/api/account?name=' + encodeURIComponent(name)).then((r) => r.json()).then((j) => setReadings(j.readings || [])).catch(() => {});
  }, [name, data && data.updatedAt]);

  const view = useMemo(() => {
    if (!data) return null;
    const wallets = appWallets(data);
    const acct = name === 'App wallets'
      ? { name, currency: 'PHP', php: wallets.reduce((a, w) => a + w.php, 0), wallets }
      : (data.netWorth.accounts || []).find((a) => a.name === name);
    const total = (data.netWorth.accounts || []).reduce((a, x) => a + (x.php || 0), 0) + wallets.reduce((a, w) => a + w.php, 0);
    const rows = (data.transactions || []).filter((t) => direction(t) && (accountOf(t.source) === name || (name === 'App wallets' && t.type === 'Transfer Out' && /wallet$/i.test(t.merchant || '')))).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const prefix = now.y + '-' + pad(now.m) + '-';
    const month = rows.filter((t) => t.date.startsWith(prefix));
    const sum = (list) => list.reduce((a, t) => a + t.amount, 0);
    const cameIn = sum(month.filter((t) => direction(t) === 'in'));
    const wentOut = sum(month.filter((t) => direction(t) === 'out'));
    const movedIn = sum(month.filter((t) => direction(t) === 'move' && /In|Income/.test(t.type)));
    const movedOut = sum(month.filter((t) => direction(t) === 'move' && !/In|Income/.test(t.type)));
    // Who the money came from this month, biggest first.
    const payers = {};
    month.filter((t) => direction(t) === 'in').forEach((t) => { const k = t.type === 'Refund' ? 'Refunds and cashback' : rowName(t); payers[k] = (payers[k] || 0) + t.amount; });
    const from = Object.entries(payers).sort((a, b) => b[1] - a[1]);
    return { acct, total, rows, cameIn, wentOut, movedIn, movedOut, from };
  }, [data, name, now.y, now.m]);

  if (!data || !view) return <Shell tabs={false}><Loading error={error} /></Shell>;
  const { acct, total, rows, cameIn, wentOut, movedIn, movedOut, from } = view;
  const color = ACCOUNT_COLORS[name] || '#8A93A6';
  const isUsd = acct && acct.currency === 'USD';

  // The balance line: one point per reading in the span.
  const cut = new Date(Date.now() - Number(span) * 86400000).toISOString();
  const pts = readings.filter((r) => r.at >= cut);
  let line = null;
  if (pts.length >= 2) {
    const lo = Math.min(...pts.map((r) => r.balance)), hi = Math.max(...pts.map((r) => r.balance));
    const padv = (hi - lo || hi * 0.02 || 1) * 0.15;
    const t0 = new Date(pts[0].at).getTime(), t1 = new Date(pts[pts.length - 1].at).getTime() || t0 + 1;
    const X = (r) => 4 + ((new Date(r.at).getTime() - t0) / Math.max(1, t1 - t0)) * 326, Y = (v) => 6 + (1 - (v - lo + padv) / (hi - lo + 2 * padv)) * 70;
    const l = pts.map((r) => X(r).toFixed(1) + ',' + Y(r.balance).toFixed(1)).join(' ');
    line = { l, area: '4,82 ' + l + ' 330,82', end: [X(pts[pts.length - 1]), Y(pts[pts.length - 1].balance)], change: pts[pts.length - 1].balance - pts[0].balance };
  }

  const shown = rows.filter((t) => show === 'all' || (show === 'in' ? direction(t) === 'in' || (direction(t) === 'move' && /In|Income/.test(t.type)) : direction(t) === 'out' || (direction(t) === 'move' && !/In|Income/.test(t.type))));
  // This week by day, older by week.
  const today = now.y + '-' + pad(now.m) + '-' + pad(now.d);
  const yest = (() => { const d = new Date(now.y, now.m - 1, now.d - 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); })();
  const groupOf = (t) => {
    const k = t.date.slice(0, 10);
    if (k === today) return 'Today';
    if (k === yest) return 'Yesterday';
    const wl = weekLabel(t.date, now);
    return wl === 'This week' ? new Date(k + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : wl;
  };
  const groups = [];
  shown.forEach((t) => { const g = groupOf(t); if (!groups.length || groups[groups.length - 1].label !== g) groups.push({ label: g, list: [] }); groups[groups.length - 1].list.push(t); });
  const net = (list) => list.reduce((a, t) => a + (direction(t) === 'in' ? t.amount : direction(t) === 'out' ? -t.amount : 0), 0);
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + exact(Math.abs(n));
  const when = (t) => {
    const g = groupOf(t);
    const time = new Date(t.date.replace(' ', 'T')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
    return /^(Today|Yesterday|\w{3}, )/.test(g) ? time : new Date(t.date.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };
  const fromTotal = from.reduce((a, [, v]) => a + v, 0);
  const FROM_COLORS = ['#3DDC97', '#C38BFF', '#4D7CFF', '#FF8A3D', '#5ECFD1'];

  const saveBalance = async (e) => {
    e.preventDefault();
    const v = Number(String(bal).replace(/[^\d.]/g, ''));
    if (!(v >= 0) || bal === '') return;
    setBusy(true);
    const r = await change([{ op: 'set_balance', account: name, amount: v }], name + ' set to ' + (isUsd ? usd(v) : peso(v)));
    setBusy(false);
    if (r.ok) { setBal(''); setSetting(false); }
  };
  const canSet = name !== 'App wallets' && !!acct;

  return (
    <Shell tabs={false} glow="a">
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <Link href="/networth" className="iconbtn" aria-label="Back to Worth">‹</Link>
        <h1 className="h1" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 6, background: color, flexShrink: 0 }} />{name}</h1>
        {canSet && <button className={'chip' + (setting ? ' on' : '')} onClick={() => setSetting(!setting)} aria-expanded={setting}>Set balance</button>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 2px 0' }}>
        <span className="small muted">{SUB[name] || 'Balance'}</span>
        <span className="big">{acct ? (isUsd ? usd(acct.balance) : peso(acct.php)) : '–'}</span>
        {acct && total > 0 && <span className="small muted">{(acct.php / total) * 100 < 1 ? 'Under 1%' : Math.round((acct.php / total) * 100) + '%'} of everything{acct.asOf ? ' · checked ' + new Date(acct.asOf + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + (acct.sinceRows ? ' + ' + acct.sinceRows + (acct.sinceRows === 1 ? ' payment' : ' payments') + ' since' : '') : ''}</span>}
      </div>

      {setting && (
        <form className="rise" onSubmit={saveBalance} style={{ display: 'flex', gap: 8 }}>
          <input className="input" inputMode="decimal" autoFocus aria-label={'New ' + name + ' balance'} placeholder={'Now ' + (isUsd ? usd(acct.balance) : peso(acct.php))} value={bal} onChange={(e) => setBal(e.target.value)} style={{ minHeight: 48, fontSize: 16 }} />
          <button className="chip on" disabled={busy || bal === ''} type="submit" style={{ minHeight: 48 }}>Set</button>
        </form>
      )}

      {acct && acct.wallets && (
        <div className="glass card strong" style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column' }}>
          {acct.wallets.map((w) => <div key={w.name} className="row" style={{ minHeight: 40, fontSize: 14 }}><span>{w.name}</span><b>{peso(w.php)}</b></div>)}
        </div>
      )}

      {line && (
        <div className="glass card" style={{ borderRadius: 24, padding: '12px 10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="row" style={{ padding: '0 4px' }}>
            <div className="small"><span className="muted">{span} days </span><b style={{ color: line.change >= 0 ? 'var(--under)' : 'var(--over)' }}>{signed(line.change)}</b></div>
            <Seg label="Span" options={[['30', '30D'], ['90', '90D']]} value={span} onChange={setSpan} minWidth={44} />
          </div>
          <svg width="100%" viewBox="0 0 334 84" role="img" aria-label={name + ' balance over the last ' + span + ' days'}>
            <polygon className="fadein" points={line.area} fill={color} fillOpacity="0.16" />
            <polyline key={span} className="draw" pathLength="1" points={line.l} fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" />
            <circle cx={line.end[0]} cy={line.end[1]} r="4" fill={color} stroke="#0B0D10" strokeWidth="2" />
          </svg>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <div className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 16px' }}>
          <span className="small muted">Came in, {MONTHS[now.m - 1].slice(0, 3)}</span>
          <b style={{ fontSize: 22, color: cameIn ? 'var(--under)' : 'var(--dim)' }}>{cameIn ? '+' : ''}{peso(cameIn)}</b>
        </div>
        <div className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 16px' }}>
          <span className="small muted">Went out, {MONTHS[now.m - 1].slice(0, 3)}</span>
          <b style={{ fontSize: 22, color: wentOut ? undefined : 'var(--dim)' }}>{peso(wentOut)}</b>
        </div>
      </div>
      {(movedIn > 0 || movedOut > 0) && <div className="small muted" style={{ padding: '0 4px' }}>⇄ Moved between your accounts: {peso(movedIn)} in, {peso(movedOut)} out. Not counted.</div>}

      {rows.length > 0 && <Seg label="Show" options={[['all', 'All'], ['in', 'In'], ['out', 'Out']]} value={show} onChange={(v) => { setShow(v); setMore(6); }} stretch />}

      {show === 'in' && from.length > 0 && (
        <div className="glass card rise" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span className="small muted">Where {MONTHS[now.m - 1]}'s {peso(fromTotal)} came from</span>
          <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
            {from.slice(0, 5).map(([k, v], i) => <span key={k} style={{ flex: v, background: k === 'Refunds and cashback' ? 'var(--ahead)' : FROM_COLORS[i] }} />)}
          </div>
          {from.slice(0, 5).map(([k, v], i) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: k === 'Refunds and cashback' ? 'var(--ahead)' : FROM_COLORS[i] }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k}</span><b>{peso(v)}</b>
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 && (
        <div className="glass card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '28px 20px', textAlign: 'center' }}>
          <b style={{ fontSize: 16 }}>Nothing moved here yet</b>
          <span className="small muted" style={{ maxWidth: 260 }}>If something did, set the new balance and Moni will ask what changed.</span>
        </div>
      )}

      {groups.slice(0, more).map((g) => (
        <div key={g.label} className="glass card strong rise" style={{ display: 'flex', flexDirection: 'column', gap: 4, borderRadius: 22 }}>
          <div className="row small" style={{ fontWeight: 700, color: 'var(--muted)' }}>
            <span>{g.label}</span>
            <span style={{ color: net(g.list) > 0 ? 'var(--under)' : undefined }}>{net(g.list) ? signed(net(g.list)) : ''}</span>
          </div>
          {g.list.map((t) => {
            const d = direction(t);
            return (
              <button key={t.row} onClick={() => openTx(t)} className="row press" style={{ width: '100%', border: 0, background: 'transparent', padding: '6px 0', textAlign: 'left', cursor: 'pointer', fontSize: 14 }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rowName(t)}</span>
                  <span className="small muted">{kindLabel(t)} · {when(t)}</span>
                </span>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: d === 'in' ? 'var(--under)' : d === 'move' ? 'var(--muted)' : undefined }}>{d === 'in' ? '+' : d === 'move' ? '⇄ ' : ''}{exact(t.amount)}</span>
              </button>
            );
          })}
        </div>
      ))}
      {groups.length > more && <button className="chip" onClick={() => setMore(more + 8)} style={{ alignSelf: 'center' }}>Show older</button>}
    </Shell>
  );
}
