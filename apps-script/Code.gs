/**
 * Money: the Google side of the app.
 * The database (Supabase) holds the money; the app at APP_URL does the thinking. This script only does what
 * needs Google: reads Gmail and hands each message to the app, fetches IBKR's Flex statements, reads live prices
 * from GOOGLEFINANCE, runs the schedule, and keeps this sheet as a read-only mirror of the database.
 *
 * Script properties: APP_URL (https://money.arghtools.com), APP_TOKEN (same as Vercel), IBKR_FLEX_TOKEN,
 * IBKR_FLEX_QUERY, IBKR_FLEX_HISTORY.
 * Run setup() once from the editor to create the triggers.
 */

const TZ = 'Asia/Manila';
const LABEL_DONE = 'Money/Processed';
const QUERY = 'from:me (subject:"Notification:" OR subject:"SMS Forwarded from") -label:money-processed newer_than:3d';
const RECEIPT_QUERY = '-from:me -label:money-processed newer_than:2d -from:interactivebrokers.com ' +
  '(receipt OR "top-up" OR "top up" OR "cash in" OR "you paid" OR "payment confirmation" OR "payment successful" OR "order confirmed" OR invoice)';

/* ---------- setup ---------- */

function setup() {
  SpreadsheetApp.getActive().setSpreadsheetTimeZone(TZ);
  ['Money', LABEL_DONE].forEach((l) => { if (!GmailApp.getUserLabelByName(l)) GmailApp.createLabel(l); });
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('processInbox').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('syncSheet').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('mirrorAll').timeBased().atHour(3).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('syncIBKR').timeBased().atHour(7).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('eveningCheck').timeBased().atHour(20).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('dailyClose').timeBased().atHour(22).nearMinute(39).everyDays(1).inTimezone(TZ).create();
  ScriptApp.newTrigger('weeklyRecap').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).inTimezone(TZ).create();
  ensureSheet_('Balance Inbox', [['Time', 'Account', 'Balance']]);
  ensureSheet_('SMS Inbox', [['Date', 'Type', 'Amount (PHP)', 'Merchant', 'Category', 'Source', 'Ref']]);
  Logger.log('Setup done.');
}

function ensureSheet_(name, rows) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    sh.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ---------- talking to the app ---------- */

function api_(method, path, body) {
  const p = PropertiesService.getScriptProperties();
  const opts = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + p.getProperty('APP_TOKEN') } };
  if (body !== undefined) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(body); }
  const res = UrlFetchApp.fetch(p.getProperty('APP_URL') + path, opts);
  let out = null;
  try { out = JSON.parse(res.getContentText()); } catch (e) { out = null; }
  if (res.getResponseCode() !== 200 || !out) throw new Error(path + ' ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));
  return out;
}

const job_ = (name, body) => api_('post', '/api/cron/' + name, body || {});
function dailyClose() { job_('daily-close'); }
function weeklyRecap() { job_('weekly-recap'); }
function eveningCheck() { job_('evening-check'); }
function testPush() { Logger.log(JSON.stringify(job_('test-push'))); }

/* ---------- Gmail ---------- */

function messageOut_(m, kind) {
  return { id: m.getId(), kind: kind, subject: m.getSubject() || '', from: m.getFrom() || '', body: (m.getPlainBody() || '').slice(0, 6000), date: m.getDate().toISOString() };
}

// Hands new notifications and receipts to the app. A thread is labelled done only once all its messages got an answer.
function processInbox() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const done = GmailApp.getUserLabelByName(LABEL_DONE) || GmailApp.createLabel(LABEL_DONE);
    const work = [];
    GmailApp.search(QUERY, 0, 30).forEach((th) => work.push({ th: th, kind: 'notification', archive: true }));
    GmailApp.search(RECEIPT_QUERY, 0, 20).forEach((th) => work.push({ th: th, kind: 'receipt', archive: false }));
    const cutoff = new Date(Date.now() - 2 * 864e5);
    work.forEach((w) => {
      const msgs = w.th.getMessages().filter((m) => w.kind !== 'receipt' || m.getDate() >= cutoff);
      let ok = true;
      for (let i = 0; i < msgs.length; i += 3) {
        const chunk = msgs.slice(i, i + 3);
        let out;
        try { out = api_('post', '/api/ingest/mail', { messages: chunk.map((m) => messageOut_(m, w.kind)) }); } catch (e) { Logger.log(e); ok = false; break; }
        (out.results || []).forEach((r) => { if (r.trash) { const m = chunk.find((x) => x.getId() === r.id); if (m) m.moveToTrash(); } });
      }
      if (!ok) return;
      w.th.addLabel(done);
      if (w.archive && w.th.isInInbox()) w.th.moveToArchive();
    });
    drainInboxes_();
  } finally {
    lock.releaseLock();
  }
}

// Re-runs every message whose last attempt failed in the past 3 days. Safe to run any time.
function retryErrors() {
  const ids = api_('get', '/api/ingest/mail').ids || [];
  ids.forEach((id) => {
    try {
      const m = GmailApp.getMessageById(id);
      const kind = /Notification|SMS Forwarded/i.test(m.getSubject()) ? 'notification' : 'receipt';
      Logger.log(JSON.stringify(api_('post', '/api/ingest/mail', { retry: true, messages: [messageOut_(m, kind)] })));
    } catch (e) { Logger.log(id + ': ' + e); }
  });
}

/* ---------- inboxes the nightly Mac check fills ---------- */

// "Balance Inbox" (Time, Account, Balance) and "SMS Inbox" (Date … Ref): sent to the app, then cleared.
function drainInboxes_() {
  const ss = SpreadsheetApp.getActive();
  [['Balance Inbox', 3, '/api/ingest/balances'], ['SMS Inbox', 7, '/api/ingest/sms']].forEach((x) => {
    const sh = ss.getSheetByName(x[0]);
    if (!sh || sh.getLastRow() < 2) return;
    const range = sh.getRange(2, 1, sh.getLastRow() - 1, x[1]);
    const rows = range.getValues().filter((r) => r[0] !== '').map((r) => r.map((v) => (v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd HH:mm:ss') : v)));
    if (!rows.length) return;
    api_('post', x[2], { rows: rows });
    range.clearContent();
  });
}

/* ---------- IBKR via Flex Web Service ---------- */

const FLEX_ = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService';

function syncIBKR() {
  const p = PropertiesService.getScriptProperties();
  try {
    const token = p.getProperty('IBKR_FLEX_TOKEN');
    if (!token || !p.getProperty('IBKR_FLEX_QUERY')) throw new Error('Add IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY in Script properties');
    const body = { positions: flexFetch_(token, p.getProperty('IBKR_FLEX_QUERY')) };
    if (p.getProperty('IBKR_FLEX_HISTORY')) { try { body.history = flexFetch_(token, p.getProperty('IBKR_FLEX_HISTORY')); } catch (e) { Logger.log('IBKR history: ' + e); } }
    Logger.log(JSON.stringify(api_('post', '/api/ingest/ibkr', body)));
    mirrorAll();
  } catch (e) {
    try { job_('push', { title: 'IBKR sync failed', body: String(e.message || e).slice(0, 180) }); } catch (x) { /* ignore */ }
    throw e;
  }
}

function backfillIBKR() { syncIBKR(); }

function flexFetch_(token, query) {
  const send = XmlService.parse(flexGet_(FLEX_ + '/SendRequest?t=' + token + '&q=' + query + '&v=3')).getRootElement();
  if (send.getChildText('Status') !== 'Success') throw new Error('Flex request: ' + send.getChildText('ErrorCode') + ' ' + send.getChildText('ErrorMessage'));
  const ref = send.getChildText('ReferenceCode');
  const base = send.getChildText('Url') || FLEX_ + '/GetStatement';
  for (let i = 0; i < 12; i++) {
    Utilities.sleep(i === 0 ? 5000 : 15000);
    const body = flexGet_(base + '?t=' + token + '&q=' + ref + '&v=3');
    if (body.indexOf('<FlexQueryResponse') >= 0) return body;
    const code = XmlService.parse(body).getRootElement().getChildText('ErrorCode');
    // 1019 = still generating, 1018 = rate limited, 1009 = server busy: wait and retry.
    if (['1019', '1018', '1009'].indexOf(code) < 0) throw new Error('Flex statement: ' + code);
  }
  throw new Error('Flex statement still not ready after 3 minutes');
}

function flexGet_(url) {
  return UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'User-Agent': 'Java' } }).getContentText();
}

/* ---------- the sheet: live prices in, mirror out ---------- */

// Every 10 minutes: changed rows into the Transactions tab, and live prices back to the app.
function syncSheet() {
  const p = PropertiesService.getScriptProperties();
  const since = p.getProperty('MIRROR_SINCE');
  if (!since) return mirrorAll();
  const out = api_('get', '/api/export?since=' + encodeURIComponent(since));
  writeTransactions_(out.transactions);
  p.setProperty('MIRROR_SINCE', out.now);
  sendPrices_();
}

// Nightly: every tab rewritten from the database.
function mirrorAll() {
  const ss = SpreadsheetApp.getActive();
  const out = api_('get', '/api/export');
  writeTransactions_(out.transactions);
  Object.keys(out.tabs).forEach((name) => {
    const rows = out.tabs[name];
    const sh = ensureSheet_(name, [rows[0]]);
    sh.clearContents();
    const w = rows.reduce((a, r) => Math.max(a, r.length), 1);
    sh.getRange(1, 1, rows.length, w).setValues(rows.map((r) => r.concat(Array(w - r.length).fill(''))));
    sh.getRange(1, 1, 1, w).setFontWeight('bold');
  });
  const nw = ss.getSheetByName('Net Worth');
  const names = nw.getRange('A2:A6').getValues().map((r) => r[0]);
  out.accounts.forEach((a) => {
    const i = names.indexOf(a[0]);
    if (i < 0) return;
    nw.getRange(i + 2, 3).setValue(a[1]);
    nw.getRange(i + 2, 5, 1, 2).setValues([[a[2], a[3]]]);
  });
  writeHoldings_(out.holdings);
  PropertiesService.getScriptProperties().setProperty('MIRROR_SINCE', out.now);
  sendPrices_();
}

// Rows keep their database number as their sheet row. Column H (Month) is the sheet's own formula.
function writeTransactions_(rows) {
  if (!rows || !rows.length) return;
  const sh = SpreadsheetApp.getActive().getSheetByName('Transactions');
  if (rows.length <= 15) {
    rows.forEach((r) => {
      const n = r[0];
      sh.getRange(n, 1, 1, 7).setValues([[r[1], r[2], r[3], r[4], r[5], r[6], r[7]]]);
      sh.getRange(n, 9, 1, 2).setValues([[r[8], r[9]]]);
      sh.getRange(n, 1).setNumberFormat('yyyy-mm-dd hh:mm');
      sh.getRange(n, 3).setNumberFormat('#,##0.00');
    });
    return;
  }
  // Many rows: one block from the first to the last, keeping whatever sits in rows the database didn't send.
  const lo = rows.reduce((a, r) => Math.min(a, r[0]), Infinity), hi = rows.reduce((a, r) => Math.max(a, r[0]), 0);
  if (sh.getMaxRows() < hi) sh.insertRowsAfter(sh.getMaxRows(), hi - sh.getMaxRows());
  const left = sh.getRange(lo, 1, hi - lo + 1, 7).getValues(), right = sh.getRange(lo, 9, hi - lo + 1, 2).getValues();
  rows.forEach((r) => { left[r[0] - lo] = [r[1], r[2], r[3], r[4], r[5], r[6], r[7]]; right[r[0] - lo] = [r[8], r[9]]; });
  sh.getRange(lo, 1, hi - lo + 1, 7).setValues(left);
  sh.getRange(lo, 9, hi - lo + 1, 2).setValues(right);
  sh.getRange(lo, 1, hi - lo + 1, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sh.getRange(lo, 3, hi - lo + 1, 1).setNumberFormat('#,##0.00');
}

// Holdings: positions from the database, prices from GOOGLEFINANCE (IBKR's mark if Google is off by over 20%).
function writeHoldings_(rows) {
  const sh = SpreadsheetApp.getActive().getSheetByName('Holdings');
  const cur = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues() : [];
  const same = cur.length === rows.length && cur.every((c, i) => c[0] === rows[i][0] && Number(c[2]) === rows[i][2] && Number(c[3]) === rows[i][3] && c[8] === rows[i][4]);
  if (same) return;
  sh.getRange('A2:J200').clearContent();
  if (!rows.length) return;
  sh.getRange(2, 1, rows.length, 4).setValues(rows.map((r) => [r[0], r[1], r[2], r[3]]));
  sh.getRange(2, 9, rows.length, 1).setValues(rows.map((r) => [r[4]]));
  sh.getRange(2, 5, rows.length, 4).setFormulas(rows.map((r, i) => {
    const k = i + 2;
    const price = r[4] === '' ? '=1' : '=LET(g,IFERROR(GOOGLEFINANCE(I' + k + '),0),m,' + r[5] + ',IF(ABS(g/m-1)<0.2,g,m))';
    return [price, '=C' + k + '*E' + k, '=C' + k + '*D' + k, '=F' + k + '-G' + k];
  }));
  sh.getRange(2, 10, rows.length, 1).setFormulas(rows.map((r, i) => [r[4] === '' ? '=1' : '=IF(I' + (i + 2) + '="",1,IFERROR(INDEX(GOOGLEFINANCE(I' + (i + 2) + ',"closeyest")),E' + (i + 2) + '))']));
}

function sendPrices_() {
  const ss = SpreadsheetApp.getActive();
  SpreadsheetApp.flush();
  const h = ss.getSheetByName('Holdings');
  const rows = h.getLastRow() > 1 ? h.getRange(2, 1, h.getLastRow() - 1, 10).getValues() : [];
  const holdings = rows.filter((r) => r[0] && r[0] !== 'CASH' && Number(r[4]) > 0).map((r) => ({ symbol: r[0], price: Number(r[4]), prev: Number(r[9]) || Number(r[4]) }));
  const usdphp = Number(ss.getSheetByName('Net Worth').getRange('H2').getValue()) || null;
  api_('post', '/api/ingest/prices', { usdphp: usdphp, holdings: holdings });
}

/* ---------- one-time copy into the database ---------- */

// Sends every tab to the app, which replaces the database with it. Locked in Vercel once the app runs on the database.
function copyToDb() {
  const tabs = {};
  SpreadsheetApp.getActive().getSheets().forEach((sh) => {
    if (sh.getLastRow() < 1) return;
    tabs[sh.getName()] = sh.getDataRange().getValues().map((r) => r.map((v) => (v instanceof Date ? v.toISOString() : v)));
  });
  Logger.log(JSON.stringify(api_('post', '/api/admin/import', { tabs: tabs })));
}

function compareDb() {
  Logger.log(JSON.stringify(api_('get', '/api/admin/compare')).slice(0, 8000));
}
