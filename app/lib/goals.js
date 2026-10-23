// Savings goals: pure math shared by the screens, Moni and the widget.
// A goal's money is on paper: it is the sum of its goal_moves rows, tagged against the Maya balance.

const monthIndex = (y, m) => y * 12 + (m - 1);
const fromIndex = (i) => ({ y: Math.floor(i / 12), m: (i % 12) + 1 });
const ym = (s) => { const [y, m] = String(s).split('-').map(Number); return { y, m }; };
export const monthKey = (y, m) => y + '-' + String(m).padStart(2, '0');

export function savedOf(goal, moves) {
  return moves.filter((mv) => mv.goal === goal.id).reduce((a, mv) => a + mv.amount, 0);
}

// Months to save in, counting this month and the target's month: Oct now, Feb target = 5.
export function monthsLeft(target, now) {
  const t = ym(target);
  return Math.max(1, monthIndex(t.y, t.m) - monthIndex(now.y, now.m) + 1);
}

// Average put into a goal per month over the last three months, this month included.
export function paceOf(goal, moves, now) {
  const first = monthIndex(now.y, now.m) - 2;
  const total = moves
    .filter((mv) => mv.goal === goal.id && mv.kind !== 'purchase' && mv.kind !== 'leftover' && mv.amount > 0)
    .filter((mv) => { const d = ym(mv.at); return monthIndex(d.y, d.m) >= first; })
    .reduce((a, mv) => a + mv.amount, 0);
  return total / 3;
}

// The month a goal finishes when `perMonth` goes in each month. `from` is the first month that money lands:
// this month for a set-aside, next month for a pace that already counts this month's moves.
export function finishMonth(remaining, perMonth, now, from = 0) {
  if (remaining <= 0) return monthKey(now.y, now.m);
  if (!(perMonth > 0)) return null;
  const f = fromIndex(monthIndex(now.y, now.m) + from + Math.ceil(remaining / perMonth) - 1);
  return monthKey(f.y, f.m);
}

// Money moved in before this month began. The month's set-aside is worked out from this, so putting money in
// during the month fills the set-aside instead of shrinking it.
function savedBefore(goal, moves, now) {
  const start = monthIndex(now.y, now.m);
  return moves.filter((mv) => { const d = ym(mv.at); return mv.goal === goal.id && monthIndex(d.y, d.m) < start; })
    .reduce((a, mv) => a + mv.amount, 0);
}

// The whole picture. goals: [{ id, name, price, target, priority, status }], moves: [{ goal, at, amount, kind }],
// now: { y, m, d }, cap: most set aside per month across all goals, maya: Maya balance (optional).
export function goalPlan({ goals, moves, now, cap, maya }) {
  const active = goals.filter((g) => g.status === 'active').sort((a, b) => a.priority - b.priority);
  let used = 0;
  const rows = active.map((g) => {
    const saved = Math.round(savedOf(g, moves) * 100) / 100;
    const remaining = Math.max(0, g.price - saved);
    const row = { ...g, saved, remaining, pct: Math.min(1, saved / g.price) };
    if (!g.target) {
      const pace = paceOf(g, moves, now);
      return { ...row, dated: false, setAside: 0, pace, eta: finishMonth(remaining, pace, now, 1), status: 'nodate' };
    }
    const startLeft = Math.max(0, g.price - savedBefore(g, moves, now));
    const need = startLeft / monthsLeft(g.target, now);
    const room = cap === null || cap === undefined ? need : Math.max(0, cap - used);
    const setAside = Math.min(need, room);
    used += setAside;
    const fits = setAside >= need - 0.5;
    const eta = fits ? g.target.slice(0, 7) : finishMonth(startLeft, setAside, now);
    const inThisMonth = saved - savedBefore(g, moves, now);
    return {
      ...row, dated: true, need, setAside, eta,
      thisMonth: { due: Math.round(setAside), in: Math.round(inThisMonth), left: Math.max(0, Math.round(setAside - inThisMonth)) },
      status: remaining <= 0 ? 'funded' : fits ? 'ontrack' : setAside > 0 ? 'overcap' : 'waiting',
      suggest: fits ? null : eta
    };
  });
  const tagged = rows.reduce((a, r) => a + r.saved, 0);
  return {
    goals: rows,
    setAside: Math.round(used),
    cap,
    tagged: Math.round(tagged * 100) / 100,
    short: maya != null && tagged > maya ? Math.round((tagged - maya) * 100) / 100 : 0
  };
}

// Behind schedule: how far below a straight line from the day it started to the target.
export function behindBy(goal, saved, now) {
  if (!goal.target || !goal.created) return 0;
  const start = new Date(goal.created).getTime();
  const end = new Date(goal.target + 'T23:59:59+08:00').getTime();
  const at = new Date(now.y, now.m - 1, now.d).getTime();
  if (!(end > start)) return 0;
  const planned = goal.price * Math.min(1, Math.max(0, (at - start) / (end - start)));
  return Math.max(0, Math.round(planned - saved));
}
