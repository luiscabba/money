import { NextResponse } from 'next/server';
import { sheetGet, sheetPost } from '../../../lib/sheet';
import { useDb } from '../../../lib/db';
import { loadData } from '../../../lib/store';
import { ASK_MODEL, OPS, TOOLS, buildPrompt, toClaudeMessages } from '../../../lib/askPrompt';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Streams the reply as NDJSON: {d: text} pieces, then {actions, replies} at the end.
export async function POST(req) {
  const { messages } = await req.json();
  const list = (Array.isArray(messages) ? messages : []).slice(-12);
  if (!list.length || list[list.length - 1].role !== 'user') return NextResponse.json({ reply: 'Ask me something.', actions: [] });

  // Without a key on Vercel, the Apps Script answers (no streaming, no photos).
  if (!process.env.CLAUDE_API_KEY && !useDb()) {
    const msgs = list.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) }));
    const out = await sheetPost({ action: 'ask', messages: msgs });
    return NextResponse.json(out, { status: out.error ? 400 : 200 });
  }

  if (!process.env.CLAUDE_API_KEY) return NextResponse.json({ reply: 'Add CLAUDE_API_KEY in Vercel to use Moni.', actions: [] });
  const data = useDb() ? await loadData(3) : await sheetGet({ months: 3 });
  const { system } = buildPrompt(data);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 55000);
  let upstream;
  try {
    upstream = await fetch((process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: ASK_MODEL, max_tokens: 2000, stream: true, system, tools: TOOLS, messages: toClaudeMessages(list) })
    });
  } catch (e) {
    clearTimeout(timer);
    return NextResponse.json({ reply: "Claude didn't answer in time. Try again.", actions: [] });
  }
  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    return NextResponse.json({ reply: 'Claude did not answer (' + upstream.status + '). Try again.', actions: [] });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      const reader = upstream.body.getReader();
      const dec = new TextDecoder();
      const blocks = {}; // index -> {type, name, json}
      let sse = '';
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          sse += dec.decode(value, { stream: true });
          let i;
          while ((i = sse.indexOf('\n')) >= 0) {
            const line = sse.slice(0, i).trim();
            sse = sse.slice(i + 1);
            if (!line.startsWith('data:')) continue;
            let ev;
            try { ev = JSON.parse(line.slice(5)); } catch (e) { continue; }
            if (ev.type === 'content_block_start') blocks[ev.index] = { type: ev.content_block.type, name: ev.content_block.name, json: '' };
            if (ev.type === 'content_block_delta' && ev.delta) {
              if (ev.delta.type === 'text_delta') send({ d: ev.delta.text });
              if (ev.delta.type === 'input_json_delta' && blocks[ev.index]) blocks[ev.index].json += ev.delta.partial_json;
            }
          }
        }
        let actions = [], replies = [], mood = '';
        Object.values(blocks).forEach((b) => {
          if (b.type !== 'tool_use') return;
          let input = {};
          try { input = JSON.parse(b.json || '{}'); } catch (e) { input = {}; }
          if (b.name === 'propose_changes') actions = actions.concat((input.changes || []).filter((c) => c && OPS.includes(c.op)));
          if (b.name === 'set_mood') mood = String(input.mood || '');
          if (b.name === 'follow_ups') replies = (input.replies || []).filter((r) => typeof r === 'string').slice(0, 3);
        });
        send({ actions: actions.slice(0, 20), replies, mood });
      } catch (e) {
        send({ d: '\n(Connection dropped. Try again.)' });
      }
      clearTimeout(timer);
      controller.close();
    }
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
