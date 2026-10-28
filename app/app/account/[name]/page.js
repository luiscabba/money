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
import { colorOf, accountOf, direction, kindLabel, rowName, weekLabel, exact } from '../../../lib/flow';
import { markPairs, moveOther, isAppWallet, walletKey, atmFee } from '../../../lib/core';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SUB = { Maya: 'Wallet and savings', GCash: 'Wallet', GoTyme: 'Savings', BPI: 'Savings', Cash: 'On hand', 'App wallets': 'Money held in apps' };

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

  const isWallet = isAppWallet(name);
  const shortName = isWallet ? name.replace(/\s+wallet$/i, '') : name;

  const view = useMemo(() => {
    if (!data) return null;
    const wallets = appWallets(data);
    const key = walletKey(name);
    const acct = name === 'App wallets'
      ? { name, currency: 'PHP', php: wallets.reduce((a, w) => a + w.php, 0), wallets }
      : isWallet ? wallets.find((w) => walletKey(w.name) === key)
        : (data.netWorth.accounts || []).find((a) => a.name === name);
    const total = (data.netWorth.accounts || []).reduce((a, x) => a + (x.php || 0), 0) + wallets.reduce((a, w) => a + w.php, 0);
    const mine = (s) => (isWallet ? isAppWallet(s) && walletKey(s) === key : accountOf(s) === name);
    // Each row as this account sees it: its own rows, plus the landing side of a move made from another account.
    const rows = markPairs(data.transactions || []).map((t) => {
      const d = direction(t);
      if (!d) return null;
      if (name === 'App wallets') {
        const topUp = t.type === 'Transfer Out' && /wallet$/i.test(t.merchant || '');
        return accountOf(t.source) === name || topUp ? { t, d, amount: t.amount, inbound: topUp || /In|Income|Refund/.test(t.type) } : null;
      }
      if (mine(t.source)) {
        const fee = t.type === 'Cash Withdrawal' ? atmFee(t.amount) : 0;
        return { t, d, amount: t.amount, inbound: /In|Income|Refund/.test(t.type), sub: fee ? 'Cash out · ' + exact(fee) + ' ATM fee' : '' };
      }
      const other = t.paired ? '' : moveOther(t);
      if (!other || !(isWallet ? walletKey(other) === key : other === name)) return null;
      const fee = t.type === 'Cash Withdrawal' ? atmFee(t.amount) : 0;
      const there = accountOf(t.source);
      if (t.type === 'Transfer In') return { t, d: 'move', amount: t.amount, inbound: false, title: 'To ' + there, sub: 'Between your accounts' };
      return { t, d: 'move', amount: Math.round((t.amount - fee) * 100) / 100, inbound: true, title: t.type === 'Cash Withdrawal' ? 'Cash out' : 'Top-up', sub: 'From ' + there + (fee ? ' · ' + exact(fee) + ' ATM fee' : '') };
    }).filter(Boolean).sort((a, b) => (a.t.date < b.t.date ? 1 : -1));
    const prefix = now.y + '-' + pad(now.m) + '-';
    const month = rows.filter((v) => v.t.date.startsWith(prefix));
    const sum = (list) => list.reduce((a, v) => a + v.amount, 0);
    const cameIn = sum(month.filter((v) => v.d === 'in'));
    const wentOut = sum(month.filter((v) => v.d === 'out'));
    const movedIn = sum(month.filter((v) => v.d === 'move' && v.inbound));
    const movedOut = sum(month.filter((v) => v.d === 'move' && !v.inbound));
    // Who the money came from this month, biggest first.
    const payers = {};
    month.filter((v) => v.d === 'in').forEach((v) => { const k = v.t.type === 'Refund' ? 'Refunds and cashback' : rowName(v.t); payers[k] = (payers[k] || 0) + v.amount; });
    const from = Object.entries(payers).sort((a, b) => b[1] - a[1]);
    return { acct, total, rows, cameIn, wentOut, movedIn, movedOut, from };
  }, [data, name, isWallet, now.y, now.m]);

  if (!data || !view) return <Shell tabs={false}><Loading error={error} /></Shell>;
  const { acct, total, rows, cameIn, wentOut, movedIn, movedOut, from } = view;
  const color = colorOf(name);
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

  const shown = rows.filter((v) => show === 'all' || (show === 'in' ? v.d === 'in' || (v.d === 'move' && v.inbound) : v.d === 'out' || (v.d === 'move' && !v.inbound)));
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
  shown.forEach((v) => { const g = groupOf(v.t); if (!groups.length || groups[groups.length - 1].label !== g) groups.push({ label: g, list: [] }); groups[groups.length - 1].list.push(v); });
  const net = (list) => list.reduce((a, v) => a + (v.d === 'in' ? v.amount : v.d === 'out' ? -v.amount : 0), 0);
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
    const r = await change([{ op: 'set_balance', account: isWallet && acct ? acct.name : name, amount: v }], shortName + ' set to ' + (isUsd ? usd(v) : peso(v)));
    setBusy(false);
    if (r.ok) { setBal(''); setSetting(false); }
  };
  const canSet = name !== 'App wallets' && !!acct;
  const pct = acct && total > 0 ? (acct.php / total) * 100 : 0;
  const shortDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const checked = acct && acct.asOf ? 'Checked ' + shortDay(acct.asOf) + (acct.sinceRows ? ' · ' + acct.sinceRows + (acct.sinceRows === 1 ? ' payment' : ' payments') + ' since' : '') : isWallet ? 'Not checked yet' : '';
  const meta = [pct >= 1 ? Math.round(pct) + '% of everything' : '', checked].filter(Boolean).join(' · ');
  const moved = movedIn && movedOut ? peso(movedIn) + ' in, ' + peso(movedOut) + ' out between your accounts'
    : movedIn ? peso(movedIn) + (isWallet ? ' topped up' : ' moved in') + ' from your accounts'
      : movedOut ? peso(movedOut) + ' moved to your other accounts' : '';

  return (
    <Shell tabs={false} glow="a">
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <Link href="/networth" className="iconbtn" aria-label="Back to Worth">‹</Link>
        <h1 className="h1" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 6, background: color, flexShrink: 0 }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortName}</span></h1>
        {canSet && <button className="chip" onClick={() => setSetting(!setting)} aria-expanded={setting}>{setting ? 'Cancel' : 'Set balance'}</button>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 2px 0' }}>
        <span className="small muted">{SUB[name] || (isWallet ? 'App wallet' : 'Balance')}</span>
        <span className="big">{acct ? (isUsd ? usd(acct.balance) : peso(acct.php)) : '–'}</span>
        {acct && meta && <span className="small muted">{meta}</span>}
      </div>

      {setting && (
        <form className="rise" onSubmit={saveBalance} style={{ display: 'flex', gap: 8 }}>
          <input className="input" inputMode="decimal" autoFocus aria-label={'New ' + shortName + ' balance'} placeholder={isWallet ? 'What the ' + shortName + ' app shows' : 'Now ' + (isUsd ? usd(acct.balance) : peso(acct.php))} value={bal} onChange={(e) => setBal(e.target.value)} style={{ minHeight: 48, fontSize: 16 }} />
          <button className="chip on" disabled={busy || bal === ''} type="submit" style={{ minHeight: 48, padding: '0 20px' }}>Set</button>
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

      <div className="glass card" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', padding: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 16px' }}>
          <span className="small muted">Came in, {MONTHS[now.m - 1].slice(0, 3)}</span>
          <b style={{ fontSize: 18, color: cameIn ? 'var(--under)' : 'var(--dim)' }}>{cameIn ? '+' : ''}{peso(cameIn)}</b>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '12px 16px', borderLeft: '1px solid var(--line)' }}>
          <span className="small muted">Went out, {MONTHS[now.m - 1].slice(0, 3)}</span>
          <b style={{ fontSize: 18, color: wentOut ? undefined : 'var(--dim)' }}>{peso(wentOut)}</b>
        </div>
      </div>
      {moved && <div className="small muted" style={{ padding: '0 4px' }}>⇄ {moved}, not counted</div>}

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
          {g.list.map((v) => (
            <button key={v.t.row + (v.title ? 'l' : '')} onClick={() => openTx(v.t)} className="row press" style={{ width: '100%', border: 0, background: 'transparent', padding: '6px 0', textAlign: 'left', cursor: 'pointer', fontSize: 14 }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title || rowName(v.t)}</span>
                <span className="small muted">{v.sub || kindLabel(v.t)} · {when(v.t)}</span>
              </span>
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: v.d === 'in' ? 'var(--under)' : v.d === 'move' ? 'var(--muted)' : undefined }}>{v.d === 'in' ? '+' : v.d === 'move' ? '⇄ ' : ''}{exact(v.amount)}</span>
            </button>
          ))}
        </div>
      ))}
      {groups.length > more && <button className="chip" onClick={() => setMore(more + 8)} style={{ alignSelf: 'center' }}>Show older</button>}
    </Shell>
  );
}
