'use client';
import { useEffect, useRef, useState } from 'react';

// Counts from the last shown value to the new one. Plain number formatting via `format`.
export default function CountUp({ value, format = (n) => String(Math.round(n)), ms = 700 }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); from.current = value; return; }
    const a = from.current, b = value, t0 = performance.now();
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(a + (b - a) * e);
      if (k < 1) raf = requestAnimationFrame(step); else from.current = b;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); from.current = b; };
  }, [value, ms]);
  return <>{format(shown)}</>;
}
