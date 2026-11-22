import { AUDIO_SAMPLE_RATE, CHUNK_MS } from '@/lib/config';
import { chunkStore, type ChunkMeta } from './chunkStore';
import { encodeWav } from './wav';

/**
 * Records this person's camera and mic locally, independent of call quality (R1, R2, R3).
 * - Video: MediaRecorder, a chunk every CHUNK_MS.
 * - Audio: AudioWorklet → 48 kHz PCM → 24-bit WAV chunk every CHUNK_MS (sample-accurate, drift-free).
 * - Every chunk carries startMs relative to the shared session epoch (R6: one clock).
 *   Pass the epoch the host broadcasts at countdown end so all three browsers align.
 */
export type RecorderEvents = { onChunk?: (m: ChunkMeta) => void; onError?: (e: unknown) => void };

function pickMime(): string {
  const options = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4;codecs=avc1,mp4a', 'video/webm', 'video/mp4'];
  return options.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

export class LocalRecorder {
  private mr?: MediaRecorder;
  private ctx?: AudioContext;
  private node?: AudioWorkletNode;
  private pcm: Float32Array[] = [];
  private pcmLen = 0;
  private videoIndex = 0;
  private audioIndex = 0;
  private samplesWritten = 0;
  private videoStartMs = 0;
  private paused = false;
  private audioStartMs = 0;
  readonly mimeType: string;

  constructor(private sessionId: string, private userId: string, private epochMs: number, private ev: RecorderEvents = {}) {
    this.mimeType = pickMime();
  }

  async start(stream: MediaStream) {
    await chunkStore.init({ sessionId: this.sessionId, userId: this.userId, epochMs: this.epochMs, mimeType: this.mimeType, sampleRate: AUDIO_SAMPLE_RATE, chunks: [] });

    // Video (camera track + mic for a reference audio track inside the video file)
    this.videoStartMs = Date.now() - this.epochMs;
    this.mr = new MediaRecorder(stream, { mimeType: this.mimeType || undefined, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 192_000 });
    this.mr.ondataavailable = async (e) => {
      if (!e.data.size) return;
      const meta: ChunkMeta = { track: 'camera_raw', index: this.videoIndex++, startMs: this.videoStartMs + (this.videoIndex - 1) * CHUNK_MS, durationMs: CHUNK_MS, ext: this.mimeType.includes('mp4') ? 'mp4' : 'webm', bytes: e.data.size };
      try { await chunkStore.put(this.sessionId, meta, e.data); this.ev.onChunk?.(meta); } catch (err) { this.ev.onError?.(err); }
    };
    this.mr.start(CHUNK_MS);

    // Audio (uncompressed)
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      this.ctx = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
      await this.ctx.audioWorklet.addModule('/worklets/pcm-capture.js');
      const src = this.ctx.createMediaStreamSource(new MediaStream([audioTrack]));
      this.node = new AudioWorkletNode(this.ctx, 'pcm-capture');
      this.audioStartMs = Date.now() - this.epochMs;
      this.node.port.onmessage = (e: MessageEvent<Float32Array>) => {
        if (this.paused) return;
        this.pcm.push(e.data); this.pcmLen += e.data.length;
        const perChunk = (AUDIO_SAMPLE_RATE * CHUNK_MS) / 1000;
        if (this.pcmLen >= perChunk) void this.flushAudio(perChunk);
      };
      src.connect(this.node);
    }
  }

  private async flushAudio(count: number) {
    const all = new Float32Array(this.pcmLen);
    let o = 0; for (const b of this.pcm) { all.set(b, o); o += b.length; }
    const n = Math.min(count, all.length);
    const chunk = all.subarray(0, n);
    const rest = all.slice(n);
    this.pcm = rest.length ? [rest] : []; this.pcmLen = rest.length;
    const meta: ChunkMeta = { track: 'mic_raw', index: this.audioIndex++, startMs: this.audioStartMs + (this.samplesWritten / AUDIO_SAMPLE_RATE) * 1000, durationMs: (n / AUDIO_SAMPLE_RATE) * 1000, ext: 'wav', bytes: n * 3 + 44 };
    this.samplesWritten += n;
    try { await chunkStore.put(this.sessionId, meta, encodeWav(chunk, AUDIO_SAMPLE_RATE)); this.ev.onChunk?.(meta); } catch (err) { this.ev.onError?.(err); }
  }

  pause() { this.paused = true; this.mr?.pause(); }
  resume() { this.paused = false; this.mr?.resume(); }

  async stop() {
    if (this.mr && this.mr.state !== 'inactive') {
      await new Promise<void>((res) => { this.mr!.onstop = () => res(); this.mr!.stop(); });
    }
    if (this.pcmLen) await this.flushAudio(this.pcmLen);
    this.node?.disconnect(); await this.ctx?.close();
    await chunkStore.markStopped(this.sessionId);
  }
}
