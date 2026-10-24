'use client';
import Link from 'next/link';

// Worth's two tabs: accounts and investments.
export default function WorthSwitch({ on }) {
  const item = (href, label, key) => (
    <Link href={href} aria-current={on === key ? 'page' : undefined} style={{ minHeight: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 18, textDecoration: 'none', fontSize: 13, fontWeight: on === key ? 800 : 700, background: on === key ? 'var(--ink)' : 'transparent', color: on === key ? 'var(--bg)' : 'var(--ink)' }}>{label}</Link>
  );
  return (
    <nav aria-label="Worth" className="glass" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', padding: 4, borderRadius: 22 }}>
      {item('/networth', 'Accounts', 'accounts')}{item('/invest', 'Invest', 'invest')}
    </nav>
  );
}
