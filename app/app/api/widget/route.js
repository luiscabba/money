import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { loadData, setting } from '../../../lib/store';
import { netExpenses } from '../../../lib/money';
import { safeToSpend } from '../../../lib/safe';
import { manila, peso } from '../../../lib/core';

export const dynamic = 'force-dynamic';

// Read-only numbers for the Scriptable widgets. Its own token (?t=), separate from the app passcode.
const hash = (s) => createHash('sha256').update(String(s)).digest('hex');
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const month = (k) => { if (!k) return ''; const [y, m] = k.split('-').map(Number); return SHORT[m - 1] + (y !== new Date().getFullYear() ? ' ' + y : ''); };

export async function GET(req) {
  const t = new URL(req.url).searchParams.get('t') || '';
  const want = await setting('widget_token');
  if (!t || !want || hash(t) !== want) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const data = await loadData(2);
  const stamp = manila(new Date());
  const [y, m, d] = stamp.slice(0, 10).split('-').map(Number);
  const hour = Number(stamp.slice(11, 13));
  const today = stamp.slice(0, 10);
  const spent = Math.round(netExpenses(data).filter((x) => x.date.startsWith(today)).reduce((a, x) => a + x.amount, 0));
  const wk = safeToSpend(data, { y, m, d });
  // Today's limit is the same rolling share as the app's Safe to spend ring.
  const limit = Math.max(1, Math.round(wk.today + wk.safe));
  const plan = data.goalPlan || { goals: [] };
  const top = plan.goals[0] || null;
  const funded = plan.goals.find((g) => g.status === 'funded');
  const matched = (data.goalPending && data.goalPending.matches || [])[0];

  let mood = 'content', line = peso(Math.max(0, limit - spent)) + ' left today.';
  if (spent > limit) { mood = 'worry'; line = peso(spent - limit) + ' over today.'; }
  if (top && mood === 'content' && top.dated) line += ' ' + top.name + (top.status === 'ontrack' ? ' on track.' : top.status === 'waiting' ? ' is waiting.' : ' pushed to ' + month((top.eta || '').slice(0, 7)) + '.');
  if (matched) { mood = 'surp'; line = 'Is ' + peso(matched.amount) + ' at ' + matched.merchant + ' for a goal?'; }
  if (funded) { mood = 'cel'; line = funded.name + ' fully saved.'; }
  if (hour >= 23 || hour < 6) { mood = 'sleep'; line = 'Day closed at ' + peso(spent) + '.' + (spent <= limit ? ' Under again.' : ''); }

  const base = new URL(req.url).origin + '/moni/';
  return NextResponse.json({
    at: stamp,
    today: { spent, limit },
    week: { spent: Math.round(wk.before + wk.today), limit: wk.week },
    goal: top ? { name: top.name, saved: Math.round(top.saved), price: Math.round(top.price), pct: Math.round(top.pct * 100), when: top.dated ? month((top.eta || top.target).slice(0, 7)) : top.eta ? 'About ' + month(top.eta) : '' } : null,
    moni: { mood, line, image: base + mood + '.png', mono: base + 'mono-' + mood + '.png' }
  }, { headers: { 'Cache-Control': 'no-store' } });
}
