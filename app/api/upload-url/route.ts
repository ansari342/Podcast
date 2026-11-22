import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';

/**
 * Returns a presigned PUT URL for one recording chunk (R3). Key: sessions/<session>/<user>/<track>/<index>.<ext>
 * TODO(A1): authorise the caller for this session. TODO: switch to multipart for large final files if needed.
 */
let client: S3Client | null = null;
export async function POST(req: Request) {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return NextResponse.json({ error: 'Storage not configured' }, { status: 501 });
  client ??= new S3Client({ region: S3_REGION ?? 'auto', endpoint: S3_ENDPOINT, credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY } });
  const b = (await req.json()) as { sessionId: string; userId: string; track: string; index: number; ext: string; contentType: string };
  const safe = (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, '');
  const key = `sessions/${safe(b.sessionId)}/${safe(b.userId)}/${safe(b.track)}/${String(b.index).padStart(6, '0')}.${safe(b.ext)}`;
  const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: b.contentType }), { expiresIn: 600 });
  return NextResponse.json({ url, key });
}
