import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, authEnabled, readCookie } from '@/lib/auth';

/** Everything except the enter page, its API, and static assets needs the studio passcode (A1). */
export async function middleware(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith('/enter') || pathname.startsWith('/api/enter')) return NextResponse.next();
  if (await readCookie(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = '/enter'; url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/|worklets/|sets/|favicon|.*\\.(?:png|jpg|svg|webp|js|wasm|tflite)$).*)'] };
