import { NextResponse } from 'next/server';
import { readReceipt } from '../../../lib/receipt';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// The Add sheet's Scan receipt / From Photos: {image: data URL} -> what the receipt says. Nothing is saved here.
export async function POST(req) {
  const { image } = await req.json().catch(() => ({}));
  try {
    return NextResponse.json({ ok: true, receipt: await readReceipt(image) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e && e.message ? e.message : e) }, { status: 200 });
  }
}
