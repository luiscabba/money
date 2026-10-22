import { NextResponse } from 'next/server';
import { sheetGet } from '../../../lib/sheet';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await sheetGet({ months: 13 });
    if (data.error) return NextResponse.json(data, { status: 502 });
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: 'sheet unreachable' }, { status: 502 });
  }
}
