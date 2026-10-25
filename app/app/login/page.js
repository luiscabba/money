'use client';
import { useEffect, useRef, useState } from 'react';
import Shell from '../../components/Shell';
import Moni from '../../components/Moni';
import Wordmark from '../../components/Wordmark';

export default function Login() {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [mood, setMood] = useState('idle');
  const [focus, setFocus] = useState(false);
  const hold = useRef(0); // until this time, a reaction (wrong, tap) keeps its face
  const live = useRef({ code: '', focus: false });
  live.current = { code, focus };

  const rest = (c = live.current.code, f = live.current.focus) => (c ? 'shy' : f ? 'listen' : 'idle');
  const react = (m, ms, after) => {
    hold.current = Date.now() + ms;
    setMood(m);
    setTimeout(() => { if (Date.now() >= hold.current) setMood(after ? after() : rest()); }, ms);
  };

  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 23 || h < 6) { setMood('sleep'); return; }
    const t = setTimeout(() => react('wink', 1600, () => 'idle'), 700);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => { if (!busy && Date.now() >= hold.current) setMood(rest(code, focus)); }, [code, focus]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    hold.current = Infinity;
    setMood('think');
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passcode: code }) });
    if (res.ok) { setMood('cel'); setTimeout(() => { window.location.href = '/'; }, 900); return; }
    setBusy(false);
    setErr('Wrong passcode.');
    setShake((n) => n + 1);
    setCode('');
    hold.current = 0;
    react('sad', 2200, () => rest('', true));
  };

  const poke = () => { if (!busy) react(mood === 'sleep' ? 'surp' : ['surp', 'wink', 'cel'][Math.floor(Math.random() * 3)], 1300); };

  return (
    <Shell tabs={false}>
      <form onSubmit={submit} style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        <button type="button" onClick={poke} aria-label="Moni" className="press" style={{ border: 0, background: 'none', padding: 8, cursor: 'pointer' }}>
          <span key={mood} className="hop" style={{ display: 'block' }}><Moni size={132} mood={mood} /></span>
        </button>
        <Wordmark as="h1" size={48} style={{ marginBottom: 12 }} />
        <label htmlFor="code" className="small muted">Passcode</label>
        <input key={shake} id="code" className={'input' + (shake ? ' shake' : '')} type="password" inputMode="numeric" autoComplete="current-password" value={code}
          onChange={(e) => setCode(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} autoFocus />
        {err && <div className="small" style={{ color: 'var(--over)' }}>{err}</div>}
        <button className="btn" disabled={busy || !code}>{busy ? 'Checking…' : 'Open'}</button>
      </form>
    </Shell>
  );
}
