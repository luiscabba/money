'use client';
import { useEffect, useRef, useState } from 'react';
import { applyOps, undoOps } from './apply';
import useData from './useData';
import { peso, needsReview, manilaNow, netExpenses } from '../lib/money';
import { safeToSpend } from '../lib/safe';
import Moni, { ambientMood, MOODS } from './Moni';
import Visual from './Visual';
import { moniMode } from '../lib/mode';

const KEY = 'askMoney.v2';
const PAST = 'askMoney.past';
const when = (d) => new Date(String(d).replace(' ', 'T')).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// One line under each proposed change so he sees exactly what will be written.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function goalDetail(a) {
  const bits = [];
  if (a.price) bits.push(peso(a.price));
  if (a.amount) bits.push((a.amount < 0 ? 'take out ' : '') + peso(Math.abs(a.amount)));
  if (a.date !== undefined) { const m = /^(\d{4})-(\d\d)/.exec(String(a.date)); bits.push(m ? 'ready ' + MON[Number(m[2]) - 1] + ' ' + m[1] : 'no date'); }
  if (a.name && a.op === 'goal_edit') bits.push('renamed ' + a.name);
  if (a.moves) bits.push(a.moves.map((x) => peso(x.amount)).join(' + '));
  return bits.join(' · ');
}

function detail(a) {
  if (String(a.op).startsWith('goal_')) return goalDetail(a);
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
  const [streaming, setStreaming] = useState(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState('');
  const gen = useRef(0); // bumped by New chat, so a reply still streaming stops writing into the cleared chat
  const saving = useRef(false);
  const [quote, setQuote] = useState(null); // {text} of a swiped message he is replying to
  const [sheet, setSheet] = useState(''); // 'plus' or 'history'
  const [past, setPast] = useState([]);
  const [micOk, setMicOk] = useState(false);
  const [listening, setListening] = useState(false);
  const [face, setFace] = useState(''); // the reply's face, shown in the header for a moment
  const rec = useRef(null);
  const cam = useRef(null);
  const input = useRef(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(KEY);
      // A change caught mid-save when the app closed is shown as failed so it can be retried.
      if (s) setMsgs(JSON.parse(s).map((m) => (m.actions ? { ...m, actions: m.actions.map((a) => (a.state === 'saving' ? { ...a, state: 'failed', err: 'Not sure it saved. Check, then retry.' } : a)) } : m)));
    } catch (e) {}
    try { setPast(JSON.parse(localStorage.getItem(PAST) || '[]')); } catch (e) {}
    setMicOk(typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition));
    setReady(true);
  }, []);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
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
    // Saved on the phone (photos left out) so a half-finished chat survives closing the app; not on every streamed word.
    if (ready && !streaming) { try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-30).map(({ image, ...m }) => (image ? { ...m, photo: true } : m)))); } catch (e) {} }
    if (end.current) end.current.scrollIntoView({ block: 'end' });
  }, [msgs, open, streaming, ready]);

  const send = async (q) => {
    const typed = (q !== undefined ? q : text).trim();
    if ((!typed && !photo) || busy || streaming) return;
    const q2 = quote ? '[Replying to: "' + quote.text.slice(0, 300) + '"] ' : '';
    const content = (row ? rowContext(row) : '') + q2 + typed;
    const mine = { role: 'user', content, shown: typed || 'Photo', rowLabel: row ? row.merchant + ' · ' + peso(row.amount) : '', quote: quote ? quote.text.slice(0, 90) : '', image: photo || undefined, at: Date.now() };
    const next = [...msgs.map((m) => ({ ...m, replies: undefined })), mine];
    setMsgs(next); setText(''); setPhoto(''); setRow(null); setQuote(null); setSheet(''); setBusy(true); setStreaming(true);
    const mineGen = gen.current, base = next.length;
    // Writes the reply into its own slot, keeping any edits made to earlier messages meanwhile.
    const put = (msg) => { if (gen.current === mineGen) setMsgs((cur) => [...cur.slice(0, base), msg]); };
    const payload = next.map((m, k) => ({ role: m.role, content: m.content, image: k === next.length - 1 ? m.image : undefined }));
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: payload }) });
      if ((res.headers.get('content-type') || '').includes('ndjson') && res.body) {
        let reply = '', actions = [], replies = [], mood = '', visuals = [];
        const show = () => put({ role: 'assistant', content: reply, actions: actions.map((a) => ({ ...a, on: true, state: 'pending' })), replies, mood, visuals, at: Date.now() });
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
            if (ev.actions) { actions = ev.actions; replies = ev.replies || []; mood = MOODS.includes(ev.mood) ? ev.mood : ''; visuals = Array.isArray(ev.visuals) ? ev.visuals : []; }
          }
        }
        if (!reply.trim() && actions.length) reply = actions.length === 1 ? "Here's the change:" : "Here are the changes:";
        show();
        if (mood) { setFace(mood); setTimeout(() => setFace(''), 4000); }
      } else {
        const j = await res.json();
        put({ role: 'assistant', content: j.reply || j.error || 'No answer.', actions: (j.actions || []).map((a) => ({ ...a, on: true, state: 'pending' })) });
      }
    } catch (e) {
      put({ role: 'assistant', content: "Couldn't reach Moni. Try again." });
    }
    setBusy(false); setStreaming(false);
  };

  // A send asked for before the saved chat loaded (the 8pm check-in) waits until it has.
  useEffect(() => {
    if (ready && pending) { const q = pending; setPending(''); send(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pending]);

  useEffect(() => {
    // The 8pm check-in push opens Ask straight into a walk-through.
    if (typeof window === 'undefined') return;
    const u = new URL(window.location.href);
    if (u.searchParams.get('ask') === 'checkin') {
      u.searchParams.delete('ask');
      window.history.replaceState(null, '', u.pathname + u.search);
      setOpen(true);
      setPending('Walk me through what needs sorting today.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upd = (i, f) => setMsgs((cur) => cur.map((x, k) => (k === i ? f(x) : x)));
  const toggle = (i, k) => upd(i, (m) => ({ ...m, actions: m.actions.map((a, j) => (j === k ? { ...a, on: !a.on } : a)) }));

  // Applies the ticked changes that haven't saved yet; a retry never re-sends ones that already saved.
  const confirm = async (i) => {
    if (saving.current) return; // a fast double tap must not apply the same change twice
    const m = msgs[i];
    const todo = m.actions.map((a, k) => ({ a, k })).filter(({ a }) => a.on && a.state !== 'done');
    if (!todo.length) return;
    saving.current = true;
    upd(i, (x) => ({ ...x, error: '', actions: x.actions.map((a) => (todo.some((t) => t.a === a) ? { ...a, state: 'saving' } : a)) }));
    const r = await applyOps(todo.map(({ a }) => { const { label, on, state, err, ...op } = a; return op; }));
    saving.current = false;
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
    upd(i, (x) => ({ ...x, undoing: false, mood: r.ok ? 'wink' : x.mood, undo: r.ok ? [] : x.undo, error: r.ok ? '' : "Couldn't undo. Ask me to change it back.", actions: r.ok ? x.actions.map((a) => (a.state === 'done' ? { ...a, state: 'undone' } : a)) : x.actions }));
  };

  // New chat keeps the old one under Past chats (last ten).
  const archive = (list) => {
    if (!list.some((m) => m.role === 'user')) return past;
    const first = list.find((m) => m.role === 'user');
    const next = [{ at: Date.now(), title: String(first.shown || first.content).slice(0, 60), msgs: list.slice(-30).map(({ image, ...m }) => m) }, ...past].slice(0, 10);
    setPast(next);
    try { localStorage.setItem(PAST, JSON.stringify(next)); } catch (e) {}
    return next;
  };
  const newChat = () => { archive(msgs); gen.current++; setMsgs([]); setBusy(false); setStreaming(false); setQuote(null); setSheet(''); };
  const reopen = (k) => {
    const list = archive(msgs);
    const pick = list[msgs.some((m) => m.role === 'user') ? k + 1 : k];
    if (!pick) return;
    const rest = list.filter((x) => x !== pick);
    setPast(rest);
    try { localStorage.setItem(PAST, JSON.stringify(rest)); } catch (e) {}
    gen.current++; setMsgs(pick.msgs); setBusy(false); setStreaming(false); setSheet('');
  };
  const mic = () => {
    if (listening && rec.current) { rec.current.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = 'en-PH'; r.interimResults = true; r.continuous = false;
    const before = text ? text.replace(/\s*$/, ' ') : '';
    r.onresult = (e) => setText(before + Array.from(e.results).map((x) => x[0].transcript).join(''));
    r.onend = () => { setListening(false); rec.current = null; };
    r.onerror = () => { setListening(false); rec.current = null; };
    rec.current = r; setListening(true);
    try { r.start(); } catch (e) { setListening(false); }
  };
  const about = (t) => { setRow(t); setSheet(''); setTimeout(() => input.current && input.current.focus(), 50); };
  const pickPhoto = async (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; setSheet(''); if (f) { try { setPhoto(await shrink(f)); } catch (err) {} } };

  // Starters drawn from what needs attention right now.
  const nowK = manilaNow().key;
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false })) % 24;
  const todaySpent = data ? netExpenses(data).filter((t) => t.date.startsWith(nowK)).reduce((a, t) => a + t.amount, 0) : 0;
  const ambient = ambientMood(data && { ...data, todaySpent }, hour);
  const mode = moniMode(data, hour);
  const review = data ? needsReview(data).slice(0, 3) : [];
  const gaps = data ? (data.gaps || []).slice(0, 2) : [];
  const gapText = (g) => `${peso(Math.abs(g.amount))} ${g.amount < 0 ? 'left' : 'came into'} ${g.account} untracked`;
  const chips = [];
  if (data) { const rv = needsReview(data).length; if (rv > 1) chips.push(`Help me sort ${rv} payments`); }
  if (data) { try { const s = safeToSpend(data, manilaNow()); if (s.safe < 0) chips.push(`Why am I ${peso(-s.safe)} over today?`); } catch (e) {} }
  chips.push('Where did my money go this week?', 'Can I afford ', 'What if I ', 'Log a payment: ');
  const startChip = (c) => { if (/[: ]$/.test(c)) { setText(c); setTimeout(() => input.current && input.current.focus(), 50); } else send(c); };
  const last = msgs.length - 1;
  const lastMsg = msgs[last];
  const replies = !busy && !streaming && lastMsg && lastMsg.role === 'assistant' ? lastMsg.replies || [] : [];
  const headFace = listening || (text.trim() && !busy) ? 'listen' : busy || streaming ? 'think' : face || mode.face;
  const greet = (hour < 12 ? 'Morning' : hour < 18 ? 'Hey' : 'Evening') + ' Luis.';
  const opener = { chill: mode.status ? mode.status + '.' : 'What do you need?', hyped: mode.status + '. Look at you.', sideeye: mode.status + '. We should talk.', sleepy: "It's late. Make it quick?" }[mode.key];
  const recent = data ? netExpenses(data).slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3) : [];
  const clock = (t) => new Date(t).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
  const pill = { flexShrink: 0, minHeight: 38, padding: '0 14px', borderRadius: 19, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.08)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
  const round = { width: 44, height: 44, borderRadius: 22, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.08)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 };
  const moniBubble = { padding: '12px 15px', background: 'rgba(255,255,255,0.1)', fontSize: 16, lineHeight: 1.45, color: '#EDEFF4', whiteSpace: 'pre-wrap' };

  return (
    <>
      {!open && button && (
        <button onClick={() => setOpen(true)} aria-label="Ask Moni" className="pop"
          style={{ position: 'fixed', right: 'max(16px, calc(50vw - 244px))', bottom: 'calc(84px + env(safe-area-inset-bottom))', zIndex: 20, minHeight: 44, padding: '0 16px 0 6px', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 22, border: 0, background: 'var(--ink)', color: 'var(--bg)', fontSize: 14, fontWeight: 800, boxShadow: '0 8px 30px rgba(0,0,0,0.45)', cursor: 'pointer' }}>
          <Moni size={32} mood={ambient} />Ask Moni
        </button>
      )}
      {open && (
        <div role="dialog" aria-label="Moni" className="sheetup" style={{ position: 'fixed', inset: 0, zIndex: 30, background: '#0B0D10', display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
          <div aria-hidden="true" style={{ position: 'absolute', left: '50%', top: -280, width: 680, height: 540, marginLeft: -340, borderRadius: '50%', background: `radial-gradient(closest-side, ${mode.glow}, transparent)`, transition: 'background 0.6s ease', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', padding: 'calc(12px + env(safe-area-inset-top)) 16px calc(12px + env(safe-area-inset-bottom))', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span key={headFace} className="hop" style={{ display: 'block' }}><Moni size={44} mood={headFace} colors={mode.colors} label="Moni" /></span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <b style={{ fontSize: 18 }}>Moni</b>
                <span style={{ fontSize: 12, fontWeight: 700, color: mode.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listening ? 'Listening…' : busy ? 'Thinking…' : mode.name + (mode.status ? ' · ' + mode.status : '')}</span>
              </span>
              <button onClick={() => setSheet(sheet === 'history' ? '' : 'history')} aria-label="Chats" style={round}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              </button>
              <button onClick={() => { setOpen(false); setSheet(''); }} aria-label="Close" style={round}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8 }}>
              <div style={{ flex: 1 }} />
              {msgs.length === 0 && (
                <>
                  <span className="rise" style={{ ...moniBubble, alignSelf: 'flex-start', maxWidth: '84%', borderRadius: '22px 22px 22px 6px' }}>{greet} {opener}</span>
                  {(review.length > 0 || gaps.length > 0) && (
                    <>
                      <span className="rise" style={{ ...moniBubble, alignSelf: 'flex-start', maxWidth: '84%', borderRadius: '6px 22px 22px 22px', animationDelay: '0.12s' }}>{review.length + gaps.length === 1 ? 'One thing needs you:' : 'A few things need you:'}</span>
                      <div className="rise" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '2px -16px 0', padding: '0 16px 4px', animationDelay: '0.24s' }}>
                        {review.map((t) => (
                          <button key={'r' + t.row} onClick={() => about(t)} style={{ flexShrink: 0, width: 196, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: 14, borderRadius: 20, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: 'var(--ink)', textAlign: 'left', cursor: 'pointer' }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ahead)' }}>What was this?</span>
                            <b style={{ fontSize: 15, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.merchant} · {peso(t.amount)}</b>
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t.source} · {when(t.date)}</span>
                          </button>
                        ))}
                        {gaps.map((g, k) => (
                          <button key={'g' + k} onClick={() => send(gapText(g))} style={{ flexShrink: 0, width: 196, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: 14, borderRadius: 20, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: 'var(--ink)', textAlign: 'left', cursor: 'pointer' }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--over)' }}>{g.amount < 0 ? 'Missing money' : 'Money came in'}</span>
                            <b style={{ fontSize: 15 }}>{g.account} · {peso(Math.abs(g.amount))}</b>
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Balance moved, no text</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
              {msgs.map((m, i) => {
                const prev = msgs[i - 1];
                const stamp = m.at && (!prev || !prev.at || m.at - prev.at > 20 * 60000) ? <span key={'t' + i} style={{ alignSelf: 'center', fontSize: 11, color: '#8A93A6', padding: '8px 0 2px' }}>{clock(m.at)}</span> : null;
                const gap = prev && prev.role !== m.role ? 8 : 0;
                if (m.role === 'user') return (
                  <div key={i} style={{ display: 'contents' }}>
                    {stamp}
                    <Swipe onQuote={() => { setQuote({ text: m.shown || m.content }); input.current && input.current.focus(); }}>
                      <div className="rise" style={{ marginTop: gap, marginLeft: 'auto', alignSelf: 'flex-end', maxWidth: '80%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                        {(m.rowLabel || m.quote) && <span style={{ padding: '7px 11px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', borderLeft: '3px solid var(--under)', fontSize: 12, color: 'var(--muted)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.rowLabel || m.quote}</span>}
                        {m.image && <img src={m.image} alt="Attached photo" style={{ maxWidth: 170, borderRadius: 16 }} />}
                        {m.photo && !m.image && <span style={{ fontSize: 11, color: '#8A93A6' }}>Photo sent</span>}
                        <div style={{ padding: '11px 15px', borderRadius: '22px 22px 6px 22px', background: 'var(--ink)', color: 'var(--bg)', fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>{m.shown || m.content}</div>
                      </div>
                    </Swipe>
                  </div>
                );
                const acts = m.actions || [];
                const pendingActs = acts.some((a) => a.on && (a.state === 'pending' || a.state === 'failed'));
                const hasUndo = (m.undo || []).length > 0;
                const buttons = acts.length > 0 && (pendingActs || hasUndo);
                return (
                  <div key={i} style={{ display: 'contents' }}>
                    {stamp}
                    <Swipe onQuote={() => { setQuote({ text: m.content }); input.current && input.current.focus(); }}>
                      <div className="rise" style={{ marginTop: gap, alignSelf: 'flex-start', maxWidth: '88%', display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {(m.content || acts.length > 0) && (
                          <div style={{ ...moniBubble, borderRadius: buttons ? '22px 22px 6px 6px' : '22px 22px 22px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {m.content && <span>{m.content}</span>}
                            {acts.map((a, k) => (
                              <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: acts.length > 1 && (a.state === 'pending' || a.state === 'failed') ? 'pointer' : 'default', opacity: a.state === 'skipped' || a.state === 'undone' || !a.on ? 0.5 : 1, whiteSpace: 'normal' }}>
                                {acts.length > 1 && <input type="checkbox" checked={a.on} disabled={!(a.state === 'pending' || a.state === 'failed')} onChange={() => toggle(i, k)} style={{ width: 20, height: 20, marginTop: 1, accentColor: '#3DDC97', flexShrink: 0 }} aria-label={a.label || a.op} />}
                                <span style={{ minWidth: 0, flex: 1 }}>
                                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>{a.label || a.op}</span>
                                  {detail(a) && <span style={{ display: 'block', fontSize: 12, color: '#9AA3B5' }}>{detail(a)}</span>}
                                  {a.state === 'failed' && <span style={{ display: 'block', fontSize: 12, color: 'var(--over)' }}>{a.err || "Didn't save"}</span>}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 800, color: a.state === 'done' ? 'var(--under)' : '#8A93A6', whiteSpace: 'nowrap' }}>{a.state === 'done' ? '✓' : a.state === 'saving' ? '…' : a.state === 'undone' ? 'Undone' : a.state === 'skipped' ? 'Skipped' : ''}</span>
                              </label>
                            ))}
                            {m.error && <span style={{ fontSize: 13, color: 'var(--over)' }}>{m.error}</span>}
                          </div>
                        )}
                        {buttons && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
                            {pendingActs ? (
                              <>
                                <button onClick={() => confirm(i)} style={{ minHeight: 44, border: 0, borderRadius: '6px 6px 6px 22px', background: 'rgba(255,255,255,0.1)', color: 'var(--under)', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>{acts.some((a) => a.state === 'failed') ? 'Retry' : acts.filter((a) => a.on && a.state !== 'done').length > 1 ? 'Confirm ' + acts.filter((a) => a.on && a.state !== 'done').length : 'Confirm'}</button>
                                <button onClick={() => skip(i)} style={{ minHeight: 44, border: 0, borderRadius: '6px 6px 22px 6px', background: 'rgba(255,255,255,0.1)', color: 'var(--ink)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Skip</button>
                              </>
                            ) : (
                              <>
                                <span style={{ minHeight: 44, borderRadius: '6px 6px 6px 22px', background: 'rgba(255,255,255,0.1)', color: 'var(--under)', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Done ✓</span>
                                <button disabled={m.undoing} onClick={() => undo(i)} style={{ minHeight: 44, border: 0, borderRadius: '6px 6px 22px 6px', background: 'rgba(255,255,255,0.1)', color: 'var(--ink)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{m.undoing ? 'Undoing…' : 'Undo'}</button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </Swipe>
                    {(m.visuals || []).map((v, k) => <div key={'v' + k} style={{ marginTop: 6 }}><Visual v={v} /></div>)}
                  </div>
                );
              })}
              {busy && (
                <div className="rise" role="status" aria-label="Moni is thinking" style={{ ...moniBubble, alignSelf: 'flex-start', marginTop: 8, borderRadius: '22px 22px 22px 6px', padding: '15px 16px' }}><div className="typing"><span /><span /><span /></div></div>
              )}
              <div ref={end} />
            </div>

            {(msgs.length === 0 || replies.length > 0) && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
                {(msgs.length === 0 ? chips : replies).map((c, k) => (
                  <button key={c} className="rise" style={{ ...pill, animationDelay: 0.05 + k * 0.04 + 's' }} onClick={() => (msgs.length === 0 ? startChip(c) : send(c))}>{c.trim().replace(/:$/, '')}</button>
                ))}
              </div>
            )}
            {(row || photo || quote) && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
                {(row || quote) && (
                  <span style={{ flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 14, background: 'rgba(255,255,255,0.06)', borderLeft: '3px solid var(--under)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row ? row.merchant + ' · ' + peso(row.amount) : quote.text}</span>
                )}
                {(row || quote) && <button onClick={() => { setRow(null); setQuote(null); }} aria-label="Stop replying to this" style={{ ...round, width: 36, height: 36 }}>✕</button>}
                {photo && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><img src={photo} alt="Photo to send" style={{ height: 40, borderRadius: 8 }} /><button className="chip" style={{ minHeight: 40, fontSize: 12 }} onClick={() => setPhoto('')}>Remove</button></span>}
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={() => setSheet(sheet === 'plus' ? '' : 'plus')} aria-label="More" aria-expanded={sheet === 'plus'} style={{ ...round, width: 46, height: 46, transform: sheet === 'plus' ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s ease' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              </button>
              <input ref={file} id="ask-photo" type="file" accept="image/*" hidden onChange={pickPhoto} />
              <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={pickPhoto} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 4px 4px 16px', borderRadius: 26, background: 'rgba(255,255,255,0.1)', border: '1px solid ' + (listening ? mode.color : 'rgba(255,255,255,0.2)') }}>
                <input ref={input} id="ask-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={row ? 'What was it?' : quote ? 'Reply' : listening ? 'Listening…' : 'Message Moni'} aria-label="Message" autoComplete="off" style={{ flex: 1, minWidth: 0, height: 40, border: 0, background: 'transparent', fontSize: 16, outline: 'none', color: 'var(--ink)' }} />
                {(text.trim() || photo || !micOk) ? (
                  <button disabled={busy || streaming || (!text.trim() && !photo)} aria-label="Send" className="pop" style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 20, border: 0, background: 'var(--ink)', color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: busy || streaming || (!text.trim() && !photo) ? 0.4 : 1 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
                  </button>
                ) : (
                  <button type="button" onClick={mic} aria-label={listening ? 'Stop listening' : 'Talk'} style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 20, border: 0, background: listening ? mode.color : 'transparent', color: listening ? 'var(--bg)' : 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                  </button>
                )}
              </div>
            </form>
          </div>

          {sheet && (
            <div onClick={() => setSheet('')} style={{ position: 'absolute', inset: 0, zIndex: 2, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <div onClick={(e) => e.stopPropagation()} className="sheetup" style={{ width: '100%', maxWidth: 520, maxHeight: '80%', overflowY: 'auto', boxSizing: 'border-box', padding: '10px 16px calc(24px + env(safe-area-inset-bottom))', borderRadius: '28px 28px 0 0', background: '#14171C', border: '1px solid rgba(255,255,255,0.16)', borderBottom: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <span style={{ width: 40, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.25)', alignSelf: 'center' }} />
                {sheet === 'plus' ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                      {[
                        ['Scan receipt', () => cam.current && cam.current.click(), 'M4 8h3l2-3h6l2 3h3v11H4z|c12,13,3.5', true],
                        ['Photos', () => file.current && file.current.click(), 'M4 4h16v16H4z|M20 16l-5-5-8 9|c9,10,1.6'],
                        ['Chart', () => send('Show my spending this month as a chart'), 'M5 18V9M10 18V5M15 18v-6M20 18v-9'],
                        ['Table', () => { setSheet(''); setText('Table of '); setTimeout(() => input.current && input.current.focus(), 50); }, 'M4 5h16v14H4z|M4 10h16M10 10v9'],
                        ['What if', () => { setSheet(''); setText('What if I '); setTimeout(() => input.current && input.current.focus(), 50); }, 'M4 12h16|c9,12,3'],
                        ['Log payment', () => { setSheet(''); setText('Log a payment: '); setTimeout(() => input.current && input.current.focus(), 50); }, 'c12,12,8|M12 8v8M8 12h8']
                      ].map(([label, go, d, main]) => (
                        <button key={label} onClick={go} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 6px', borderRadius: 20, border: main ? 0 : '1px solid rgba(255,255,255,0.16)', background: main ? 'var(--ink)' : 'rgba(255,255,255,0.08)', color: main ? 'var(--bg)' : 'var(--ink)', fontSize: 13, fontWeight: main ? 800 : 700, cursor: 'pointer' }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            {d.split('|').map((x, k) => (x.startsWith('c') ? <circle key={k} cx={x.slice(1).split(',')[0]} cy={x.split(',')[1]} r={x.split(',')[2]} /> : <path key={k} d={x} />))}
                          </svg>
                          {label}
                        </button>
                      ))}
                    </div>
                    {recent.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', paddingBottom: 4 }}>Talk about a payment</span>
                        {recent.map((t, k) => (
                          <button key={t.row || k} onClick={() => about(t)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, minHeight: 54, border: 0, borderTop: k ? '1px solid rgba(255,255,255,0.08)' : 0, background: 'transparent', color: 'var(--ink)', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}><b style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.merchant}</b><span style={{ fontSize: 12, color: 'var(--muted)' }}>{t.source} · {when(t.date)}</span></span>
                            <b style={{ fontSize: 15 }}>{peso(t.amount)}</b>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <button onClick={newChat} style={{ minHeight: 50, borderRadius: 25, border: 0, background: 'var(--ink)', color: 'var(--bg)', fontSize: 15, fontWeight: 800, cursor: 'pointer', marginBottom: 10 }}>New chat</button>
                    {past.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: 12 }}>Past chats show up here.</span>}
                    {past.map((c, k) => (
                      <button key={c.at} onClick={() => reopen(k)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minHeight: 56, padding: '8px 0', border: 0, borderTop: k ? '1px solid rgba(255,255,255,0.08)' : 0, background: 'transparent', color: 'var(--ink)', textAlign: 'left', cursor: 'pointer' }}>
                        <b style={{ fontSize: 15, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</b>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(c.at).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })} · {c.msgs.length} messages</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// Swipe a message right to reply to it, like WhatsApp.
function Swipe({ onQuote, children }) {
  const [dx, setDx] = useState(0);
  const st = useRef(null);
  return (
    <div style={{ position: 'relative', touchAction: 'pan-y' }}
      onTouchStart={(e) => { const t = e.touches[0]; st.current = { x: t.clientX, y: t.clientY, lock: '' }; }}
      onTouchMove={(e) => {
        const s0 = st.current; if (!s0) return;
        const t = e.touches[0], x = t.clientX - s0.x, y = t.clientY - s0.y;
        if (!s0.lock) s0.lock = Math.abs(x) > 8 && Math.abs(x) > Math.abs(y) ? 'x' : Math.abs(y) > 8 ? 'y' : '';
        if (s0.lock === 'x') setDx(Math.max(0, Math.min(72, x)));
      }}
      onTouchEnd={() => { if (dx > 52) onQuote(); setDx(0); st.current = null; }}>
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: '50%', marginTop: -14, width: 28, height: 28, borderRadius: 14, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: Math.min(1, dx / 52), transform: `scale(${0.6 + Math.min(0.4, dx / 130)})` }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F2F4F8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 7l-5 5 5 5M5 12h9a5 5 0 0 1 5 5v1" /></svg>
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', transform: `translateX(${dx}px)`, transition: dx ? 'none' : 'transform 0.25s ease' }}>{children}</div>
    </div>
  );
}
