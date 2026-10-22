import { NextResponse } from 'next/server';
import { COOKIE, makeToken } from '../../../lib/session';

export async function POST(req) {
  const { passcode } = await req.json().catch(() => ({}));
  const want = process.env.APP_PASSCODE || '';
  if (!want || passcode !== want) {
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: 'Wrong passcode' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await makeToken(), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90 });
  return res;
}
