/** Encode mono Float32 PCM as a 24-bit WAV (R2: 48 kHz WAV). */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 3;
  const dataLen = samples.length * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * bytesPerSample, true);
  v.setUint16(32, bytesPerSample, true); v.setUint16(34, 24, true);
  str(36, 'data'); v.setUint32(40, dataLen, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const n = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
    v.setUint8(o, n & 0xff); v.setUint8(o + 1, (n >> 8) & 0xff); v.setUint8(o + 2, (n >> 16) & 0xff);
    o += 3;
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Join WAV chunks (all same format) into one WAV file. */
export async function joinWavChunks(chunks: Blob[], sampleRate: number): Promise<Blob> {
  const parts = await Promise.all(chunks.map(async (c) => new Uint8Array(await c.arrayBuffer()).subarray(44)));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(44 + total);
  const header = new Uint8Array(await encodeWav(new Float32Array(0), sampleRate).arrayBuffer());
  out.set(header, 0);
  const v = new DataView(out.buffer);
  v.setUint32(4, 36 + total, true); v.setUint32(40, total, true);
  let o = 44; for (const p of parts) { out.set(p, o); o += p.length; }
  return new Blob([out], { type: 'audio/wav' });
}
