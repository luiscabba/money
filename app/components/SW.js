'use client';
import { useEffect } from 'react';

export default function SW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}

function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function enablePush() {
  try { return await enablePushInner(); } catch (e) { return 'Push setup failed: ' + (e && e.message ? e.message : e); }
}

async function enablePushInner() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'On iPhone, add Money to your Home Screen from Safari first, then open it from there.';
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'Notifications are blocked. Allow them in Settings.';
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: b64ToUint8(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  }));
  const res = await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
  const j = await res.json();
  if (!res.ok || j.error) return 'Could not save this device: ' + (j.error || res.status);
  try { localStorage.setItem('pushSaved', sub.endpoint); } catch (e) {}
  await fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true }) });
  return 'ok';
}
