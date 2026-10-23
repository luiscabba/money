'use client';
import { useEffect, useRef, useState } from 'react';
import { applyOps, undoOps } from './apply';
import useData from './useData';
import { peso, needsReview, manilaNow } from '../lib/money';
import { safeToSpend } from '../lib/safe';

const KEY = 'askMoney.v2';
const when = (d) => new Date(String(d).replace(' ', 'T')).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// One line under each proposed change so he sees exactly what will be written.
function detail(a) {
  const bits = [];
  if (a.amount) bits.push(peso(a.amount));
  if (a.category) bits.push(a.category);
  if (a.source) bits.push(a.source);
  if (a.date) bits.push(when(a.date));
  if (a.name) bits.push('shows as ' + a.name);
  if (a.note && a.op !== 'mark_transfer') bits.push('"' + a.note + '"');
  if (a.remember) bits.push('remembered');
  if (a.parts) bits.push(a.parts.map((p) => peso(p.amount) + ' ' + p.category).join(' + '));
  if (a.text) bits.push(a.text);
  return bits.join(' · ');
}

// Shrinks a photo so it uploads quickly: longest side 1280px, JPEG.
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function rowContext(t) {
  return `[About row ${t.row}: ${t.date.slice(0, 16)}, ${t.merchant}${t.raw && t.raw !== t.merchant ? ' (' + t.raw + ')' : ''}, ${peso(t.amount)}, ${t.type === 'Expense' ? t.category : t.type}, ${t.source}${t.note ? ', note: ' + t.note : ''}] `;
}

export default function Ask({ button = true }) {
  const { data } = useData();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [row, setRow] = useState(null);
  const [photo, setPhoto] = useState('');
  const end = useRef(null);
  const file = useRef(null);

  useEffect(() => { try { const s = localStorage.getItem(KEY); if (s) setMsgs(JSON.parse(s)); } catch (e) {} }, []);
  useEffect(() => {
    const onAsk = (e) => {
      const d = e.detail;
      setOpen(true);
      if (d && typeof d === 'object') { setRow(d.row || null); setText(String(d.text || '')); }
      else { setRow(null); setText(String(d || '')); }
    };
    window.addEventListener('money:ask', onAsk);
    return () => window.removeEventListener('money:ask', onAsk);
  }, []);
  useEffect(() => {
    // Saved on the phone (photos left out) so a half-finished chat survives closing the app.
    try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-30).map(({ image, ...m }) => (image ? { ...m, photo: true } : m)))); } catch (e) {}
    if (end.current) end.current.scrollIntoView({ block: 'end' });
  }, [msgs, open]);

  const send = async (q) => {
    const typed = (q !== undefined ? q : text).trim();
    if ((!typed && !photo) || busy) return;
    const content = (row ? rowContext(row) : '') + typed;
    const mine = { role: 'user', content, shown: typed || 'Photo', rowLabel: row ? row.merchant + ' · ' + peso(row.amount) : '', image: photo || undefined };
    const next = [...msgs.map((m) => ({ ...m, replies: undefined })), mine];
    setMsgs(next); setText(''); setPhoto(''); setRow(null); setBusy(true);
    const payload = next.map((m, k) => ({ role: m.role, content: m.content, image: k === next.length - 1 ? m.image : undefined }));
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: payload }) });
      if ((res.headers.get('content-type') || '').includes('ndjson') && res.body) {
        let reply = '', actions = [], replies = [];
        const show = () => setMsgs([...next, { role: 'assistant', content: reply, actions: actions.map((a) => ({ ...a, on: true, state: 'pending' })), replies }]);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i); buf = buf.slice(i + 1);
            if (!line.trim()) continue;
            let ev; try { ev = JSON.parse(line); } catch (e) { continue; }
            if (ev.d) { reply += ev.d; setBusy(false); show(); }
            if (ev.actions) { actions = ev.actions; replies = ev.replies || []; }
          }
        }
        if (!reply.trim() && actions.length) reply = actions.length === 1 ? "Here's the change:" : "Here are the changes:";
        show();
      } else {
        const j = await res.json();
        setMsgs([...next, { role: 'assistant', content: j.reply || j.error || 'No answer.', actions: (j.actions || []).map((a) => ({ ...a, on: true, state: 'pending' })) }]);
      }
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: "Couldn't reach Money. Try again." }]);
    }
    setBusy(false);
  };

  useEffect(() => {
    // The 8pm check-in push opens Ask straight into a walk-through.
    if (typeof window === 'undefined') return;
    const u = new URL(window.location.href);
    if (u.searchParams.get('ask') === 'checkin') {
      u.searchParams.delete('ask');
      window.history.replaceState(null, '', u.pathname + u.search);
      setOpen(true);
      setTimeout(() => send('Walk me through what needs sorting today.'), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upd = (i, f) => setMsgs((cur) => cur.map((x, k) => (k === i ? f(x) : x)));
  const toggle = (i, k) => upd(i, (m) => ({ ...m, actions: m.actions.map((a, j) => (j === k ? { ...a, on: !a.on } : a)) }));

  // Applies the ticked changes that haven't saved yet; a retry never re-sends ones that already saved.
  const confirm = async (i) => {
    const m = msgs[i];
    const todo = m.actions.map((a, k) => ({ a, k })).filter(({ a }) => a.on && a.state !== 'done');
    if (!todo.length) return;
    upd(i, (x) => ({ ...x, error: '', actions: x.actions.map((a) => (todo.some((t) => t.a === a) ? { ...a, state: 'saving' } : a)) }));
    const r = await applyOps(todo.map(({ a }) => { const { label, on, state, ...op } = a; return op; }));
    upd(i, (x) => ({
      ...x,
      error: r.ok ? '' : r.error,
      undo: (x.undo || []).concat(r.undo || []),
      actions: x.actions.map((a, k) => {
        const n = todo.findIndex((t) => t.k === k);
        if (n < 0) return a;
        const res = r.results[n] || { ok: false };
        return { ...a, state: res.ok ? 'done' : 'failed', err: res.ok ? '' : res.error };
      })
    }));
  };
  const skip = (i) => upd(i, (x) => ({ ...x, actions: x.actions.map((a) => (a.state === 'pending' || a.state === 'failed' ? { ...a, state: 'skipped' } : a)) }));
  const undo = async (i) => {
    const m = msgs[i];
    upd(i, (x) => ({ ...x, undoing: true }));
    const r = await undoOps(m.undo);
    upd(i, (x) => ({ ...x, undoing: false, undo: r.ok ? [] : x.undo, error: r.ok ? '' : "Couldn't undo. Ask me to change it back.", actions: r.ok ? x.actions.map((a) => (a.state === 'done' ? { ...a, state: 'undone' } : a)) : x.actions }));
  };

  // Starters drawn from what needs attention right now.
  const chips = [];
  if (data) {
    const rv = needsReview(data).length;
    if (rv) chips.push(rv === 1 ? 'Help me sort 1 payment' : `Help me sort ${rv} payments`);
    (data.gaps || []).slice(0, 1).forEach((g) => chips.push(`${peso(Math.abs(g.amount))} ${g.amount < 0 ? 'left' : 'came into'} ${g.account} untracked`));
    try { const s = safeToSpend(data, manilaNow()); if (s.safe < 0) chips.push(`Why am I ${peso(-s.safe)} over today?`); } catch (e) {}
  }
  chips.push('Can I afford ', 'Log a payment: ', 'Where did my money go this week?');
  const startChip = (c) => (/[: ]$/.test(c) ? setText(c) : send(c));
  const last = msgs.length - 1;

  return (
    <>
      {!open && button && (
        <button onClick={() => setOpen(true)} aria-label="Ask Money" className="pop"
          style={{ position: 'fixed', right: 'max(16px, calc(50vw - 244px))', bottom: 'calc(84px + env(safe-area-inset-bottom))', zIndex: 20, minHeight: 44, padding: '0 16px', borderRadius: 22, border: 0, background: 'var(--ink)', color: 'var(--bg)', fontSize: 14, fontWeight: 800, boxShadow: '0 8px 30px rgba(0,0,0,0.45)', cursor: 'pointer' }}>
          ✦ Ask
        </button>
      )}
      {open && (
        <div role="dialog" aria-label="Ask Money" className="sheetup" style={{ position: 'fixed', inset: 0, zIndex: 30, background: '#0B0D10', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', padding: 'calc(14px + env(safe-area-inset-top)) 16px calc(12px + env(safe-area-inset-bottom))', gap: 10 }}>
            <div className="row">
              <div style={{ fontSize: 22, fontWeight: 800 }}>Ask Money</div>
              <div className="row" style={{ gap: 8 }}>
                {msgs.length > 0 && <button className="chip" onClick={() => setMsgs([])}>New chat</button>}
                <button className="iconbtn" onClick={() => setOpen(false)} aria-label="Close">✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 8 }}>
              {msgs.length === 0 && <div className="small muted" style={{ marginTop: 8 }}>Ask about your money, or tell it what happened: "1,200 for 2 wigs on GCash, lunch 340 cash". You can also attach a receipt photo.</div>}
              {msgs.map((m, i) => m.role === 'user' ? (
                <div key={i} className="rise" style={{ alignSelf: 'flex-end', maxWidth: '82%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  {m.rowLabel && <span style={{ fontSize: 11, color: '#8A93A6' }}>About {m.rowLabel}</span>}
                  {m.image && <img src={m.image} alt="Attached photo" style={{ maxWidth: 160, borderRadius: 14 }} />}
                  {m.photo && !m.image && <span style={{ fontSize: 11, color: '#8A93A6' }}>Photo sent</span>}
                  <div style={{ padding: '11px 14px', borderRadius: '20px 20px 6px 20px', background: 'var(--ink)', color: 'var(--bg)', fontSize: 15, fontWeight: 600 }}>{m.shown || m.content}</div>
                </div>
              ) : (
                <div key={i} className="rise" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 15, lineHeight: 1.5, color: '#E4E7EE', whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  {(m.actions || []).length > 0 && (
                    <div className="glass" style={{ padding: 12, borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {m.actions.map((a, k) => (
                        <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 2px', cursor: a.state === 'pending' || a.state === 'failed' ? 'pointer' : 'default', opacity: a.state === 'skipped' || a.state === 'undone' || !a.on ? 0.5 : 1 }}>
                          <input type="checkbox" checked={a.on} disabled={!(a.state === 'pending' || a.state === 'failed')} onChange={() => toggle(i, k)} style={{ width: 20, height: 20, marginTop: 1, accentColor: '#3DDC97', flexShrink: 0 }} aria-label={a.label || a.op} />
                          <span style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{a.label || a.op}</span>
                            {detail(a) && <span style={{ display: 'block', fontSize: 12, color: '#8A93A6' }}>{detail(a)}</span>}
                            {a.state === 'failed' && <span style={{ display: 'block', fontSize: 12, color: 'var(--over)' }}>{a.err || "Didn't save"}</span>}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: a.state === 'done' ? 'var(--under)' : '#8A93A6', whiteSpace: 'nowrap' }}>{a.state === 'done' ? '✓' : a.state === 'saving' ? '…' : a.state === 'undone' ? 'Undone' : a.state === 'skipped' ? 'Skipped' : ''}</span>
                        </label>
                      ))}
                      {m.error && <div className="small" style={{ color: 'var(--over)' }}>{m.error}</div>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        {m.actions.some((a) => a.on && (a.state === 'pending' || a.state === 'failed')) && (
                          <>
                            <button className="btn" style={{ minHeight: 42, fontSize: 14 }} onClick={() => confirm(i)}>{m.actions.some((a) => a.state === 'failed') ? 'Retry' : 'Confirm' + (m.actions.filter((a) => a.on).length > 1 ? ' ' + m.actions.filter((a) => a.on && a.state !== 'done').length : '')}</button>
                            <button className="chip" style={{ minHeight: 42 }} onClick={() => skip(i)}>Skip</button>
                          </>
                        )}
                        {(m.undo || []).length > 0 && <button className="chip" style={{ minHeight: 38 }} disabled={m.undoing} onClick={() => undo(i)}>{m.undoing ? 'Undoing…' : 'Undo'}</button>}
                      </div>
                    </div>
                  )}
                  {i === last && !busy && (m.replies || []).length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {m.replies.map((r) => <button key={r} className="chip rise" style={{ fontSize: 12, minHeight: 34 }} onClick={() => send(r)}>{r}</button>)}
                    </div>
                  )}
                </div>
              ))}
              {busy && <div className="typing rise" role="status" aria-label="Thinking"><span /><span /><span /></div>}
              <div ref={end} />
            </div>
            {msgs.length === 0 && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                {chips.map((c, k) => <button key={c} className="chip rise" style={{ flexShrink: 0, fontSize: 12, animationDelay: 0.1 + k * 0.04 + 's' }} onClick={() => startChip(c)}>{c.trim().replace(/:$/, '')}</button>)}
              </div>
            )}
            {(row || photo) && (
              <div className="row" style={{ gap: 8, justifyContent: 'flex-start', fontSize: 12, color: 'var(--muted)' }}>
                {row && <span className="chip" style={{ minHeight: 30, fontSize: 12 }} onClick={() => setRow(null)}>About {row.merchant} · {peso(row.amount)} ✕</span>}
                {photo && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><img src={photo} alt="Photo to send" style={{ height: 36, borderRadius: 8 }} /><button className="chip" style={{ minHeight: 30, fontSize: 12 }} onClick={() => setPhoto('')}>Remove</button></span>}
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 6px 6px 6px', borderRadius: 28, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
              <button type="button" onClick={() => file.current && file.current.click()} aria-label="Attach a receipt photo" style={{ width: 40, height: 40, borderRadius: 20, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
              </button>
              <input ref={file} id="ask-photo" type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) { try { setPhoto(await shrink(f)); } catch (err) {} } }} />
              <input id="ask-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={row ? 'What about this one?' : 'Ask or tell Money anything'} aria-label="Message" style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', fontSize: 16, outline: 'none' }} />
              <button disabled={busy || (!text.trim() && !photo)} aria-label="Send" style={{ width: 44, height: 44, borderRadius: 22, border: 0, background: 'var(--ink)', color: 'var(--bg)', fontWeight: 800, cursor: 'pointer', opacity: busy || (!text.trim() && !photo) ? 0.5 : 1 }}>↑</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
