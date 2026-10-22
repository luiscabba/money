import { NextResponse } from 'next/server';
import webpush from 'web-push';

// Called only by the Apps Script, with the shared APP_TOKEN.
export async function POST(req) {
  const auth = req.headers.get('authorization') || '';
  if (!process.env.APP_TOKEN || auth !== 'Bearer ' + process.env.APP_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { title, body, url, subscriptions = [] } = await req.json();
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:owner@example.com', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const payload = JSON.stringify({ title, body, url: url || '/' });
  const gone = [];
  await Promise.all(subscriptions.map(async (s) => {
    try {
      await webpush.sendNotification(s, payload, { TTL: 60 * 60 * 6 });
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) gone.push(s.endpoint);
    }
  }));
  return NextResponse.json({ sent: subscriptions.length - gone.length, gone });
}
