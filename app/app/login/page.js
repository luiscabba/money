'use client';
import { useState } from 'react';
import Shell from '../../components/Shell';
import Ring from '../../components/Ring';

export default function Login() {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passcode: code }) });
    setBusy(false);
    if (res.ok) window.location.href = '/';
    else setErr('Wrong passcode.');
  };

  return (
    <Shell tabs={false}>
      <form onSubmit={submit} style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        <Ring size={96} r={40} width={12} pct={0.72} color="var(--under)" />
        <h1 className="h1">Money</h1>
        <label htmlFor="code" className="small muted">Passcode</label>
        <input id="code" className="input" type="password" inputMode="numeric" autoComplete="current-password" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        {err && <div className="small" style={{ color: 'var(--over)' }}>{err}</div>}
        <button className="btn" disabled={busy || !code}>{busy ? 'Checking…' : 'Open'}</button>
      </form>
    </Shell>
  );
}
