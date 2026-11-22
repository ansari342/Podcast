import { AUDIO_SAMPLE_RATE, CHUNK_MS } from '@/lib/config';
import { chunkStore, type ChunkMeta, type TrackKind } from './chunkStore';
import { encodeWav } from './wav';

/**
 * Records this person's camera and mic locally, independent of call quality (R1, R2, R3, S10).
 * - Video: MediaRecorder, a chunk every CHUNK_MS.
 * - Audio: AudioWorklet → 48 kHz PCM → 24-bit WAV chunk every CHUNK_MS (sample-accurate, drift-free).
 *   With a raw mic track, the call mic is saved as `mic_clean` and the untouched mic as `mic_raw`.
 * - Every chunk carries startMs relative to the shared session epoch (R6: one clock).
 */
export type RecorderEvents = { onChunk?: (m: ChunkMeta) => void; onError?: (e: unknown) => void };

export function pickMime(): string {
  const options = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4;codecs=avc1,mp4a', 'video/webm', 'video/mp4'];
  return options.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

/** One mic track → WAV chunks. */
class WavCapture {
  private node?: AudioWorkletNode; private pcm: Float32Array[] = []; private len = 0; private index = 0; private written = 0; private startMs = 0;
  paused = false;
  constructor(private ctx: AudioContext, private kind: TrackKind, private put: (m: ChunkMeta, b: Blob) => Promise<void>, private epochMs: number) {}
  async start(track: MediaStreamTrack) {
    const src = this.ctx.createMediaStreamSource(new MediaStream([track]));
    this.node = new AudioWorkletNode(this.ctx, 'pcm-capture');
    this.startMs = Date.now() - this.epochMs;
    const per = (AUDIO_SAMPLE_RATE * CHUNK_MS) / 1000;
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (this.paused) return;
      this.pcm.push(e.data); this.len += e.data.length;
      if (this.len >= per) void this.flush(per);
    };
    src.connect(this.node);
  }
  async flush(count: number) {
    if (!this.len) return;
    const all = new Float32Array(this.len); let o = 0; for (const b of this.pcm) { all.set(b, o); o += b.length; }
    const n = Math.min(count, all.length); const rest = all.slice(n);
    this.pcm = rest.length ? [rest] : []; this.len = rest.length;
    const meta: ChunkMeta = { track: this.kind, index: this.index++, startMs: this.startMs + (this.written / AUDIO_SAMPLE_RATE) * 1000, durationMs: (n / AUDIO_SAMPLE_RATE) * 1000, ext: 'wav', bytes: n * 3 + 44 };
    this.written += n;
    await this.put(meta, encodeWav(all.subarray(0, n), AUDIO_SAMPLE_RATE));
  }
  async stop() { await this.flush(this.len); this.node?.disconnect(); }
}

export class LocalRecorder {
  private mr?: MediaRecorder;
  private ctx?: AudioContext;
  private caps: WavCapture[] = [];
  private videoIndex = 0;
  private videoStartMs = 0;
  readonly mimeType: string;

  constructor(private sessionId: string, private userId: string, private epochMs: number, private ev: RecorderEvents = {}) {
    this.mimeType = pickMime();
  }

  private put = async (meta: ChunkMeta, blob: Blob) => {
    try { await chunkStore.put(this.sessionId, meta, blob); this.ev.onChunk?.(meta); } catch (err) { this.ev.onError?.(err); }
  };

  async start(stream: MediaStream, rawMic?: MediaStreamTrack | null) {
    await chunkStore.init({ sessionId: this.sessionId, userId: this.userId, epochMs: this.epochMs, mimeType: this.mimeType, sampleRate: AUDIO_SAMPLE_RATE, chunks: [] });

    this.videoStartMs = Date.now() - this.epochMs;
    this.mr = new MediaRecorder(stream, { mimeType: this.mimeType || undefined, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 });
    this.mr.ondataavailable = (e) => {
      if (!e.data.size) return;
      const i = this.videoIndex++;
      void this.put({ track: 'camera_raw', index: i, startMs: this.videoStartMs + i * CHUNK_MS, durationMs: CHUNK_MS, ext: this.mimeType.includes('mp4') ? 'mp4' : 'webm', bytes: e.data.size }, e.data);
    };
    this.mr.start(CHUNK_MS);

    const mic = stream.getAudioTracks()[0];
    if (mic) {
      this.ctx = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
      await this.ctx.audioWorklet.addModule('/worklets/pcm-capture.js');
      const raw = rawMic && rawMic.readyState === 'live' ? rawMic : null;
      const main = new WavCapture(this.ctx, raw ? 'mic_clean' : 'mic_raw', this.put, this.epochMs); await main.start(mic); this.caps.push(main);
      if (raw) { const r = new WavCapture(this.ctx, 'mic_raw', this.put, this.epochMs); await r.start(raw); this.caps.push(r); }
    }
  }

  pause() { this.caps.forEach((c) => (c.paused = true)); if (this.mr?.state === 'recording') this.mr.pause(); }
  resume() { this.caps.forEach((c) => (c.paused = false)); if (this.mr?.state === 'paused') this.mr.resume(); }

  async stop() {
    if (this.mr && this.mr.state !== 'inactive') await new Promise<void>((res) => { this.mr!.onstop = () => res(); this.mr!.stop(); });
    for (const c of this.caps) await c.stop();
    await this.ctx?.close();
    await chunkStore.markStopped(this.sessionId);
  }
}

/** Records one extra stream (e.g. a shared screen, V2) into the same local session as its own track. */
export class TrackRecorder {
  private mr?: MediaRecorder; private index = 0; private startMs = 0;
  constructor(private sessionId: string, private epochMs: number, private kind: TrackKind, private onChunk: (m: ChunkMeta) => void) {}
  start(stream: MediaStream) {
    const mime = pickMime(); this.startMs = Date.now() - this.epochMs;
    this.mr = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 8_000_000 });
    this.mr.ondataavailable = async (e) => {
      if (!e.data.size) return; const i = this.index++;
      const meta: ChunkMeta = { track: this.kind, index: i, startMs: this.startMs + i * CHUNK_MS, durationMs: CHUNK_MS, ext: mime.includes('mp4') ? 'mp4' : 'webm', bytes: e.data.size };
      await chunkStore.put(this.sessionId, meta, e.data); this.onChunk(meta);
    };
    this.mr.start(CHUNK_MS);
  }
  pause() { if (this.mr?.state === 'recording') this.mr.pause(); }
  resume() { if (this.mr?.state === 'paused') this.mr.resume(); }
  async stop() { if (this.mr && this.mr.state !== 'inactive') await new Promise<void>((r) => { this.mr!.onstop = () => r(); this.mr!.stop(); }); }
}
