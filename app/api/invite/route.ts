import { NextResponse } from 'next/server';
import { canUseRoom, roomKey } from '@/lib/auth';

/** The invite link for a room: /green-room/<room>?k=<signature>. Anyone in the room can share it. */
export async function GET(req: Request) {
  const room = String(new URL(req.url).searchParams.get('session') ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!room || !(await canUseRoom(req, room))) return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  return NextResponse.json({ path: `/green-room/${room}?k=${await roomKey(room)}` });
}
