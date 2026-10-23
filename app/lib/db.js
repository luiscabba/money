// Server-only client for the Supabase database (PostgREST over fetch). Uses the secret key, so never import
// this from a client component.
const base = () => (process.env.SUPABASE_URL || 'https://rnngqrwyfqmuyqpetfyo.supabase.co') + '/rest/v1/';

function headers(extra) {
  const key = process.env.SUPABASE_SECRET_KEY || '';
  const h = { apikey: key, 'Content-Type': 'application/json', ...extra };
  // Legacy service_role keys are JWTs and also go in Authorization; the new sb_secret_ keys only need apikey.
  if (key.startsWith('ey')) h.Authorization = 'Bearer ' + key;
  return h;
}

// The app reads the sheet until DATA_SOURCE=db is set in Vercel (the switch-over).
export const useDb = () => !!process.env.SUPABASE_SECRET_KEY && process.env.DATA_SOURCE === 'db';

async function call(path, { method = 'GET', body, prefer, range } = {}) {
  const h = headers(prefer ? { Prefer: prefer } : {});
  if (range) h.Range = range;
  const res = await fetch(base() + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const text = await res.text();
  if (!res.ok) throw new Error('db ' + method + ' ' + path.split('?')[0] + ': ' + res.status + ' ' + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

const enc = encodeURIComponent;

// select('transactions', 'select=*&ts=gte.2026-01-01&order=n') reads every page, not just the first 1000.
export async function select(table, query = 'select=*') {
  const out = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const rows = await call(table + '?' + query, { range: from + '-' + (from + page - 1) });
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

export async function one(table, query) {
  const rows = await call(table + '?' + query + '&limit=1');
  return rows[0] || null;
}

export function insert(table, rows, { upsert = false, onConflict, ignore = false } = {}) {
  const prefer = ['return=representation'];
  if (upsert) prefer.push('resolution=merge-duplicates');
  if (ignore) prefer.push('resolution=ignore-duplicates');
  return call(table + (onConflict ? '?on_conflict=' + onConflict : ''), { method: 'POST', body: rows, prefer: prefer.join(',') });
}

export function update(table, filter, patch) {
  return call(table + '?' + filter, { method: 'PATCH', body: patch, prefer: 'return=representation' });
}

export function remove(table, filter) {
  return call(table + '?' + filter, { method: 'DELETE', prefer: 'return=representation' });
}

export function rpc(fn, args) {
  return call('rpc/' + fn, { method: 'POST', body: args || {} });
}

export const eq = (col, v) => col + '=eq.' + enc(v);
export const inList = (col, vs) => col + '=in.(' + vs.map((v) => '"' + String(v).replace(/"/g, '\\"') + '"').join(',') + ')';
export { enc };
