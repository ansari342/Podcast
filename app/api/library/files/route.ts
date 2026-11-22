import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { s3, safe } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';

/** Signed download URLs for every chunk of one track, grouped into parts, in order (L2). The browser joins each part into one file. */
export async function GET(req: Request) {
  const c = s3(); if (!c) return NextResponse.json({ error: 'Storage not configured' }, { status: 501 });
  const u = new URL(req.url);
  const prefix = `sessions/${safe(u.searchParams.get('session'))}/${safe(u.searchParams.get('person'))}/${safe(u.searchParams.get('track'))}/`;
  const keys: string[] = []; const sizes = new Map<string, number>(); let token: string | undefined;
  do {
    const r = await c.client.send(new ListObjectsV2Command({ Bucket: c.bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of r.Contents ?? []) { keys.push(o.Key!); sizes.set(o.Key!, o.Size ?? 0); } token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  keys.sort();
  // Group by part: each part is one continuous recording and joins into one playable file.
  const parts = new Map<string, string[]>();
  for (const k of keys) { const f = k.slice(prefix.length); const part = f.includes('-') ? f.split('-')[0] : '0'; parts.set(part, [...(parts.get(part) ?? []), k]); }
  const out = await Promise.all([...parts].map(async ([part, ks]) => ({ part, sizes: ks.map((k) => sizes.get(k) ?? 0), urls: await Promise.all(ks.map((Key) => getSignedUrl(c.client, new GetObjectCommand({ Bucket: c.bucket, Key }), { expiresIn: 6 * 3600 }))) })));
  return NextResponse.json({ parts: out });
}
