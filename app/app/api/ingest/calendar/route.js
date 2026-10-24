import { NextResponse } from 'next/server';
import { authorizedApp } from '../../../../lib/core';
import { setSetting } from '../../../../lib/store';

export const dynamic = 'force-dynamic';

// The Apps Script posts the next week's calendar events that have a place: {events: [{id, title, start, end, location}]}.
export async function POST(req) {
  if (!authorizedApp(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { events } = await req.json().catch(() => ({}));
  const clean = (Array.isArray(events) ? events : []).filter((e) => e && e.id && e.start && e.location).slice(0, 40).map((e) => ({
    id: String(e.id).slice(0, 200), title: String(e.title || 'Event').slice(0, 80), start: String(e.start).slice(0, 30),
    end: String(e.end || '').slice(0, 30), location: String(e.location).slice(0, 120), allDay: !!e.allDay
  }));
  await setSetting('calendar_events', clean);
  return NextResponse.json({ ok: true, count: clean.length });
}
