// Server side of goals: the Sunday leftover sweep and spotting a purchase that looks like a goal.
import { setting, setSetting, planGoals, loadData, pendingMatches } from './store';
import { manilaDay, peso } from './core';
import { safeToSpend } from './safe';

// A purchase counts as a goal's when the goal is mostly funded and the price is close to what was planned.
export async function matchGoal(tx) {
  if (tx.type !== 'Expense' || !(tx.amount > 0)) return null;
  const { plan } = await planGoals(null);
  return plan.goals.find((g) => g.saved >= g.price * 0.8 && tx.amount >= g.price * 0.7 && tx.amount <= g.price * 1.15) || null;
}


export async function addMatch(row, goal) {
  const list = (await pendingMatches()).filter((m) => m.row !== row);
  list.push({ row, goal, at: manilaDay() });
  await setSetting('goal_matches', list.slice(-10));
}

// Sunday night: what's left of the week's limit, offered to the goals.
export async function sweepWeek() {
  const data = await loadData(2);
  if (!data.goals || !data.goals.some((g) => g.status === 'active')) return { skipped: 'no goals' };
  const [y, m, d] = manilaDay().split('-').map(Number);
  const s = safeToSpend(data, { y, m, d });
  const left = Math.max(0, Math.round(s.week - s.before - s.today));
  const mon = new Date(Date.UTC(y, m - 1, d - 6)).toISOString().slice(0, 10);
  // Each week is offered once, even if the close runs again.
  if ((await setting('goal_sweep_last')) === mon) return { skipped: 'already offered', week: mon };
  await setSetting('goal_sweep_last', mon);
  if (left < 50) {
    await setSetting('goal_sweep_pending', {});
    return { left };
  }
  await setSetting('goal_sweep_pending', { week: mon, amount: left, spent: Math.round(s.before + s.today), limit: s.week });
  return { left, push: ['Week close: ' + peso(left) + ' unspent', 'Put it toward a goal? Tap to choose.', '/budgets?tab=goals'] };
}

