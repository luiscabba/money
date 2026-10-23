import { NextResponse } from 'next/server';
import { authorizedApp } from '../../../../lib/core';
import { select, insert, inList } from '../../../../lib/db';
import { handleMessage, handleReceipt, notifyNew } from '../../../../lib/ingest';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

// The Apps Script posts new Gmail messages here: {messages: [{id, kind: 'notification'|'receipt', subject, from, body, date}]}.
// Each is read once (the Inbox Log remembers it). Replies say what happened and whether to bin the email.
export async function POST(req) {
  if (!authorizedApp(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { messages = [], retry = false } = await req.json();
  const list = messages.filter((m) => m && m.id).slice(0, 10);
  const seen = new Map();
  if (list.length) (await select('inbox_log', inList('message_id', list.map((m) => m.id)) + '&select=message_id,result')).forEach((r) => seen.set(r.message_id, r.result));
  const results = [], added = [];
  for (const m of list) {
    if (seen.has(m.id) && !(retry && /^error/.test(seen.get(m.id)))) { results.push({ id: m.id, result: 'seen' }); continue; }
    let out;
    try {
      out = m.kind === 'receipt' ? await handleReceipt(m) : await handleMessage(m);
    } catch (e) {
      out = { result: 'error: ' + String(e && e.message ? e.message : e).slice(0, 200) };
    }
    if (out.tx) added.push(out.tx);
    await insert('inbox_log', [{ message_id: m.id, result: out.result + (retry ? ' (retry)' : '') }], { upsert: true, onConflict: 'message_id' });
    results.push({ id: m.id, result: out.result, trash: !!out.trash });
  }
  try { await notifyNew(added); } catch (e) { console.error('notify', e); }
  return NextResponse.json({ results });
}

// Message ids whose last attempt failed in the past 3 days, for the script's retryErrors().
export async function GET(req) {
  if (!authorizedApp(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const rows = await select('inbox_log', 'select=message_id&result=like.error*&processed_at=gte.' + encodeURIComponent(since));
  return NextResponse.json({ ids: rows.map((r) => r.message_id) });
}
