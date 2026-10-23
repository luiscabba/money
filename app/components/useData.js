'use client';
import { useCallback, useEffect, useState } from 'react';

// The last good copy is kept on the phone so the app opens instantly, then refreshes in the background.
const STORE = 'moneyData.v1';
let cache = null;
let loadedAt = null; // when the server last answered (null = showing the saved copy)
let inflight = null;

let lastText = null; // the last answer exactly as received
let seq = 0; // newest request number; an older answer that arrives late is ignored
let shown = 0; // request number of the data on screen

// A forced load (after a change) always starts a fresh request, so it never reuses one that began before the change.
// Several screens hear the same reload event, so forced loads within half a second share one request.
let forcedAt = 0;
function fetchShared(force) {
  if (inflight && (!force || Date.now() - forcedAt < 500)) return inflight;
  if (force) forcedAt = Date.now();
  const mine = ++seq;
  // Give up after 20s so a hung server never leaves the screen waiting; the saved copy stays up.
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  inflight = fetch('/api/data', { cache: 'no-store', signal: ctl.signal })
    .then(async (res) => {
      // A newer deploy than the code running here: reload once to pick it up (not again in this tab session).
      const build = res.headers.get('x-build');
      if (build && process.env.NEXT_PUBLIC_BUILD && build !== process.env.NEXT_PUBLIC_BUILD && process.env.NEXT_PUBLIC_BUILD !== 'dev') {
        try { if (sessionStorage.getItem('reloadedFor') !== build) { sessionStorage.setItem('reloadedFor', build); window.location.reload(); } } catch (e) {}
      }
      const text = res.status === 401 ? '{}' : await res.text();
      return { status: res.status, text, json: null, n: mine };
    })
    .finally(() => { clearTimeout(t); if (seq === mine) inflight = null; });
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
      const r = await fetchShared(force === true);
      if (r.n < shown) return; // a newer answer is already on screen
      if (r.status === 401) {
        try { localStorage.removeItem(STORE); } catch (e) {}
        if (window.location.pathname !== '/login') window.location.href = '/login';
        return;
      }
      // Unchanged since the last answer: keep the same object, so screens don't redo their sums or re-render.
      if (r.text === lastText && cache) { loadedAt = Date.now(); shown = r.n; setAt(loadedAt); setData(cache); setError(''); return; }
      let j;
      try { j = JSON.parse(r.text); } catch (e) { throw new Error('bad data'); }
      if (j.error) { setError(j.error); if (!cache) setTimeout(() => load(true), 5000); return; }
      shown = r.n;
      cache = j; lastText = r.text; loadedAt = Date.now(); try { localStorage.setItem(STORE, r.text); } catch (e) {}
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
