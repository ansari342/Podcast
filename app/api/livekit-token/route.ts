import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';
import { whoami } from '@/lib/auth';

/** Issues a LiveKit join token (S1) to a signed-in person (A1). Name comes from their sign-in, not the client. */
export async function POST(req: Request) {
  const { LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret, LIVEKIT_URL } = process.env;
  if (!key || !secret) return NextResponse.json({ error: 'LiveKit not configured' }, { status: 501 });
  const who = await whoami(req);
  if (!who) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const { room, identity, name } = (await req.json()) as { room: string; identity: string; name?: string };
  const safe = (s: string) => String(s ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  if (!safe(room) || !safe(identity)) return NextResponse.json({ error: 'room and identity required' }, { status: 400 });
  const at = new AccessToken(key, secret, { identity: safe(identity), name: who === 'dev' ? (name ?? identity) : who, ttl: '8h' });
  at.addGrant({ room: safe(room), roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return NextResponse.json({ token: await at.toJwt(), url: LIVEKIT_URL });
}
