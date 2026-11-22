import { chunkStore, type ChunkMeta } from './chunkStore';

/**
 * Uploads chunks and deletes each local copy only after the server confirms it (R3, R4).
 * Three uploads run at once so a 4-video recording keeps up on a normal home connection;
 * a failed chunk stays on disk and is retried with backoff (3 s → 30 s).
 */
export type SendFn = (sessionId: string, meta: ChunkMeta, blob: Blob) => Promise<boolean>;
const PARALLEL = 3;

export class UploadQueue {
  private queue: ChunkMeta[] = [];
  private active = 0;
  private failures = 0;
  uploaded = 0;
  constructor(private sessionId: string, private send: SendFn, private onProgress?: (done: number, pending: number) => void) {}

  add(meta: ChunkMeta) { this.queue.push(meta); this.report(); this.pump(); }

  /** After a crash or closed tab: re-queue everything still on disk for this session. */
  async resumeFromDisk() {
    const m = await chunkStore.manifest(this.sessionId);
    if (!m) return;
    for (const c of m.chunks) if (await chunkStore.get(this.sessionId, c)) this.queue.push(c);
    this.report(); this.pump();
  }

  get pending() { return this.queue.length + this.active; }
  private report() { this.onProgress?.(this.uploaded, this.pending); }

  private pump() {
    while (this.active < PARALLEL && this.queue.length) {
      const meta = this.queue.shift()!; this.active++;
      void this.one(meta).finally(() => { this.active--; this.report(); this.pump(); });
    }
  }

  private async one(meta: ChunkMeta) {
    for (;;) {
      const blob = await chunkStore.get(this.sessionId, meta);
      if (!blob) return;
      let ok = false;
      try { ok = await this.send(this.sessionId, meta, blob); } catch { ok = false; }
      if (ok) { await chunkStore.remove(this.sessionId, meta); this.uploaded++; this.failures = 0; return; }
      this.failures++;
      await new Promise((r) => setTimeout(r, Math.min(30_000, 3000 * this.failures))); // chunk stays on disk
    }
  }
}

/** Sender used when storage isn't configured: keeps chunks on disk (returns false = not uploaded). */
export const notConfiguredSend: SendFn = async () => false;
