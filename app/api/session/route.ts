import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { canUseRoom } from '@/lib/auth';
import { s3, safe } from '@/lib/server/s3';

/** Saves episode details (title, when, who) next to the recordings so the Library can list them (L1). */
export async function POST(req: Request) {
  const c = s3(); if (!c) return NextResponse.json({ ok: false }, { status: 501 });
  const b = (await req.json()) as { sessionId: string; title?: string; people?: Record<string, string>; startedAt?: number; durationMs?: number };
  const who = await canUseRoom(req, safe(b.sessionId)); if (!who) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const meta = { sessionId: safe(b.sessionId), title: String(b.title ?? 'Episode').slice(0, 120), people: b.people ?? {}, startedAt: b.startedAt ?? Date.now(), durationMs: b.durationMs ?? 0, by: who, savedAt: Date.now() };
  await c.client.send(new PutObjectCommand({ Bucket: c.bucket, Key: `sessions/${meta.sessionId}/meta.json`, Body: JSON.stringify(meta), ContentType: 'application/json' }));
  return NextResponse.json({ ok: true });
}
