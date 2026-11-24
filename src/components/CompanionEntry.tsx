'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type LiveRoom = { room: string; people: { identity: string; name: string }[] };

/** True on phones and small tablets (touch-first, narrow). */
export function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const ua = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    setPhone(ua || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820));
  }, []);
  return phone;
}

/**
 * S14: on a phone, offer "Join companion" for any call that has people in it (one room, or every live room).
 * Renders nothing on a computer or when nobody's in a call.
 */
export function CompanionEntry({ room }: { room?: string }) {
  const phone = useIsPhone();
  const [rooms, setRooms] = useState<LiveRoom[]>([]);
  useEffect(() => {
    if (!phone) return;
    const load = () => fetch(`/api/companion${room ? `?room=${room}` : ''}`).then((r) => (r.ok ? r.json() : { rooms: [] })).then((j) => setRooms((j.rooms ?? []).filter((x: LiveRoom) => x.people.length))).catch(() => {});
    void load(); const t = setInterval(load, 5000); return () => clearInterval(t);
  }, [phone, room]);
  if (!phone || !rooms.length) return null;
  return (
    <div className="side" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span className="section-title">On your phone?</span>
      <span className="muted" style={{ fontSize: 14 }}>Use it as a second camera for yourself. It records when the studio records.</span>
      {rooms.map((r) => (
        <Link key={r.room} href={`/companion/${r.room}`} className="btn btn-primary" style={{ minHeight: 52, flexDirection: 'column', gap: 0, padding: '6px 14px' }}>
          Join companion
          <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.8 }}>{r.people.map((p) => p.name).join(', ')} in the call</span>
        </Link>))}
    </div>);
}
