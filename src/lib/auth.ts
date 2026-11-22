/**
 * Passcode sign-in (A1–A3). One shared studio passcode (env STUDIO_PASSCODE) plus a first name.
 * The cookie holds `name.expiry.signature` signed with AUTH_SECRET (HMAC-SHA256, Web Crypto so it runs in middleware).
 * If STUDIO_PASSCODE isn't set the site is open (local dev).
 */
export const COOKIE = 'st3';
/** Invite-link pass: lets a guest into one room (and its APIs) without the passcode. */
export const ROOM_COOKIE = 'st3r';
const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(process.env.AUTH_SECRET || 'dev-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export const authEnabled = () => !!process.env.STUDIO_PASSCODE;

export async function makeCookie(name: string, days = 60) {
  const exp = Date.now() + days * 864e5;
  const body = `${encodeURIComponent(name)}.${exp}`;
  return `${body}.${await hmac(body)}`;
}

/** Returns the signed-in first name, or null. */
export async function readCookie(v: string | undefined | null): Promise<string | null> {
  if (!v) return null;
  const i = v.lastIndexOf('.'); if (i < 0) return null;
  const body = v.slice(0, i), sig = v.slice(i + 1);
  if ((await hmac(body)) !== sig) return null;
  const [name, exp] = body.split('.');
  if (Number(exp) < Date.now()) return null;
  return decodeURIComponent(name);
}

export function cookieFrom(req: Request) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** For API routes: the caller's name, 'dev' when auth is off, or null when not signed in. */
export async function whoami(req: Request) {
  if (!authEnabled()) return 'dev';
  return readCookie(cookieFrom(req));
}

/** Signature that makes an invite link valid: /green-room/<session>?k=<roomKey(session)>. */
export const roomKey = async (session: string) => (await hmac('room:' + session)).slice(0, 16);
export async function readRoomCookie(v: string | undefined | null): Promise<string | null> {
  if (!v) return null; const [session, k] = v.split('.');
  return session && k && (await roomKey(session)) === k ? session : null;
}
function roomCookieFrom(req: Request) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|; )${ROOM_COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
/** For room APIs: the signed-in name, 'guest' for someone holding this room's invite link, or null. */
export async function canUseRoom(req: Request, room: string): Promise<string | null> {
  const who = await whoami(req); if (who) return who;
  return (await readRoomCookie(roomCookieFrom(req))) === room ? 'guest' : null;
}
