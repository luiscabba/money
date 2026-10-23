'use client';
import { useEffect, useRef, useState } from 'react';
import { undoOps } from './apply';

// Bottom message after a change. Undo stays for 8 seconds.
export default function Toast() {
  const [t, setT] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    const on = (e) => {
      clearTimeout(timer.current);
      setT({ ...e.detail, id: Date.now() });
      timer.current = setTimeout(() => setT(null), e.detail.undo && e.detail.undo.length ? 8000 : 3500);
    };
    window.addEventListener('money:toast', on);
    return () => { window.removeEventListener('money:toast', on); clearTimeout(timer.current); };
  }, []);
  if (!t) return null;
  const undo = async () => {
    clearTimeout(timer.current);
    setT({ ...t, text: 'Undoing…', undo: null });
    const r = await undoOps(t.undo);
    setT({ id: Date.now(), text: r.ok ? 'Undone' : "Couldn't undo. Change it back from the row." });
    timer.current = setTimeout(() => setT(null), 2500);
  };
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(140px + env(safe-area-inset-bottom))', zIndex: 60, display: 'flex', justifyContent: 'center', padding: '0 16px', pointerEvents: 'none' }}>
    <div key={t.id} role="status" className="rise" style={{ pointerEvents: 'auto', width: '100%', maxWidth: 488, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px 10px 16px', borderRadius: 18, background: '#F2F4F8', color: '#0B0D10', boxShadow: '0 10px 30px rgba(0,0,0,0.45)', fontSize: 14, fontWeight: 700 }}>
      <span style={{ flex: 1, minWidth: 0 }}>{t.text}</span>
      {t.undo && t.undo.length > 0 && <button onClick={undo} style={{ minHeight: 36, padding: '0 14px', borderRadius: 18, border: 0, background: '#0B0D10', color: '#F2F4F8', fontWeight: 800, cursor: 'pointer' }}>Undo</button>}
    </div>
    </div>
  );
}
