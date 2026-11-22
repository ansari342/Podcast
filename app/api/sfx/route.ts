import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { canUseRoom } from '@/lib/auth';
import { ensureCors, s3, safe } from '@/lib/server/s3';

/**
 * Custom sound (SB1 slot 9). POST {room, name, type, bytes} → presigned PUT for sfx/<room>/<id>.<ext>.
 * GET ?key= → redirect to a signed download of that sound. Max 5 MB.
 */
export async function POST(req: Request) {
  const c = s3(); if (!c) return NextResponse.json({ error: 'Storage not configured' }, { status: 501 });
  const b = (await req.json()) as { room: string; type: string; bytes: number };
  if (!(await canUseRoom(req, safe(b.room)))) return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  if (!/^audio\//.test(b.type) || b.bytes > 5e6) return NextResponse.json({ error: 'Audio files up to 5 MB' }, { status: 400 });
  await ensureCors(new URL(req.url).origin);
  const ext = safe(b.type.split('/')[1]?.split(';')[0] || 'mp3').slice(0, 5);
  const key = `sfx/${safe(b.room)}/${Date.now().toString(36)}.${ext}`;
  const url = await getSignedUrl(c.client, new PutObjectCommand({ Bucket: c.bucket, Key: key, ContentType: b.type }), { expiresIn: 600 });
  return NextResponse.json({ url, key });
}

export async function GET(req: Request) {
  const c = s3(); if (!c) return NextResponse.json({ error: 'Storage not configured' }, { status: 501 });
  const key = new URL(req.url).searchParams.get('key') ?? '';
  const m = key.match(/^sfx\/([a-zA-Z0-9_-]+)\/[a-z0-9]+\.[a-z0-9]+$/);
  if (!m || !(await canUseRoom(req, m[1]))) return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  return NextResponse.redirect(await getSignedUrl(c.client, new GetObjectCommand({ Bucket: c.bucket, Key: key }), { expiresIn: 3600 }));
}
