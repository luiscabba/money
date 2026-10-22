import { NextResponse } from 'next/server';
import { sheetPost } from '../../../lib/sheet';

export const maxDuration = 60;

export async function POST(req) {
  const { messages } = await req.json();
  const msgs = (Array.isArray(messages) ? messages : []).slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) }));
  const out = await sheetPost({ action: 'ask', messages: msgs });
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
