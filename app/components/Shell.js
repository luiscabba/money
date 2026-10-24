'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Moni from './Moni';

// Four tabs with Moni raised in the middle. Invest lives inside Worth (its second tab), so /invest lights Worth.
export const TABS = [['/', 'Today'], ['/trends', 'Trends'], ['/budgets', 'Budgets'], ['/networth', 'Worth']];
const TAB_OF = { '/invest': '/networth' };
const MID = 76; // the gap the Moni orb sits in

let lastTab = -1;

export default function Shell({ children, glow = 'a', tabs = true }) {
  const path = usePathname();
  const here = TAB_OF[path] || path;
  const idx = TABS.findIndex(([href]) => href === here);
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
        <nav className="tabs glass" aria-label="Main" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr ' + MID + 'px 1fr 1fr' }}>
          {shown >= 0 && <span className="tabthumb" aria-hidden="true" style={{ width: `calc((100% - 12px - ${MID}px) / 4)`, transform: `translateX(calc(${shown * 100}% + ${shown >= 2 ? MID : 0}px))` }} />}
          {TABS.slice(0, 2).map(([href, label]) => <Link key={href} href={href} className={'tab' + (here === href ? ' on' : '')} aria-current={here === href ? 'page' : undefined}>{label}</Link>)}
          <span aria-hidden="true" />
          {TABS.slice(2).map(([href, label]) => <Link key={href} href={href} className={'tab' + (here === href ? ' on' : '')} aria-current={here === href ? 'page' : undefined}>{label}</Link>)}
          <button className="moni-orb" aria-label="Ask Moni" onClick={() => window.dispatchEvent(new CustomEvent('money:ask', { detail: '' }))}><Moni size={58} mood="idle" /></button>
        </nav>
      )}
    </div>
  );
}

export function Loading({ error }) {
  if (error) return <div className="muted" style={{ padding: '40px 4px' }}>Can't reach Money right now. Retrying&hellip;</div>;
  return (
    <div role="status" aria-label="Loading" style={{ flex: 1, minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg className="loader" width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
        <circle cx="42" cy="42" r="34" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle className="loader-a" cx="42" cy="42" r="34" fill="none" stroke="var(--under)" strokeWidth="10" strokeLinecap="round" pathLength="100" />
        <circle cx="42" cy="42" r="20" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle className="loader-b" cx="42" cy="42" r="20" fill="none" stroke="#4D7CFF" strokeWidth="8" strokeLinecap="round" pathLength="100" />
      </svg>
    </div>
  );
}
