// Pages open from the last saved copy when the server is slow or down; data comes from the
// phone's saved copy (useData) and refreshes in the background.
const CACHE = 'money-shell-v2';
const WAIT_MS = 3500;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

const OFFLINE = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Money</title>' +
  '<body style="background:#07090d;color:#e8eaf0;font:16px -apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center">' +
  '<div><p>Money can\'t reach the server.</p><p style="opacity:.6">Retrying&hellip;</p></div>' +
  '<script>setTimeout(function(){location.reload()},4000)</script>';

async function savePage(req, res) {
  if (res && res.ok && !res.redirected && res.type === 'basic') {
    const c = await caches.open(CACHE);
    await c.put(req.url.split('?')[0], res.clone());
  }
}

async function page(event) {
  const req = event.request;
  // Save the fresh page even when the saved copy was served first (waitUntil is registered right away).
  const net = fetch(req);
  event.waitUntil(net.then((res) => savePage(req, res)).catch(() => {}));
  const timeout = new Promise((r) => setTimeout(() => r(null), WAIT_MS));
  const first = await Promise.race([net.catch(() => null), timeout]);
  if (first) return first.clone();
  const c = await caches.open(CACHE);
  const saved = (await c.match(req.url.split('?')[0])) || (await c.match(new URL('/', req.url).href));
  if (saved) return saved;
  // Nothing saved yet: wait for the network after all, then the retry page.
  return net.catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
}

async function asset(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) c.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') { event.respondWith(page(event)); return; }
  if (url.pathname.startsWith('/_next/static/') || /\.(png|ico|webmanifest)$/.test(url.pathname)) event.respondWith(asset(req));
});

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'Money', body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Money', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: d.url || '/' },
    tag: d.tag || undefined
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
