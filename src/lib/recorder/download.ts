'use client';
/**
 * Joins a track's chunks into one file without holding it all in memory (L2). In Chrome/Edge it asks where to save
 * and streams each chunk straight to disk, so an hour of 1080p (several GB) downloads safely. Elsewhere it falls back
 * to an in-memory file (fine for shorter episodes).
 * WAV chunks each carry a 44-byte header: we write one header for the whole file, then each chunk's samples.
 */
type Picker = (o: { suggestedName: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>;

function wavHeader(dataBytes: number, rate = 48000, bits = 24, ch = 1) {
  const h = new DataView(new ArrayBuffer(44)); const w = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); h.setUint32(4, 36 + dataBytes, true); w(8, 'WAVE'); w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true);
  h.setUint16(22, ch, true); h.setUint32(24, rate, true); h.setUint32(28, (rate * ch * bits) / 8, true); h.setUint16(32, (ch * bits) / 8, true); h.setUint16(34, bits, true);
  w(36, 'data'); h.setUint32(40, dataBytes, true); return new Uint8Array(h.buffer);
}

export async function downloadJoined(urls: string[], sizes: number[], name: string, ext: string, onProgress: (pct: number) => void) {
  const isWav = ext === 'wav';
  const mime = isWav ? 'audio/wav' : ext === 'mp4' ? 'video/mp4' : 'video/webm';
  // WAV needs the total length up front; the server lists each chunk's size.
  const wavData = isWav ? sizes.reduce((a, n) => a + Math.max(0, n - 44), 0) : 0;
  const picker = (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker;
  if (picker) {
    let handle: FileSystemFileHandle;
    try { handle = await picker({ suggestedName: `${name}.${ext}`, types: [{ description: ext.toUpperCase(), accept: { [mime]: [`.${ext}`] } }] }); }
    catch (e) { if ((e as Error).name === 'AbortError') return false; throw e; }
    const out = await handle.createWritable();
    try {
      if (isWav) await out.write(wavHeader(wavData));
      for (let i = 0; i < urls.length; i++) {
        onProgress(Math.round((i / urls.length) * 100));
        const buf = new Uint8Array(await (await fetchRetry(urls[i])).arrayBuffer());
        await out.write(isWav ? buf.subarray(44) : buf);
      }
      await out.close(); return true;
    } catch (e) { await out.abort().catch(() => {}); throw e; }
  }
  const parts: BlobPart[] = isWav ? [wavHeader(wavData)] : [];
  for (let i = 0; i < urls.length; i++) {
    onProgress(Math.round((i / urls.length) * 100));
    const buf = await (await fetchRetry(urls[i])).arrayBuffer();
    parts.push(isWav ? buf.slice(44) : buf);
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(parts, { type: mime })); a.download = `${name}.${ext}`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000); return true;
}

async function fetchRetry(url: string, tries = 3): Promise<Response> {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url); if (r.ok) return r; if (i >= tries - 1) throw new Error(`HTTP ${r.status}`); }
    catch (e) { if (i >= tries - 1) throw e; }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
}
