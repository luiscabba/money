// Events from Luis's Google Calendar that have a place: what they'll likely cost and which budget pays.
import { budgetGroups } from './money';

const GUESS = [
  [/dinner|lunch|breakfast|brunch|coffee|caf[eé]|drinks|bar\b|eat|food|resto|merienda|snack|samgy|buffet/i, 'Food & Drinks'],
  [/gym|pickleball|run\b|yoga|badminton|swim|court/i, 'Fitness'],
  [/flight|airport|trip|bus|ferry|road ?trip/i, 'Transport'],
  [/mall|shop|market|bazaar|sale/i, 'Shopping'],
  [/movie|cinema|concert|party|show|gig|club|halloween|birthday|bday|wedding|event|game/i, 'Entertainment']
];
export const eventCategory = (title) => (GUESS.find(([re]) => re.test(String(title || ''))) || [])[1] || null;

// Upcoming events with a place in the next 7 days, minus ones he said cost nothing or already planned.
export function upcomingEvents(data, now = new Date()) {
  const dismissed = new Set(data.calendarDismissed || []);
  const planned = (data.plans || []).map((p) => String(p.what || '').toLowerCase());
  const from = now.getTime() - 2 * 3600000, to = now.getTime() + 7 * 86400000;
  return (data.calendarEvents || [])
    .filter((e) => e && e.location && !dismissed.has(e.id))
    .filter((e) => { const t = new Date(e.start).getTime(); return t >= from && t <= to; })
    .filter((e) => !planned.some((w) => w && w === String(e.title).toLowerCase()))
    .sort((a, b) => (a.start < b.start ? -1 : 1));
}

// The budget an event would come out of, and what's left in it this month.
export function eventBudget(data, e, y, m) {
  const cat = eventCategory(e.title);
  if (!cat) return null;
  const g = budgetGroups(data, y, m).find((b) => b.includes.indexOf(cat) >= 0);
  if (!g) return null;
  return { name: g.name, left: Math.round(g.budget - g.spent), category: cat };
}
