'use client';
// Sends confirmed changes to the sheet, then refreshes every screen.
export async function applyOps(ops) {
  const res = await fetch('/api/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops }) });
  const j = await res.json().catch(() => ({ error: 'bad response' }));
  window.dispatchEvent(new Event('money:reload'));
  if (j.error) return { ok: false, error: j.error };
  const bad = (j.results || []).filter((r) => !r.ok);
  return bad.length ? { ok: false, error: bad.map((b) => b.error).join(', ') } : { ok: true };
}
