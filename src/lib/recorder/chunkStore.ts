/**
 * Durable chunk storage in the browser's Origin Private File System (R3, R4).
 * Layout: /sessions/<sessionId>/<track>/<index>.<ext> plus manifest.json per session.
 * Chunks stay on disk until the uploader confirms them (Quality bar: zero lost recordings).
 */
export type TrackKind = 'camera_raw' | 'mic_raw' | 'mic_clean' | 'screen' | 'active';
export type ChunkMeta = { track: TrackKind; index: number; startMs: number; durationMs: number; ext: string; bytes: number };
export type SessionManifest = { sessionId: string; userId: string; epochMs: number; mimeType: string; sampleRate: number; chunks: ChunkMeta[]; stoppedAt?: number };

async function dir(path: string[], create = true): Promise<FileSystemDirectoryHandle> {
  let d = await navigator.storage.getDirectory();
  for (const p of path) d = await d.getDirectoryHandle(p, { create });
  return d;
}

async function writeFile(d: FileSystemDirectoryHandle, name: string, data: Blob | string) {
  const fh = await d.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

export const chunkStore = {
  async init(m: SessionManifest) {
    await navigator.storage.persist?.();
    const d = await dir(['sessions', m.sessionId]);
    await writeFile(d, 'manifest.json', JSON.stringify(m));
  },
  async manifest(sessionId: string): Promise<SessionManifest | null> {
    try {
      const d = await dir(['sessions', sessionId], false);
      const f = await (await d.getFileHandle('manifest.json')).getFile();
      return JSON.parse(await f.text());
    } catch { return null; }
  },
  async put(sessionId: string, meta: ChunkMeta, blob: Blob) {
    const d = await dir(['sessions', sessionId, meta.track]);
    await writeFile(d, `${String(meta.index).padStart(6, '0')}.${meta.ext}`, blob);
    const m = await this.manifest(sessionId);
    if (m) { m.chunks.push(meta); await writeFile(await dir(['sessions', sessionId]), 'manifest.json', JSON.stringify(m)); }
  },
  async get(sessionId: string, meta: ChunkMeta): Promise<Blob | null> {
    try {
      const d = await dir(['sessions', sessionId, meta.track], false);
      return await (await d.getFileHandle(`${String(meta.index).padStart(6, '0')}.${meta.ext}`)).getFile();
    } catch { return null; }
  },
  async remove(sessionId: string, meta: ChunkMeta) {
    try {
      const d = await dir(['sessions', sessionId, meta.track], false);
      await d.removeEntry(`${String(meta.index).padStart(6, '0')}.${meta.ext}`);
    } catch { /* already gone */ }
  },
  async markStopped(sessionId: string) {
    const m = await this.manifest(sessionId);
    if (m) { m.stoppedAt = Date.now(); await writeFile(await dir(['sessions', sessionId]), 'manifest.json', JSON.stringify(m)); }
  },
  /** Session ids with chunks still on disk (used to resume uploads after a crash or closed tab). */
  async sessions(): Promise<string[]> {
    const ids: string[] = [];
    try {
      const d = await dir(['sessions']);
      // @ts-expect-error: async iteration of directory handles is supported in Chromium and Safari 16+
      for await (const [name, h] of d.entries()) if (h.kind === 'directory') ids.push(name);
    } catch { /* none */ }
    return ids;
  },
  async deleteSession(sessionId: string) {
    try { await (await dir(['sessions'])).removeEntry(sessionId, { recursive: true }); } catch { /* ignore */ }
  },
};
