import { RoomServiceClient } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';
import { canUseRoom, whoami } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const COMPANION_PREFIX = 'cmp_';

/**
 * Phone companion (S14): who's in the call right now, so a phone can pick whose second camera it is.
 * GET ?room=<id> → that room's people (invite link or sign-in). GET with no room → every live room (sign-in only).
 */
export async function GET(req: Request) {
  const { LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret, LIVEKIT_URL } = process.env;
  if (!key || !secret || !LIVEKIT_URL) return NextResponse.json({ rooms: [], error: 'Calls aren’t set up' }, { status: 501 });
  const svc = new RoomServiceClient(LIVEKIT_URL.replace(/^ws/, 'http'), key, secret);
  const room = new URL(req.url).searchParams.get('room')?.replace(/[^a-zA-Z0-9_-]/g, '');
  const people = async (r: string) => (await svc.listParticipants(r))
    .filter((p) => !p.identity.startsWith(COMPANION_PREFIX))
    .map((p) => ({ identity: p.identity, name: p.name || 'Someone' }));
  try {
    if (room) {
      if (!(await canUseRoom(req, room))) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
      return NextResponse.json({ rooms: [{ room, people: await people(room) }] });
    }
    if (!(await whoami(req))) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
    const rooms = await Promise.all((await svc.listRooms()).map(async (r) => ({ room: r.name, people: await people(r.name) })));
    return NextResponse.json({ rooms: rooms.filter((r) => r.people.length) });
  } catch {
    return NextResponse.json({ rooms: [] });
  }
}
