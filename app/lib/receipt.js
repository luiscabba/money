// Reads a receipt photo or an order screenshot into a purchase: total, store, time, wallet, and the split by category.
import { CATEGORIES } from './core';
import { ASK_MODEL } from './askPrompt';

export const RECEIPT_WALLETS = ['Maya Wallet', 'Maya Card', 'GCash', 'GoTyme', 'BPI', 'Cash'];
const SPEND = CATEGORIES.filter((c) => c !== 'Other').concat('Other');

const TOOL = {
  name: 'receipt',
  description: 'What the receipt or order screenshot shows.',
  input_schema: {
    type: 'object',
    properties: {
      is_receipt: { type: 'boolean', description: 'false if this is not a receipt, bill or order confirmation' },
      total: { type: 'number', description: 'the amount actually paid, in PHP' },
      merchant: { type: 'string', description: 'the store or app, short, as Luis would say it (e.g. "SM Supermarket", "GrabFood · Jollibee")' },
      when: { type: 'string', description: 'YYYY-MM-DD HH:mm in Manila time if shown, else empty' },
      wallet: { type: 'string', enum: RECEIPT_WALLETS.concat(''), description: 'how it was paid if the receipt shows it (Maya card, GCash, cash); empty if unknown' },
      parts: {
        type: 'array',
        description: 'the total split by category; one part when everything is one category. Parts add up to the total (spread discounts, VAT and service charge across them).',
        items: { type: 'object', properties: { category: { type: 'string', enum: SPEND }, amount: { type: 'number' }, items: { type: 'integer', description: 'how many line items' } }, required: ['category', 'amount'] }
      }
    },
    required: ['is_receipt', 'total', 'merchant', 'parts']
  }
};

export async function readReceipt(image) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(image || ''));
  const media = m ? m[1] : 'image/jpeg';
  const data = m ? m[2] : String(image || '').replace(/\s+/g, '');
  if (!data || data.length > 6_000_000) throw 'photo missing or too large';
  if (!process.env.CLAUDE_API_KEY) throw 'Moni is not set up';
  const r = await fetch((process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: ASK_MODEL, max_tokens: 800, tools: [TOOL], tool_choice: { type: 'tool', name: 'receipt' },
      system: 'You read receipts, bills and order screenshots for a personal spending tracker in the Philippines (amounts in PHP). Categories: ' + SPEND.join(', ') + '. Groceries are supermarket food and household basics; Food & Drinks is restaurants, cafes and delivered meals; Personal Care is toiletries, haircuts and pharmacy beauty items.',
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: media, data } }, { type: 'text', text: 'Read this.' }] }]
    }),
    signal: AbortSignal.timeout(45000)
  });
  const j = await r.json();
  const use = (j.content || []).find((b) => b.type === 'tool_use');
  if (!use) throw 'could not read it';
  const x = use.input || {};
  if (!x.is_receipt || !(Number(x.total) > 0)) throw 'that does not look like a receipt';
  const total = Math.round(Number(x.total) * 100) / 100;
  let parts = (x.parts || []).filter((p) => p && SPEND.includes(p.category) && Number(p.amount) > 0).map((p) => ({ category: p.category, amount: Math.round(Number(p.amount) * 100) / 100, items: p.items || null }));
  // Keep the parts summing to the total: the biggest part absorbs rounding.
  if (!parts.length) parts = [{ category: 'Other', amount: total, items: null }];
  const diff = Math.round((total - parts.reduce((a, p) => a + p.amount, 0)) * 100) / 100;
  if (Math.abs(diff) > 0) { const big = parts.slice().sort((a, b) => b.amount - a.amount)[0]; big.amount = Math.round((big.amount + diff) * 100) / 100; }
  parts = parts.filter((p) => p.amount > 0);
  return { total, merchant: String(x.merchant || 'Receipt').slice(0, 60), when: /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(x.when || '') ? x.when : '', wallet: RECEIPT_WALLETS.includes(x.wallet) ? x.wallet : '', parts };
}

// The change that logs it: one row, split into categories when there are several.
export function receiptOp(r, wallet, split = true) {
  const op = { op: 'add_expense', amount: r.total, merchant: r.merchant, category: r.parts[0].category, source: wallet || r.wallet || 'Cash', note: 'receipt' };
  if (r.when) op.date = r.when;
  if (split && r.parts.length > 1) op.parts = r.parts.map((p) => ({ amount: p.amount, category: p.category }));
  return op;
}
