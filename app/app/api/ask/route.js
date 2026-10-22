import { NextResponse } from 'next/server';
import { sheetGet, sheetPost } from '../../../lib/sheet';
import { ASK_MODEL, MARK, buildPrompt, toClaudeMessages } from '../../../lib/askPrompt';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { messages } = await req.json();
  const msgs = (Array.isArray(messages) ? messages : []).slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return NextResponse.json({ reply: 'Ask me something.', actions: [] });

  // Without a key on Vercel, the Apps Script answers (no streaming).
  if (!process.env.CLAUDE_API_KEY) {
    const out = await sheetPost({ action: 'ask', messages: msgs });
    return NextResponse.json(out, { status: out.error ? 400 : 200 });
  }

  const data = await sheetGet({ months: 3 });
  const { system, context } = buildPrompt(data);
  const upstream = await fetch((process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: ASK_MODEL, max_tokens: 1500, stream: true, system, messages: toClaudeMessages(msgs, context) })
  });
  if (!upstream.ok || !upstream.body) return NextResponse.json({ reply: 'Claude did not answer (' + upstream.status + '). Try again.', actions: [] });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      const reader = upstream.body.getReader();
      const dec = new TextDecoder();
      let sse = '', full = '', sent = 0, marked = false;
      const flush = (final) => {
        const at = full.indexOf(MARK);
        if (at >= 0) marked = true;
        // Hold back a few characters so a half-arrived marker is never shown.
        const end = at >= 0 ? at : final ? full.length : Math.max(sent, full.length - MARK.length);
        if (end > sent) { send({ d: full.slice(sent, end) }); sent = end; }
      };
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
            try {
              const ev = JSON.parse(line.slice(5));
              if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') { full += ev.delta.text; if (!marked) flush(false); }
            } catch (e) { /* keep-alive or partial line */ }
          }
        }
        if (!marked) flush(true);
        let actions = [];
        const at = full.indexOf(MARK);
        if (at >= 0) {
          const raw = full.slice(at + MARK.length);
          try { actions = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1)); } catch (e) { actions = []; }
        }
        send({ actions: Array.isArray(actions) ? actions.slice(0, 12) : [] });
      } catch (e) {
        send({ d: '\n(Connection dropped. Try again.)' });
      }
      controller.close();
    }
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}
