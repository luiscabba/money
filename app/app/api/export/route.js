import { NextResponse } from 'next/server';
import { authorizedApp } from '../../../lib/core';
import { exportTabs } from '../../../lib/sheetio';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// The sheet mirror. ?since=<ISO> returns only transactions changed since then; without it, every tab.
export async function GET(req) {
  if (!authorizedApp(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const since = new URL(req.url).searchParams.get('since');
  return NextResponse.json(await exportTabs(since && !isNaN(new Date(since)) ? new Date(since).toISOString() : null));
}
