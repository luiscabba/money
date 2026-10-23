import { NextResponse } from 'next/server';
import { COOKIE, validToken } from './lib/session';

const OPEN = ['/login', '/api/login', '/api/push', '/manifest.webmanifest', '/sw.js', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.ico'];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  // Machine routes check the shared APP_TOKEN themselves.
  if (OPEN.includes(pathname) || pathname.startsWith('/_next/') || /^\/api\/(ingest|cron|export|admin)(\/|$)/.test(pathname)) return NextResponse.next();
  if (await validToken(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = { matcher: '/((?!_next/static|_next/image).*)' };
