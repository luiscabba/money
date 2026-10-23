import webpush from 'web-push';
import { devices, removeDevices } from './store';

// Sends to the given subscriptions; returns the endpoints the push service says are gone.
export async function sendTo(subscriptions, title, body, url) {
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
  return gone;
}

// Push to every saved device.
export async function push(title, body, url) {
  if (!process.env.VAPID_PRIVATE_KEY) return 0;
  const subs = (await devices()).map((d) => d.subscription).filter((s) => s && s.endpoint);
  if (!subs.length) return 0;
  const gone = await sendTo(subs, title, body, url);
  await removeDevices(gone);
  return subs.length - gone.length;
}
