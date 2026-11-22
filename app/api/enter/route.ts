import { NextResponse } from 'next/server';
import { COOKIE, makeCookie, whoami } from '@/lib/auth';

/** POST {passcode, name} → sets the sign-in cookie. GET → who am I. DELETE → sign out. */
export async function POST(req: Request) {
  const { passcode, name } = (await req.json()) as { passcode?: string; name?: string };
  const clean = String(name ?? '').trim().slice(0, 24);
  if (!clean) return NextResponse.json({ error: 'Add your name' }, { status: 400 });
  if (process.env.STUDIO_PASSCODE && passcode?.trim().toLowerCase() !== process.env.STUDIO_PASSCODE.toLowerCase())
    return NextResponse.json({ error: 'Wrong passcode' }, { status: 401 });
  const res = NextResponse.json({ ok: true, name: clean });
  res.cookies.set(COOKIE, await makeCookie(clean), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 864e2 });
  return res;
}
export async function GET(req: Request) { return NextResponse.json({ name: await whoami(req) }); }
export async function DELETE() { const r = NextResponse.json({ ok: true }); r.cookies.delete(COOKIE); return r; }
