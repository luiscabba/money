import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { loadData, rules, setting, setSetting } from '../../../lib/store';
import { applyOps } from '../../../lib/ops';
import { safeToSpend } from '../../../lib/safe';
import { manilaDay, peso } from '../../../lib/core';
import { ASK_MODEL, OPS, TOOLS, buildPrompt } from '../../../lib/askPrompt';
import { readReceipt, receiptOp } from '../../../lib/receipt';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Siri / Action Button: {text} -> Moni proposes; {confirm: id} -> applies it. Its own token (?t=), separate from the passcode.
const hash = (s) => createHash('sha256').update(String(s)).digest('hex');
const PENDING = 'shortcut_pending';
const TTL = 15 * 60000;

async function leftToday() {
  const [y, m, d] = manilaDay().split('-').map(Number);
  const s = safeToSpend(await loadData(2), { y, m, d });
  return s.safe >= 0 ? peso(s.safe) + ' left today.' : peso(-s.safe) + ' over today.';
}

export async function POST(req) {
  const t = new URL(req.url).searchParams.get('t') || '';
  const want = await setting('shortcut_token');
  if (!t || !want || hash(t) !== want) return NextResponse.json({ say: 'Shortcut not authorised.', id: '' }, { status: 401 });
  let body = {};
  try { body = await req.json(); } catch (e) { body = {}; }
  const now = Date.now();
  const pending = ((await setting(PENDING)) || []).filter((p) => now - p.at < TTL);

  // Step 2: he tapped "Log it".
  if (body.confirm) {
    const p = pending.find((x) => x.id === String(body.confirm));
    if (!p) return NextResponse.json({ say: 'Already logged, or it expired. Check the app.', id: '' });
    await setSetting(PENDING, pending.filter((x) => x.id !== p.id));
    const res = await applyOps(p.ops, 'app');
    const bad = res.filter((r) => !r.ok);
    if (bad.length) return NextResponse.json({ say: "Didn't save: " + bad.map((b) => b.error).join(', '), id: '' });
    return NextResponse.json({ say: 'Logged. ' + (await leftToday()) + ' Ask Moni to undo it if needed.', id: '' });
  }

  // A receipt photo or order screenshot shared to the Shortcut: read it, then ask to confirm like a spoken one.
  if (body.image) {
    let r;
    try { r = await readReceipt(body.image); } catch (e) { return NextResponse.json({ say: "Couldn't read that: " + String(e && e.message ? e.message : e) + '.', id: '' }); }
    const op = receiptOp(r, r.wallet);
    const id = randomBytes(6).toString('hex');
    await setSetting(PENDING, pending.concat({ id, ops: [op], at: now }).slice(-5));
    const cats = r.parts.map((p) => p.category);
    const catText = cats.length > 1 ? cats.slice(0, -1).join(', ') + ' and ' + cats[cats.length - 1] : cats[0];
    return NextResponse.json({ say: 'Log ' + peso(r.total) + ' at ' + r.merchant + ', ' + catText + (r.wallet ? ', paid with ' + r.wallet : ', as cash') + '?', id });
  }

  // Step 1: his words.
  const text = String(body.text || '').trim().slice(0, 500);
  if (!text) return NextResponse.json({ say: 'Say what you spent, like 450 on Grab.', id: '' });
  if (!process.env.CLAUDE_API_KEY) return NextResponse.json({ say: 'Moni is not set up.', id: '' });
  const data = await loadData(13);
  data.rules = await rules().catch(() => []);
  const { system } = buildPrompt(data);
  const extra = '\n\nThis message comes from Siri on his phone. Reply in one short plain sentence, no markdown, no lists. If he is logging spending or money, propose the change now with propose_changes (he confirms on his phone next), and phrase the reply as the question, e.g. "Log ₱450 Grab as Transport, paid with GCash?". Guess the wallet from his usual one for that merchant; if unsure use Cash.';
  let j;
  try {
    const r = await fetch((process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: ASK_MODEL, max_tokens: 800, system: system + extra, tools: TOOLS, messages: [{ role: 'user', content: text }] }),
      signal: AbortSignal.timeout(50000)
    });
    j = await r.json();
  } catch (e) {
    return NextResponse.json({ say: "Moni didn't answer in time. Try again.", id: '' });
  }
  const blocks = j.content || [];
  const say = blocks.filter((b) => b.type === 'text').map((b) => b.text).join(' ').replace(/\s+/g, ' ').trim();
  const ops = blocks.filter((b) => b.type === 'tool_use' && b.name === 'propose_changes').flatMap((b) => (b.input && b.input.changes) || []).filter((c) => c && OPS.includes(c.op)).slice(0, 10);
  if (!ops.length) return NextResponse.json({ say: say || 'Not sure what to log. Try again.', id: '' });
  const id = randomBytes(6).toString('hex');
  await setSetting(PENDING, pending.concat({ id, ops, at: now }).slice(-5));
  return NextResponse.json({ say: say || 'Log ' + ops.map((o) => [o.amount ? peso(o.amount) : '', o.merchant, o.category, o.source].filter(Boolean).join(' · ') || o.label).join(', ') + '?', id });
}
