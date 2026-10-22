// Finds repeat charges: same merchant, similar amount, about a month (or a year) apart.
import { netExpenses } from './money';

const DAY = 86400000;
const toDate = (s) => new Date(s.slice(0, 10) + 'T12:00:00');
const fmt = (d) => d.toISOString().slice(0, 10);

function addMonths(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
  x.setDate(Math.min(d.getDate(), new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  return x;
}

export function detectBills(data, now) {
  const today = new Date(now.y, now.m - 1, now.d, 12);
  const groups = {};
  netExpenses(data).filter((t) => t.amount > 0).forEach((t) => {
    const key = String(t.merchant).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
    (groups[key] = groups[key] || []).push(t);
  });
  const bills = [];
  Object.values(groups).forEach((list) => {
    const isSub = list.some((t) => t.category === 'Subscriptions' || t.category === 'Bills & Phone');
    // Split one merchant into price tiers (Apple ₱199 and ₱449 are separate plans).
    const tiers = [];
    list.forEach((t) => {
      const tier = tiers.find((x) => Math.abs(x.amount - t.amount) / x.amount < 0.12);
      if (tier) { tier.items.push(t); tier.amount = t.amount; } else tiers.push({ amount: t.amount, items: [t] });
    });
    tiers.forEach((tier) => {
      const items = tier.items.sort((a, b) => (a.date < b.date ? -1 : 1));
      if (items.length < 2 && !isSub) return;
      // Outside subscription categories, only steady same-price charges count (not rides or meals).
      if (!isSub && (items.length < 3 || items.some((t) => Math.abs(t.amount - tier.amount) / tier.amount > 0.03))) return;
      const last = toDate(items[items.length - 1].date);
      const gaps = items.slice(1).map((t, i) => (toDate(t.date) - toDate(items[i].date)) / DAY);
      const yearlyName = /godaddy|domain|namecheap|insurance|annual/i.test(items[0].merchant);
      const yearly = yearlyName || gaps.some((g) => g >= 330 && g <= 400);
      const monthly = !yearly && (isSub ? true : gaps.every((g) => g >= 24 && g <= 38));
      if (!monthly && !yearly) return;
      if ((today - last) / DAY > (yearly ? 400 : 45)) return; // stopped
      const next = yearly ? addMonths(last, 12) : addMonths(last, 1);
      const overdue = !yearly && (today - next) / DAY >= 1;
      bills.push({
        name: items[items.length - 1].merchant.replace(/[#*].*$/, '').replace(/\s*(Ab|Inc\.?|Services)$/i, '').trim() || 'Charge',
        amount: tier.amount, every: yearly ? 'Yearly' : 'Monthly', source: items[items.length - 1].source,
        last: fmt(last), next: fmt(next), overdue,
        daysTo: Math.round((next - today) / DAY)
      });
    });
  });
  bills.sort((a, b) => a.daysTo - b.daysTo);
  const monthlyTotal = bills.reduce((a, b) => a + (b.every === 'Yearly' ? b.amount / 12 : b.amount), 0);
  const next30 = bills.filter((b) => !b.overdue && b.daysTo >= 0 && b.daysTo <= 30).reduce((a, b) => a + b.amount, 0);
  return { bills, monthlyTotal, next30 };
}
