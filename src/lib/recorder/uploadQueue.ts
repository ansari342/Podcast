import { chunkStore, type ChunkMeta } from './chunkStore';

/**
 * Uploads chunks in order and deletes each local copy only after the server confirms it (R3, R4).
 * `send` is pluggable: wire it to the presigned-URL route once storage keys exist (see BUILD_STATUS.md).
 */
export type SendFn = (sessionId: string, meta: ChunkMeta, blob: Blob) => Promise<boolean>;

export class UploadQueue {
  private queue: ChunkMeta[] = [];
  private busy = false;
  uploaded = 0;
  constructor(private sessionId: string, private send: SendFn, private onProgress?: (done: number, pending: number) => void) {}

  add(meta: ChunkMeta) { this.queue.push(meta); void this.pump(); }

  /** After a crash or closed tab: re-queue everything still on disk for this session. */
  async resumeFromDisk() {
    const m = await chunkStore.manifest(this.sessionId);
    if (!m) return;
    for (const c of m.chunks) if (await chunkStore.get(this.sessionId, c)) this.queue.push(c);
    void this.pump();
  }

  get pending() { return this.queue.length; }

  private async pump() {
    if (this.busy) return; this.busy = true;
    while (this.queue.length) {
      const meta = this.queue[0];
      const blob = await chunkStore.get(this.sessionId, meta);
      if (!blob) { this.queue.shift(); continue; }
      let ok = false;
      try { ok = await this.send(this.sessionId, meta, blob); } catch { ok = false; }
      if (!ok) { await new Promise((r) => setTimeout(r, 3000)); continue; } // retry with backoff; chunk stays on disk
      await chunkStore.remove(this.sessionId, meta);
      this.queue.shift(); this.uploaded++;
      this.onProgress?.(this.uploaded, this.queue.length);
    }
    this.busy = false;
  }
}

/** Placeholder sender until storage is configured: keeps chunks on disk (returns false = not uploaded). */
export const notConfiguredSend: SendFn = async () => false;
