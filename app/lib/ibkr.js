// IBKR positions and history from Flex Web Service statements (the IBKR connector blocks Philippine accounts).
// The Apps Script holds the Flex token, fetches the statements and posts the XML here; this reads them.
import { select, insert, update, remove, eq } from './db';
import { manilaDay, round2 } from './core';
import { setting, setSetting } from './store';

const BETA = ['SPYL', 'CSPX', 'VUAA', 'VWRA', 'SPY', 'VOO', 'IVV', 'VT'];
const EXCH = { NASDAQ: 'NASDAQ', NYSE: 'NYSE', ARCA: 'NYSEARCA', AMEX: 'NYSEAMERICAN', LSE: 'LON', LSEETF: 'LON', IBIS: 'ETR', IBIS2: 'ETR', SEHK: 'HKG' };

const unxml = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Every <Name a="1" .../> element, as attribute objects. Flex statements are flat attribute records.
export function elements(xml, name) {
  const out = [];
  const re = new RegExp('<' + name + '\\s([^>]*?)/?>', 'g');
  let m;
  while ((m = re.exec(xml))) {
    const o = {};
    m[1].replace(/(\w+)="([^"]*)"/g, (_, k, v) => { o[k] = unxml(v); return ''; });
    out.push(o);
  }
  return out;
}

// Positions, cash and account value: rewrites holdings and IBKR's net worth line.
export async function syncPositions(xml) {
  if (xml.indexOf('<FlexQueryResponse') < 0) throw new Error('not a Flex statement');
  const positions = elements(xml, 'OpenPosition').filter((e) => (e.levelOfDetail || 'SUMMARY') === 'SUMMARY' && Number(e.position) > 0);
  // Everything comes in base currency. If base is not USD, convert using a USD position's rate.
  const usdRow = positions.find((e) => e.currency === 'USD');
  const usdToBase = usdRow ? Number(usdRow.fxRateToBase) || 1 : 1;
  const toUsd = (local, fx) => (local * (Number(fx) || 1)) / usdToBase;
  const rows = positions.map((e) => ({
    symbol: e.symbol,
    sleeve: e.assetCategory === 'CRYPTO' ? 'Asymmetric' : BETA.indexOf(e.symbol) >= 0 ? 'Beta' : e.assetCategory === 'STK' ? 'Alpha' : 'Asymmetric',
    quantity: Number(e.position),
    avg_cost: toUsd(Number(e.costBasisPrice), e.fxRateToBase),
    mark: toUsd(Number(e.markPrice), e.fxRateToBase),
    quote: e.assetCategory === 'CRYPTO' ? 'CURRENCY:' + e.symbol + 'USD' : (EXCH[e.listingExchange] || 'NASDAQ') + ':' + e.symbol
  }));
  const cashEl = elements(xml, 'CashReportCurrency').find((e) => e.currency === 'BASE_SUMMARY');
  const cash = cashEl ? Number(cashEl.endingCash) / usdToBase : 0;
  const navRows = elements(xml, 'EquitySummaryByReportDateInBase');
  const nav = navRows.length ? Number(navRows[navRows.length - 1].total) / usdToBase : rows.reduce((s, r) => s + r.quantity * r.mark, 0) + cash;
  if (cash >= 1) rows.push({ symbol: 'CASH', sleeve: 'Cash', quantity: cash, avg_cost: 1, mark: 1, quote: '' });

  // Keep the live prices already known for symbols that stay; IBKR's mark is the fallback.
  const before = Object.fromEntries((await select('holdings')).map((h) => [h.symbol, h]));
  const now = new Date().toISOString();
  const keep = rows.map((r) => ({ ...r, price: before[r.symbol] ? before[r.symbol].price : r.mark, prev_close: before[r.symbol] ? before[r.symbol].prev_close : r.mark, updated_at: now }));
  if (keep.length) await insert('holdings', keep, { upsert: true, onConflict: 'symbol' });
  const gone = Object.keys(before).filter((s) => !rows.some((r) => r.symbol === s));
  for (const s of gone) await remove('holdings', eq('symbol', s));
  await update('accounts', eq('name', 'IBKR'), { balance: round2(nav), as_of: now, updated_by: 'Daily sync' });
  await setSetting('ibkr_usd_to_base', usdToBase);
  return { positions: rows.length, nav: round2(nav) };
}

// Daily account value and deposits for the Invest chart. IBKR's value and deposits win; the app's own cost and FX are kept.
export async function syncHistory(xml) {
  if (xml.indexOf('<FlexQueryResponse') < 0) throw new Error('not a Flex statement');
  const usdToBase = Number(await setting('ibkr_usd_to_base')) || 1;
  const day = (s) => { const d = String(s || '').replace(/[^0-9]/g, '').slice(0, 8); return d.length === 8 ? d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) : ''; };
  const nav = {};
  elements(xml, 'EquitySummaryByReportDateInBase').forEach((e) => { const d = day(e.reportDate); if (d) nav[d] = Number(e.total) / usdToBase; });
  const flows = {};
  elements(xml, 'CashTransaction').forEach((e) => {
    if (!/deposit|withdraw/i.test(e.type || '')) return;
    const d = day(e.dateTime || e.reportDate || e.settleDate); if (!d) return;
    flows[d] = (flows[d] || 0) + Number(e.amount) * (Number(e.fxRateToBase) || 1) / usdToBase;
  });
  const byDay = Object.fromEntries((await select('invest_history')).map((r) => [r.date, r]));
  const first = Object.keys(nav).filter((d) => nav[d] > 0).concat(Object.keys(flows)).sort()[0] || '9999';
  Object.keys(nav).concat(Object.keys(flows)).forEach((d) => { if (d >= first && !byDay[d]) byDay[d] = { date: d, value_usd: null, cost_usd: null, usd_php: null, deposited_usd: null }; });
  let dep = 0;
  const out = Object.keys(byDay).filter((d) => d >= first).sort().map((d) => {
    const r = { ...byDay[d] };
    dep += flows[d] || 0;
    if (nav[d] > 0) r.value_usd = round2(nav[d]);
    r.deposited_usd = round2(dep);
    return r;
  });
  const stale = Object.keys(byDay).filter((d) => d < first);
  for (const d of stale) await remove('invest_history', eq('date', d));
  for (let i = 0; i < out.length; i += 500) await insert('invest_history', out.slice(i, i + 500), { upsert: true, onConflict: 'date' });
  return { days: out.length };
}

// Daily: record the portfolio's value and cost for today.
export async function investSnapshot(holdings, fx) {
  if (!holdings.length) return;
  const value = round2(holdings.reduce((a, x) => a + x.usd, 0)), cost = round2(holdings.reduce((a, x) => a + x.cost, 0));
  const date = manilaDay();
  const cur = await select('invest_history', eq('date', date));
  const last = await select('invest_history', 'select=deposited_usd&date=lt.' + date + '&deposited_usd=not.is.null&order=date.desc&limit=1');
  await insert('invest_history', [{
    date, value_usd: value, cost_usd: cost, usd_php: fx || null,
    deposited_usd: cur[0] && cur[0].deposited_usd !== null ? cur[0].deposited_usd : last[0] ? last[0].deposited_usd : null
  }], { upsert: true, onConflict: 'date' });
}
