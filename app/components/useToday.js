'use client';
import { useEffect, useState } from 'react';
import { manilaNow } from '../lib/money';

// Today's date in Manila that moves on at midnight, even when iOS resumes the app without reloading.
export default function useToday() {
  const [now, setNow] = useState(manilaNow);
  useEffect(() => {
    const check = () => setNow((cur) => { const n = manilaNow(); return n.key === cur.key ? cur : n; });
    const id = setInterval(check, 30000);
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return now;
}
