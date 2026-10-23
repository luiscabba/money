'use client';
import { useCallback, useEffect, useState } from 'react';

// The last good copy is kept on the phone so the app opens instantly, then refreshes in the background.
const STORE = 'moneyData.v1';
let cache = null;

function readSaved() {
  try { const s = localStorage.getItem(STORE); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

export default function useData() {
  const [data, setData] = useState(cache);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      // Give up after 20s so a hung server never leaves the screen waiting; the saved copy stays up.
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 20000);
      const res = await fetch('/api/data', { cache: 'no-store', signal: ctl.signal }).finally(() => clearTimeout(t));
      if (res.status === 401) {
        try { localStorage.removeItem(STORE); } catch (e) {}
        window.location.href = '/login';
        return;
      }
      const j = await res.json();
      if (j.error) { setError(j.error); if (!cache) setTimeout(load, 5000); return; }
      cache = j;
      setData(j);
      setError('');
      try { localStorage.setItem(STORE, JSON.stringify(j)); } catch (e) {}
    } catch (e) {
      setError('offline');
      if (!cache) setTimeout(load, 5000); // nothing to show yet: keep trying
    }
  }, []);

  useEffect(() => {
    if (!cache) {
      const saved = readSaved();
      if (saved) { cache = saved; setData(saved); }
    }
    load();
    const id = setInterval(load, 60000);
    const onFocus = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('money:reload', load);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onFocus); window.removeEventListener('money:reload', load); };
  }, [load]);

  return { data, error: data ? '' : error, reload: load };
}
