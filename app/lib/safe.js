// Weekly bucket: the monthly total spread over weeks. Unspent days roll forward; resets Monday.
import { netExpenses, spendBudget, dayKey } from './money';

const DAY = 86400000;
const keyOf = (d) => dayKey(d.getFullYear(), d.getMonth() + 1, d.getDate());

export function safeToSpend(data, now) {
  const today = new Date(now.y, now.m - 1, now.d);
  const elapsed = (today.getDay() + 6) % 7;
  const mon = new Date(today.getTime() - elapsed * DAY);
  const sun = new Date(mon.getTime() + 6 * DAY);
  const week = Math.round((spendBudget(data, now.y, now.m) * 12) / 52);
  const tk = keyOf(today), mk = keyOf(mon), sk = keyOf(sun);
  let before = 0, todaySpent = 0;
  netExpenses(data).forEach((t) => {
    const k = t.date.slice(0, 10);
    if (k >= mk && k < tk) before += t.amount;
    if (k === tk) todaySpent += t.amount;
  });
  const plans = (data.plans || []).filter((p) => p.status === 'planned' && p.date >= tk && p.date <= sk);
  const planned = plans.reduce((a, p) => a + p.amount, 0);
  const daysLeft = 7 - elapsed;
  const perDay = (week - before - planned) / daysLeft;
  return {
    week, before, today: todaySpent, planned, plans, daysLeft,
    safe: Math.round(perDay - todaySpent),
    left: Math.round(week - before - todaySpent - planned),
    used: week ? Math.min(1, (before + todaySpent) / week) : 0
  };
}
