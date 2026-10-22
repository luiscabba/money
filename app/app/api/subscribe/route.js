import { NextResponse } from 'next/server';
import { sheetPost } from '../../../lib/sheet';

export async function POST(req) {
  const { subscription, test } = await req.json();
  if (test) return NextResponse.json(await sheetPost({ action: 'test-push' }));
  if (!subscription || !subscription.endpoint) return NextResponse.json({ error: 'no subscription' }, { status: 400 });
  return NextResponse.json(await sheetPost({ action: 'subscribe', subscription }));
}
