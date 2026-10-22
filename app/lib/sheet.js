// Server-only bridge to the Google Apps Script web app that owns the sheet.
export async function sheetGet(params = {}) {
  const url = new URL(process.env.APPS_SCRIPT_URL);
  url.searchParams.set('token', process.env.APP_TOKEN);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
  return res.json();
}

export async function sheetPost(body) {
  const res = await fetch(process.env.APPS_SCRIPT_URL, {
    method: 'POST',
    cache: 'no-store',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, token: process.env.APP_TOKEN })
  });
  return res.json();
}
