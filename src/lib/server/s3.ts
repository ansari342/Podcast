import { S3Client, PutBucketCorsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

/** R2/S3 client from env, or null when storage isn't configured. */
let client: S3Client | null = null;
export function s3() {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null;
  client ??= new S3Client({ region: S3_REGION || 'auto', endpoint: S3_ENDPOINT, credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY } });
  return { client, bucket: S3_BUCKET };
}
export const safe = (s: unknown) => String(s ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);

/** Browsers upload straight to the bucket, which needs CORS. Try to set it once; harmless if the key can't. */
let corsTried = false;
export async function ensureCors(origin: string) {
  const c = s3(); if (!c || corsTried) return; corsTried = true;
  try {
    await c.client.send(new PutBucketCorsCommand({ Bucket: c.bucket, CORSConfiguration: { CORSRules: [{
      AllowedOrigins: [origin, 'https://theboys.space', 'https://www.theboys.space', 'http://localhost:3000'],
      AllowedMethods: ['GET', 'PUT', 'HEAD'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3600,
    }] } }));
  } catch (e) { console.warn('Could not set bucket CORS (set it in the R2 dashboard):', (e as Error).message); }
}

/**
 * Storage cap (cost limit): R2 has no hard spending cap, so the site enforces one. New uploads are refused once the
 * bucket holds STORAGE_LIMIT_GB (set in Vercel; 150 GB ≈ $2/month on R2 at most). Chunks that are refused stay safe in the browser
 * and upload once space is freed (delete old episodes in the Library) or the limit is raised.
 */
export const limitBytes = () => (Number(process.env.STORAGE_LIMIT_GB) || 150) * 1e9;
let usage: { bytes: number; at: number } | null = null;
export async function bucketBytes(fresh = false): Promise<number> {
  const c = s3(); if (!c) return 0;
  if (!fresh && usage && Date.now() - usage.at < 60_000) return usage.bytes;
  let bytes = 0; let token: string | undefined;
  do {
    const r = await c.client.send(new ListObjectsV2Command({ Bucket: c.bucket, ContinuationToken: token }));
    for (const o of r.Contents ?? []) bytes += o.Size ?? 0;
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  usage = { bytes, at: Date.now() };
  return bytes;
}
/** Count bytes we just allowed, so the cap holds between listings. */
export const noteUpload = (n: number) => { if (usage) usage.bytes += n; };
