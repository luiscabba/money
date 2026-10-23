'use client';
import { useCallback, useEffect, useState } from 'react';

// The last good copy is kept on the phone so the app opens instantly, then refreshes in the background.
const STORE = 'moneyData.v1';
let cache = null;
let loadedAt = null; // when the server last answered (null = showing the saved copy)
let inflight = null;

function fetchShared() {
  if (inflight) return inflight;
  // Give up after 20s so a hung server never leaves the screen waiting; the saved copy stays up.
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  inflight = fetch('/api/data', { cache: 'no-store', signal: ctl.signal })
    .then(async (res) => ({ status: res.status, json: res.status === 401 ? {} : await res.json() }))
    .finally(() => { clearTimeout(t); inflight = null; });
  return inflight;
}

function readSaved() {
  try { const s = localStorage.getItem(STORE); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}

export default function useData() {
  const [data, setData] = useState(cache);
  const [error, setError] = useState('');
  const [at, setAt] = useState(loadedAt);

  // Every screen and Ask share one request; a timer tick skips loading when data is under 50s old.
  const load = useCallback(async (force) => {
    if (force !== true && loadedAt && Date.now() - loadedAt < 50000 && cache) { setData(cache); setAt(loadedAt); return; }
    try {
      const r = await fetchShared();
      if (r.status === 401) {
        try { localStorage.removeItem(STORE); } catch (e) {}
        if (window.location.pathname !== '/login') window.location.href = '/login';
        return;
      }
      const j = r.json;
      if (j.error) { setError(j.error); if (!cache) setTimeout(() => load(true), 5000); return; }
      if (cache !== j) { cache = j; loadedAt = Date.now(); try { localStorage.setItem(STORE, JSON.stringify(j)); } catch (e) {} }
      setAt(loadedAt);
      setData(j);
      setError('');
    } catch (e) {
      setError('offline');
      if (!cache) setTimeout(() => load(true), 5000); // nothing to show yet: keep trying
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
    const onReload = () => load(true);
    window.addEventListener('money:reload', onReload);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onFocus); window.removeEventListener('money:reload', onReload); };
  }, [load]);

  return { data, error: data ? '' : error, reload: () => load(true), at, offline: !!error && !!data };
}
