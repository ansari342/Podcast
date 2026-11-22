import { AccessToken } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

/** Issues a LiveKit join token (S1). TODO(A1, A2): require a signed-in, allowlisted user before issuing. */
export async function POST(req: Request) {
  const { LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = process.env;
  if (!key || !secret) return NextResponse.json({ error: 'LiveKit not configured' }, { status: 501 });
  const { room, identity, name } = (await req.json()) as { room: string; identity: string; name?: string };
  if (!room || !identity) return NextResponse.json({ error: 'room and identity required' }, { status: 400 });
  const at = new AccessToken(key, secret, { identity, name: name ?? identity, ttl: '6h' });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return NextResponse.json({ token: await at.toJwt() });
}
