import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { s3 } from '@/lib/server/s3';

export const dynamic = 'force-dynamic';

/** Lists every recorded session in the bucket with its tracks and sizes (L1). Auth is enforced by middleware. */
export async function GET() {
  const c = s3(); if (!c) return NextResponse.json({ error: 'Storage not configured' }, { status: 501 });
  const objs: { Key?: string; Size?: number; LastModified?: Date }[] = [];
  let token: string | undefined;
  do {
    const r = await c.client.send(new ListObjectsV2Command({ Bucket: c.bucket, Prefix: 'sessions/', ContinuationToken: token }));
    objs.push(...(r.Contents ?? [])); token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token && objs.length < 50_000);

  type T = { person: string; track: string; chunks: number; bytes: number; ext: string };
  const sessions = new Map<string, { id: string; tracks: Map<string, T>; last: number; meta?: unknown }>();
  for (const o of objs) {
    const [, id, person, track, file] = (o.Key ?? '').split('/');
    if (!id) continue;
    const s = sessions.get(id) ?? { id, tracks: new Map(), last: 0 }; sessions.set(id, s);
    s.last = Math.max(s.last, o.LastModified?.getTime() ?? 0);
    if (person === 'meta.json') continue;
    if (!track || !file) continue;
    const k = `${person}/${track}`; const t = s.tracks.get(k) ?? { person, track, chunks: 0, bytes: 0, ext: file.split('.').pop() ?? '' };
    t.chunks++; t.bytes += o.Size ?? 0; s.tracks.set(k, t);
  }
  const list = await Promise.all([...sessions.values()].sort((a, b) => b.last - a.last).slice(0, 100).map(async (s) => {
    let meta: unknown = null;
    try { const r = await c.client.send(new GetObjectCommand({ Bucket: c.bucket, Key: `sessions/${s.id}/meta.json` })); meta = JSON.parse(await r.Body!.transformToString()); } catch { /* no meta yet */ }
    return { id: s.id, last: s.last, meta, tracks: [...s.tracks.values()] };
  }));
  return NextResponse.json({ sessions: list });
}
