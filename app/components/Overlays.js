'use client';
import { usePathname } from 'next/navigation';
import Ask from './Ask';
import TxSheet from './TxSheet';
import QuickAdd from './QuickAdd';
import Toast from './Toast';
import { TABS } from './Shell';

// Mounted once for the whole app, so a toast's Undo, an open sheet or a reply still streaming survive a tab switch.
export default function Overlays() {
  const path = usePathname();
  if (path === '/login') return null;
  const tabs = TABS.some(([href]) => href === path);
  return <><Ask button={tabs} /><TxSheet /><QuickAdd /><Toast /></>;
}
