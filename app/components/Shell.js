'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Ask from './Ask';

const TABS = [['/', 'Today'], ['/trends', 'Trends'], ['/budgets', 'Budgets'], ['/networth', 'Worth'], ['/invest', 'Invest']];

let lastTab = -1;

export default function Shell({ children, glow = 'a', tabs = true }) {
  const path = usePathname();
  const idx = TABS.findIndex(([href]) => href === path);
  // Start the thumb where the previous tab was, then slide it to this one.
  const [shown, setShown] = useState(lastTab >= 0 ? lastTab : idx);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(idx));
    if (idx >= 0) lastTab = idx;
    return () => cancelAnimationFrame(id);
  }, [idx]);
  return (
    <div className={'shell glow-' + glow}>
      <div className="blob b1" aria-hidden="true" />
      <div className="blob b2" aria-hidden="true" />
      <div className="blob b3" aria-hidden="true" />
      <main className="page">{children}</main>
      {tabs && (
        <nav className="tabs glass" aria-label="Main">
          {shown >= 0 && <span className="tabthumb" aria-hidden="true" style={{ width: `calc((100% - 12px) / ${TABS.length})`, transform: `translateX(${shown * 100}%)` }} />}
          {TABS.map(([href, label]) => (
            <Link key={href} href={href} className={'tab' + (path === href ? ' on' : '')} aria-current={path === href ? 'page' : undefined}>{label}</Link>
          ))}
        </nav>
      )}
      {tabs && <Ask />}
    </div>
  );
}

export function Loading({ error }) {
  return <div className="muted" style={{ padding: '40px 4px' }}>{error ? 'Could not reach the sheet (' + error + '). Pull to retry.' : 'Loading…'}</div>;
}
