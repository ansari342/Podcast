import { CHUNK_MS } from '@/lib/config';
import { chunkStore, type ChunkMeta } from './chunkStore';
import { place, type FaceBox, type Overlay } from '@/lib/overlay';
import type { FmTable } from '@/components/GameBoard';

/**
 * The "active" video (R5): one 1080p file of what the episode should look like — the three faces side by side, or
 * the game board / shared screen with faces in a strip — plus everyone's audio mixed. Drawn on a canvas in the
 * browser of whoever pressed Record, chunked like every other track so it survives a crash and uploads as it goes.
 */
export type Scene = {
  tiles: { el: HTMLVideoElement | null; mirrored: boolean; hidden?: boolean; overlay?: Overlay; face?: FaceBox }[];
  screen?: HTMLVideoElement | null;
  board?: { title: string; big: string; lines: string[]; table?: FmTable; image?: string; score?: string } | null;
  /** A shared set is on: tiles sit edge to edge so the room reads as one (S12). */
  seamless?: boolean;
  /** Lower-third caption, e.g. Tonight's debate (C3). */
  caption?: string | null;
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

  /** Mix a sound effect into the episode audio (SB2). */
  mixBuffer(buf: AudioBuffer) {
    const s = this.audio.createBufferSource(); const g = this.audio.createGain(); g.gain.value = 0.8;
    s.buffer = buf; s.connect(g).connect(this.dest); s.start();
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
    this.mr = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 8_000_000 });
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

  private cover(el: HTMLVideoElement, x: number, y: number, w: number, h: number, mirrored: boolean, radius = 18) {
    const c = this.ctx; const vw = el.videoWidth, vh = el.videoHeight; if (!vw || !vh) return;
    const s = Math.max(w / vw, h / vh); const sw = w / s, sh = h / s;
    c.save(); c.beginPath(); c.roundRect(x, y, w, h, radius); c.clip();
    if (mirrored) { c.translate(x + w, y); c.scale(-1, 1); c.drawImage(el, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, w, h); }
    else c.drawImage(el, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h);
    c.restore();
  }

  private draw() {
    this.drawScene();
    const cap = this.getScene().caption;
    if (cap) {
      const c = this.ctx; c.font = '600 40px "Space Grotesk", Inter, sans-serif'; const w = Math.min(1760, c.measureText(cap).width + 260);
      c.fillStyle = 'rgba(14,15,18,.86)'; c.beginPath(); c.roundRect((1920 - w) / 2, 940, w, 96, 20); c.fill();
      c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#FF8A5B'; c.font = '700 22px Inter, sans-serif'; c.fillText("TONIGHT'S DEBATE", 960, 968);
      c.fillStyle = '#F2F2F3'; c.font = '600 34px "Space Grotesk", Inter, sans-serif'; c.fillText(cap.length > 80 ? cap.slice(0, 78) + '…' : cap, 960, 1006);
    }
  }

  private drawScene() {
    const c = this.ctx; const W = 1920, H = 1080; const sc = this.getScene();
    c.fillStyle = '#0E0F12'; c.fillRect(0, 0, W, H);
    const tiles = sc.tiles.slice(0, 3);
    const drawTile = (t: Scene['tiles'][number], x: number, y: number, w: number, h: number, radius = 18) => {
      c.fillStyle = '#2B2F3A'; c.beginPath(); c.roundRect(x, y, w, h, radius); c.fill();
      if (t.el && !t.hidden) this.cover(t.el, x, y, w, h, t.mirrored, radius);
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
    if (!main && sc.seamless) {
      // One 2:1 room scaled to fill the frame; only the outer edges are cropped, so seams between seats still line up.
      const n = Math.max(1, tiles.length); const sw = H * 2, tw = sw / n, x0 = (W - sw) / 2;
      tiles.forEach((t, i) => drawTile(t, x0 + i * tw, 0, tw, H, 0));
      return;
    }
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
      if (b.table) drawFastMoney(c, b.table, gap + 60, 190, mw - 120, H - 2 * gap - 260);
      else if (b.image && imgReady(b.image)) {
        const im = imgCache.get(b.image)!; const bw = mw - 200, bh = 470; const sc = Math.min(bw / im.naturalWidth, bh / im.naturalHeight);
        const iw = im.naturalWidth * sc, ih = im.naturalHeight * sc, ix = gap + (mw - iw) / 2, iy = 190 + (bh - ih) / 2;
        c.fillStyle = '#fff'; c.beginPath(); c.roundRect(ix - 16, iy - 16, iw + 32, ih + 32, 20); c.fill(); c.drawImage(im, ix, iy, iw, ih);
        c.fillStyle = '#F2F2F3'; c.font = '600 56px "Space Grotesk", Inter, sans-serif'; c.textAlign = 'center';
        wrap(c, b.big, gap + mw / 2, 760, mw - 160, 66);
        c.font = '700 64px "Space Grotesk", Inter, sans-serif'; c.fillStyle = '#7FD6A4';
        b.lines.slice(0, 1).forEach((l) => c.fillText(l, gap + mw / 2, 900));
      } else {
        c.fillStyle = '#F2F2F3'; c.font = '600 64px "Space Grotesk", Inter, sans-serif';
        wrap(c, b.big, gap + mw / 2, 330, mw - 160, 78);
        c.font = '400 38px Inter, sans-serif'; c.fillStyle = '#C9CBD2';
        b.lines.slice(0, 8).forEach((l, i) => c.fillText(l.length > 70 ? l.slice(0, 68) + '…' : l, gap + mw / 2, 560 + i * 54));
      }
      if (b.score) { c.textAlign = 'center'; c.fillStyle = '#FF8A5B'; c.font = '600 30px Inter, sans-serif'; c.fillText(`SCORE  ${b.score}`, gap + mw / 2, H - gap - 40); }
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

/** Fast Money board in the style of the show: blue panel, black answer and points boxes, totals underneath. */
function drawFastMoney(c: CanvasRenderingContext2D, t: FmTable, x: number, y: number, w: number, h: number) {
  const g = c.createRadialGradient(x + w / 2, y + h / 2, 40, x + w / 2, y + h / 2, w * 0.7);
  g.addColorStop(0, '#2E62D0'); g.addColorStop(0.55, '#1B3F98'); g.addColorStop(1, '#102A6E');
  c.fillStyle = g; c.fillRect(x, y, w, h); c.strokeStyle = '#0B1D4D'; c.lineWidth = 6; c.strokeRect(x, y, w, h);
  const pad = 24, colGap = 28, ptsW = 110, n = Math.max(1, t.cols.length);
  const groupW = (w - 2 * pad - colGap * (n - 1)) / n, ansW = groupW - ptsW - 10;
  const headH = 40, totH = 74, rowH = (h - 2 * pad - headH - totH) / Math.max(1, t.rows.length), boxH = rowH * 0.62;
  c.textBaseline = 'middle';
  const fit = (text: string, maxW: number, size: number) => { let s = size; do { c.font = `800 ${s}px Inter, sans-serif`; s -= 2; } while (c.measureText(text).width > maxW && s > 16); };
  t.cols.forEach((name, j) => { const gx = x + pad + j * (groupW + colGap); c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = '800 28px Inter, sans-serif'; c.fillText(name.toUpperCase(), gx, y + pad + headH / 2); });
  t.rows.forEach((r, i) => {
    const ry = y + pad + headH + i * rowH;
    if (r.q) { c.textAlign = 'left'; c.fillStyle = '#C7D6FF'; c.font = '500 22px Inter, sans-serif'; const q = `${i + 1}. ${r.q}`; c.fillText(q.length > 90 ? q.slice(0, 88) + '…' : q, x + pad, ry + (rowH - boxH) / 2 - 4); }
    const by = ry + rowH - boxH - 4;
    r.cells.forEach((cell, j) => {
      const gx = x + pad + j * (groupW + colGap);
      c.fillStyle = '#000'; c.fillRect(gx, by, ansW, boxH); c.fillRect(gx + ansW + 10, by, ptsW, boxH);
      c.fillStyle = '#fff';
      if (cell.a) { c.textAlign = 'left'; fit(cell.a, ansW - 28, 44); c.fillText(cell.a, gx + 14, by + boxH / 2 + 2); }
      if (cell.p !== null) { c.textAlign = 'center'; c.font = '800 44px Inter, sans-serif'; c.fillText(String(cell.p), gx + ansW + 10 + ptsW / 2, by + boxH / 2 + 2); }
    });
  });
  const ty = y + h - pad - totH + 12;
  t.totals.forEach((tot, j) => {
    const gx = x + pad + j * (groupW + colGap);
    c.textAlign = 'right'; c.fillStyle = '#fff'; c.font = '800 30px Inter, sans-serif'; c.fillText('TOTAL', gx + ansW - 6, ty + (totH - 16) / 2);
    c.fillStyle = '#0B1D4D'; c.fillRect(gx + ansW + 10, ty, ptsW, totH - 16); c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(gx + ansW + 10, ty, ptsW, totH - 16);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '800 40px Inter, sans-serif'; c.fillText(String(tot), gx + ansW + 10 + ptsW / 2, ty + (totH - 16) / 2 + 2);
  });
}

/** Same-origin images for the board (Guess the Price), loaded once and drawn when ready. */
const imgCache = new Map<string, HTMLImageElement>();
function imgReady(src: string) {
  let im = imgCache.get(src);
  if (!im) { im = new Image(); im.src = src; imgCache.set(src, im); }
  return im.complete && im.naturalWidth > 0;
}
