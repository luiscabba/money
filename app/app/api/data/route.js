import { NextResponse } from 'next/server';
import { sheetGet } from '../../../lib/sheet';
import { useDb } from '../../../lib/db';
import { loadData } from '../../../lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = useDb() ? await loadData(13) : await sheetGet({ months: 13 });
    if (data.error) return NextResponse.json(data, { status: 502 });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store', 'x-build': (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 12) } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'data unreachable' }, { status: 502 });
  }
}
