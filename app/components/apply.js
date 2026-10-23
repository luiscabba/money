'use client';
// Sends confirmed changes to the sheet, then refreshes every screen.
// Each change succeeds or fails on its own; `undo` holds what puts the successful ones back.
export async function applyOps(ops) {
  let j;
  try {
    const res = await fetch('/api/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops }) });
    j = await res.json();
  } catch (e) {
    j = { error: "Couldn't reach Money. Nothing was changed." };
  }
  window.dispatchEvent(new Event('money:reload'));
  if (j.error) return { ok: false, error: j.error, results: ops.map(() => ({ ok: false, error: j.error })), undo: [] };
  const results = j.results || [];
  const undo = results.filter((r) => r.ok && r.undo).flatMap((r) => r.undo).reverse();
  const bad = results.filter((r) => !r.ok);
  return { ok: !bad.length, error: bad.map((b) => b.error).join(', '), results, undo };
}

export async function undoOps(undo) {
  if (!undo || !undo.length) return { ok: false };
  try {
    const res = await fetch('/api/undo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops: undo }) });
    const j = await res.json();
    window.dispatchEvent(new Event('money:reload'));
    return { ok: !j.error && (j.results || []).every((r) => r.ok) };
  } catch (e) {
    return { ok: false };
  }
}

// Shows a short message at the bottom, with Undo when the change can be put back.
export function toast(text, undo) {
  window.dispatchEvent(new CustomEvent('money:toast', { detail: { text, undo } }));
}

// Applies, then confirms with a toast that can undo it.
export async function change(ops, doneText) {
  const r = await applyOps(ops);
  if (r.ok) toast(doneText, r.undo);
  else toast("Didn't save: " + (r.error || 'try again'));
  return r;
}

export const openTx = (t) => window.dispatchEvent(new CustomEvent('money:tx', { detail: t }));
export const openAdd = () => window.dispatchEvent(new Event('money:add'));
export const askMoney = (text, row) => window.dispatchEvent(new CustomEvent('money:ask', { detail: { text, row } }));
