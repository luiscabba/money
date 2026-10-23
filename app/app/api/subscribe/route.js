import { NextResponse } from 'next/server';
import { sheetPost } from '../../../lib/sheet';
import { useDb } from '../../../lib/db';
import { addDevice } from '../../../lib/store';
import { push } from '../../../lib/push';

export async function POST(req) {
  const { subscription, test } = await req.json();
  if (useDb()) {
    if (test) return NextResponse.json({ ok: true, sent: await push('Test from Money', 'Push is working.', '/') });
    if (!subscription || !subscription.endpoint) return NextResponse.json({ error: 'no subscription' }, { status: 400 });
    await addDevice(subscription);
    return NextResponse.json({ ok: true });
  }
  if (test) return NextResponse.json(await sheetPost({ action: 'test-push' }));
  if (!subscription || !subscription.endpoint) return NextResponse.json({ error: 'no subscription' }, { status: 400 });
  return NextResponse.json(await sheetPost({ action: 'subscribe', subscription }));
}
