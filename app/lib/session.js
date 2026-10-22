// Signed session cookie, verified with Web Crypto so it works in middleware and routes.
export const COOKIE = 'money_session';
const enc = new TextEncoder();

async function key() {
  return crypto.subtle.importKey('raw', enc.encode(process.env.SESSION_SECRET || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

function hex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function makeToken() {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 90;
  const sig = hex(await crypto.subtle.sign('HMAC', await key(), enc.encode('money:' + exp)));
  return exp + '.' + sig;
}

export async function validToken(token) {
  if (!token || !process.env.SESSION_SECRET) return false;
  const [exp, sig] = String(token).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = hex(await crypto.subtle.sign('HMAC', await key(), enc.encode('money:' + exp)));
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
