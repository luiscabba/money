'use client';
import { useEffect, useRef, useState } from 'react';
import { applyOps } from './apply';

const CHIPS = ['Clear my review list', 'How much on Grab this month?', 'Why is this month higher?', 'I want to buy something'];
const KEY = 'askMoney';

export default function Ask() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  useEffect(() => { try { const s = sessionStorage.getItem(KEY); if (s) setMsgs(JSON.parse(s)); } catch (e) {} }, []);
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch (e) {} if (end.current) end.current.scrollIntoView({ block: 'end' }); }, [msgs, open]);

  const send = async (q) => {
    const content = (q || text).trim();
    if (!content || busy) return;
    const next = [...msgs, { role: 'user', content }];
    setMsgs(next); setText(''); setBusy(true);
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }) });
      const j = await res.json();
      setMsgs([...next, { role: 'assistant', content: j.reply || j.error || 'No answer.', actions: j.actions || [], state: (j.actions || []).length ? 'pending' : null }]);
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: 'Could not reach Money. Try again.' }]);
    }
    setBusy(false);
  };

  const decide = async (i, yes) => {
    const m = msgs[i];
    const upd = (patch) => setMsgs((cur) => cur.map((x, k) => (k === i ? { ...x, ...patch } : x)));
    if (!yes) return upd({ state: 'skipped' });
    upd({ state: 'saving' });
    const ops = m.actions.map(({ label, ...op }) => op);
    const r = await applyOps(ops);
    upd(r.ok ? { state: 'done' } : { state: 'pending', error: r.error });
  };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Ask Money"
          style={{ position: 'fixed', right: 'max(16px, calc(50vw - 244px))', bottom: 'calc(84px + env(safe-area-inset-bottom))', zIndex: 20, minHeight: 44, padding: '0 16px', borderRadius: 22, border: 0, background: 'var(--ink)', color: 'var(--bg)', fontSize: 14, fontWeight: 800, boxShadow: '0 8px 30px rgba(0,0,0,0.45)', cursor: 'pointer' }}>
          ✦ Ask
        </button>
      )}
      {open && (
        <div role="dialog" aria-label="Ask Money" style={{ position: 'fixed', inset: 0, zIndex: 30, background: '#0B0D10', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', padding: 'calc(14px + env(safe-area-inset-top)) 16px calc(12px + env(safe-area-inset-bottom))', gap: 10 }}>
            <div className="row">
              <div style={{ fontSize: 22, fontWeight: 800 }}>Ask Money</div>
              <div className="row" style={{ gap: 8 }}>
                {msgs.length > 0 && <button className="chip" onClick={() => setMsgs([])}>New</button>}
                <button className="iconbtn" onClick={() => setOpen(false)} aria-label="Close">✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 8 }}>
              {msgs.length === 0 && <div className="small muted" style={{ marginTop: 8 }}>Ask about your money, or tell it what to change: recategorize, log cash, plan a purchase, track who owes you.</div>}
              {msgs.map((m, i) => m.role === 'user' ? (
                <div key={i} className="rise" style={{ alignSelf: 'flex-end', maxWidth: '82%', padding: '11px 14px', borderRadius: '20px 20px 6px 20px', background: 'var(--ink)', color: 'var(--bg)', fontSize: 15, fontWeight: 600 }}>{m.content}</div>
              ) : (
                <div key={i} className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 15, lineHeight: 1.5, color: '#E4E7EE', whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  {(m.actions || []).length > 0 && (
                    <div className="glass" style={{ padding: 14, borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 8, borderColor: m.state === 'done' ? 'rgba(61,220,151,0.6)' : undefined }}>
                      <div className="small muted" style={{ fontWeight: 700 }}>{m.actions.length === 1 ? 'Change' : m.actions.length + ' changes'}</div>
                      {m.actions.map((a, k) => <div key={k} style={{ fontSize: 14, fontWeight: 700 }}>{a.label || a.op}</div>)}
                      {m.error && <div className="small" style={{ color: 'var(--over)' }}>{m.error}</div>}
                      {m.state === 'pending' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                          <button className="btn" style={{ minHeight: 42, fontSize: 14 }} onClick={() => decide(i, true)}>Confirm</button>
                          <button className="chip" style={{ minHeight: 42 }} onClick={() => decide(i, false)}>Skip</button>
                        </div>
                      )}
                      {m.state === 'saving' && <div className="small muted">Saving…</div>}
                      {m.state === 'done' && <div className="small" style={{ color: 'var(--under)', fontWeight: 700 }}>✓ Done</div>}
                      {m.state === 'skipped' && <div className="small muted">Skipped</div>}
                    </div>
                  )}
                </div>
              ))}
              {busy && <div className="small muted rise">Thinking…</div>}
              <div ref={end} />
            </div>
            {msgs.length === 0 && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                {CHIPS.map((c) => <button key={c} className="chip" style={{ flexShrink: 0, fontSize: 12 }} onClick={() => (c === 'I want to buy something' ? setText('I want to buy ') : send(c))}>{c}</button>)}
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 6px 6px 16px', borderRadius: 28, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask or tell Money anything" aria-label="Message" style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', fontSize: 16, outline: 'none' }} />
              <button disabled={busy || !text.trim()} aria-label="Send" style={{ width: 44, height: 44, borderRadius: 22, border: 0, background: 'var(--ink)', color: 'var(--bg)', fontWeight: 800, cursor: 'pointer', opacity: busy || !text.trim() ? 0.5 : 1 }}>↑</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
