'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Ask from './Ask';

const TABS = [['/', 'Today'], ['/trends', 'Trends'], ['/budgets', 'Budgets'], ['/networth', 'Worth'], ['/invest', 'Invest']];

export default function Shell({ children, glow = 'a', tabs = true }) {
  const path = usePathname();
  return (
    <div className={'shell glow-' + glow}>
      <div className="blob b1" aria-hidden="true" />
      <div className="blob b2" aria-hidden="true" />
      <div className="blob b3" aria-hidden="true" />
      <main className="page">{children}</main>
      {tabs && (
        <nav className="tabs glass" aria-label="Main">
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
