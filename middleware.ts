import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, ROOM_COOKIE, authEnabled, readCookie, readRoomCookie, roomKey } from '@/lib/auth';

/**
 * Access (A1): the passcode protects the home page and Library. An invite link (/green-room/<room>?k=<signature>)
 * is enough on its own for that one room — guests never see the passcode. Room APIs re-check the room themselves.
 */
const ROOM_PAGE = /^\/(green-room|studio)\/([a-zA-Z0-9_-]+)/;
const ROOM_API = /^\/api\/(livekit-token|upload-url|session|topics|invite)/;

export async function middleware(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith('/enter') || pathname.startsWith('/api/enter')) return NextResponse.next();
  if (await readCookie(req.cookies.get(COOKIE)?.value)) return NextResponse.next();

  const room = pathname.match(ROOM_PAGE)?.[2];
  const k = req.nextUrl.searchParams.get('k');
  if (room && k && k === (await roomKey(room))) {
    const res = NextResponse.next();
    res.cookies.set(ROOM_COOKIE, `${room}.${k}`, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 7 * 86400 });
    return res;
  }
  const held = await readRoomCookie(req.cookies.get(ROOM_COOKIE)?.value);
  if (room && held === room) return NextResponse.next();
  if (held && ROOM_API.test(pathname)) return NextResponse.next(); // the route checks it's the same room

  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = '/enter'; url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/|worklets/|sets/|favicon|.*\\.(?:png|jpg|svg|webp|js|wasm|tflite)$).*)'] };
