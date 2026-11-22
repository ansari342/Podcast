import type { SendFn } from './uploadQueue';

/** Uploads a chunk via a presigned URL. Returns false (chunk stays on disk, retried later) if storage isn't configured or the upload fails. */
export const makeS3Send = (userId: string): SendFn => async (sessionId, meta, blob) => {
  const r = await fetch('/api/upload-url', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, userId, track: meta.track, index: meta.index, ext: meta.ext, contentType: blob.type || 'application/octet-stream' }),
  });
  if (!r.ok) return false;
  const { url } = (await r.json()) as { url: string };
  const put = await fetch(url, { method: 'PUT', body: blob, headers: { 'content-type': blob.type || 'application/octet-stream' } });
  return put.ok;
};
