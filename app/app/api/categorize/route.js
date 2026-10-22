import { NextResponse } from 'next/server';
import { sheetPost } from '../../../lib/sheet';

export async function POST(req) {
  const { row, category, remember } = await req.json();
  const out = await sheetPost({ action: 'categorize', row, category, remember: !!remember });
  return NextResponse.json(out, { status: out.error ? 400 : 200 });
}
