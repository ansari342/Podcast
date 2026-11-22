import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { whoami } from '@/lib/auth';
import { bucketBytes, ensureCors, limitBytes, noteUpload, s3, safe } from '@/lib/server/s3';

/** Presigned PUT for one recording chunk (R3). Key: sessions/<session>/<person>/<track>/<part>-<index>.<ext> */
export async function POST(req: Request) {
  const c = s3(); if (!c) return NextResponse.json({ error: 'Storage not configured' }, { status: 501 });
  if (!(await whoami(req))) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  await ensureCors(new URL(req.url).origin);
  const b = (await req.json()) as { sessionId: string; userId: string; track: string; index: number; ext: string; contentType: string; bytes?: number };
  if ((await bucketBytes()) + (b.bytes ?? 0) > limitBytes())
    return NextResponse.json({ error: 'Storage limit reached', limitGb: limitBytes() / 1e9 }, { status: 507 });
  noteUpload(b.bytes ?? 3_000_000);
  // Local recordings are stored as "<session>~<part>": a part is one continuous recording by one person
  // (a new take, or rejoining mid-take, starts a new part so chunk numbers never collide).
  const [session, part = '0'] = String(b.sessionId).split('~');
  const key = `sessions/${safe(session)}/${safe(b.userId)}/${safe(b.track)}/${safe(part)}-${String(Number(b.index) || 0).padStart(6, '0')}.${safe(b.ext)}`;
  const url = await getSignedUrl(c.client, new PutObjectCommand({ Bucket: c.bucket, Key: key, ContentType: b.contentType }), { expiresIn: 600 });
  return NextResponse.json({ url, key });
}
