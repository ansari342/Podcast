import { CHUNK_MS } from '@/lib/config';
import { chunkStore, type ChunkMeta } from './chunkStore';
import { place, type FaceBox, type Overlay } from '@/lib/overlay';

/**
 * The "active" video (R5): one 1080p file of what the episode should look like — the three faces side by side, or
 * the game board / shared screen with faces in a strip — plus everyone's audio mixed. Drawn on a canvas in the
 * browser of whoever pressed Record, chunked like every other track so it survives a crash and uploads as it goes.
 */
export type Scene = {
  tiles: { el: HTMLVideoElement | null; mirrored: boolean; hidden?: boolean; overlay?: Overlay; face?: FaceBox }[];
  screen?: HTMLVideoElement | null;
  board?: { title: string; big: string; lines: string[] } | null;
};

export class ActiveRecorder {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private mr?: MediaRecorder;
  private audio = new AudioContext({ sampleRate: 48000 });
  private dest = this.audio.createMediaStreamDestination();
  private sources = new Map<string, MediaStreamAudioSourceNode>();
  private raf = 0; private index = 0; private startMs = 0; private timer = 0;

  constructor(private sessionId: string, private epochMs: number, private getScene: () => Scene, private onChunk: (m: ChunkMeta) => void) {
    this.canvas.width = 1920; this.canvas.height = 1080;
  }

  /** Keep the mix in sync with who's in the room (key = track id). */
  setAudio(tracks: MediaStreamTrack[]) {
    const ids = new Set(tracks.map((t) => t.id));
    for (const [id, n] of this.sources) if (!ids.has(id)) { n.disconnect(); this.sources.delete(id); }
    for (const t of tracks) if (!this.sources.has(t.id)) { const n = this.audio.createMediaStreamSource(new MediaStream([t])); n.connect(this.dest); this.sources.set(t.id, n); }
  }

  start() {
    const draw = () => { this.draw(); };
    // setInterval keeps drawing when the tab is in the background (rAF would pause).
    this.timer = window.setInterval(draw, 1000 / 30);
    const stream = new MediaStream([...this.canvas.captureStream(30).getVideoTracks(), ...this.dest.stream.getAudioTracks()]);
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
    this.startMs = Date.now() - this.epochMs;
    this.mr = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 6_000_000 });
    this.mr.ondataavailable = async (e) => {
      if (!e.data.size) return;
      const meta: ChunkMeta = { track: 'active', index: this.index, startMs: this.startMs + this.index * CHUNK_MS, durationMs: CHUNK_MS, ext: mime.includes('mp4') ? 'mp4' : 'webm', bytes: e.data.size };
      this.index++;
      await chunkStore.put(this.sessionId, meta, e.data); this.onChunk(meta);
    };
    this.mr.start(CHUNK_MS);
  }
  pause() { this.mr?.pause(); }
  resume() { this.mr?.resume(); }
  async stop() {
    clearInterval(this.timer); cancelAnimationFrame(this.raf);
    if (this.mr && this.mr.state !== 'inactive') await new Promise<void>((r) => { this.mr!.onstop = () => r(); this.mr!.stop(); });
    await this.audio.close();
  }

  private cover(el: HTMLVideoElement, x: number, y: number, w: number, h: number, mirrored: boolean) {
    const c = this.ctx; const vw = el.videoWidth, vh = el.videoHeight; if (!vw || !vh) return;
    const s = Math.max(w / vw, h / vh); const sw = w / s, sh = h / s;
    c.save(); c.beginPath(); c.roundRect(x, y, w, h, 18); c.clip();
    if (mirrored) { c.translate(x + w, y); c.scale(-1, 1); c.drawImage(el, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, w, h); }
    else c.drawImage(el, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h);
    c.restore();
  }

  private draw() {
    const c = this.ctx; const W = 1920, H = 1080; const sc = this.getScene();
    c.fillStyle = '#0E0F12'; c.fillRect(0, 0, W, H);
    const tiles = sc.tiles.slice(0, 3);
    const drawTile = (t: Scene['tiles'][number], x: number, y: number, w: number, h: number) => {
      c.fillStyle = '#2B2F3A'; c.beginPath(); c.roundRect(x, y, w, h, 18); c.fill();
      if (t.el && !t.hidden) this.cover(t.el, x, y, w, h, t.mirrored);
      if (t.overlay && t.el?.videoWidth && !t.hidden) {
        // Map the face box from video pixels through the same cover-crop used to draw the tile.
        const vw = t.el.videoWidth, vh = t.el.videoHeight, s = Math.max(w / vw, h / vh);
        const pw = vw * s, ph = vh * s; const p = place(t.overlay, t.face, pw, ph, t.mirrored);
        c.save(); c.beginPath(); c.roundRect(x, y, w, h, 18); c.clip();
        c.font = `${p.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(t.overlay.emoji, x + (w - pw) / 2 + p.x, y + (h - ph) / 2 + p.y); c.restore();
      }
    };
    const main = sc.screen?.videoWidth ? 'screen' : sc.board ? 'board' : null;
    if (!main) {
      const n = Math.max(1, tiles.length); const gap = 16; const w = (W - gap * (n + 1)) / n; const h = Math.min(H - 2 * gap, (w * 9) / 8);
      tiles.forEach((t, i) => drawTile(t, gap + i * (w + gap), (H - h) / 2, w, h));
      return;
    }
    const stripW = 360; const gap = 16; const mw = W - stripW - gap * 3;
    if (main === 'screen') { c.fillStyle = '#000'; c.fillRect(gap, gap, mw, H - 2 * gap); const el = sc.screen!; const s = Math.min(mw / el.videoWidth, (H - 2 * gap) / el.videoHeight); const w = el.videoWidth * s, h = el.videoHeight * s; c.drawImage(el, gap + (mw - w) / 2, gap + (H - 2 * gap - h) / 2, w, h); }
    else {
      const b = sc.board!; c.fillStyle = '#17181C'; c.beginPath(); c.roundRect(gap, gap, mw, H - 2 * gap, 24); c.fill();
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#FF8A5B'; c.font = '700 30px "Space Grotesk", Inter, sans-serif';
      c.fillText(b.title.toUpperCase(), gap + mw / 2, 140);
      c.fillStyle = '#F2F2F3'; c.font = '600 64px "Space Grotesk", Inter, sans-serif';
      wrap(c, b.big, gap + mw / 2, 330, mw - 160, 78);
      c.font = '400 38px Inter, sans-serif'; c.fillStyle = '#C9CBD2';
      b.lines.slice(0, 8).forEach((l, i) => c.fillText(l.length > 70 ? l.slice(0, 68) + '…' : l, gap + mw / 2, 560 + i * 54));
    }
    const th = (H - gap * (tiles.length + 1)) / Math.max(3, tiles.length);
    tiles.forEach((t, i) => drawTile(t, W - stripW - gap, gap + i * (th + gap), stripW, th));
  }
}

function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(' '); let line = ''; const lines: string[] = [];
  for (const w of words) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((l, i) => c.fillText(l, x, y + i * lh));
}
