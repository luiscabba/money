'use client';
import { useCallback, useEffect, useState } from 'react';

let cache = null;

export default function useData() {
  const [data, setData] = useState(cache);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/data', { cache: 'no-store' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const j = await res.json();
      if (j.error) { setError(j.error); return; }
      cache = j;
      setData(j);
      setError('');
    } catch (e) {
      setError('offline');
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    const onFocus = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('money:reload', load);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onFocus); window.removeEventListener('money:reload', load); };
  }, [load]);

  return { data, error, reload: load };
}
