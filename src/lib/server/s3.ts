import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';

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
