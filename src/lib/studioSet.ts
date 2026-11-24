import type { Track, TrackProcessor, VideoProcessorOptions } from 'livekit-client';

/**
 * Shared set (S12), take two. Every seat shows its own slice of one wide panorama (public/sets/<set>-bg.jpg), with a
 * desk (<set>-fg.png) drawn in front of the person, so side-by-side tiles read as one continuous room.
 *
 * Why not @livekit/track-processors: it composites with a hard on/off mask from the small selfie model, which leaves
 * holes and ragged edges. Here we use the multiclass selfie model's confidence mask, smooth it over time (no flicker),
 * feather the edge, and auto-frame each person — head at the same height and size in every seat — so nobody floats at
 * the bottom of their tile.
 *
 * The output is already the tile's shape (2:1 stage ÷ seats), unmirrored, so the studio shows it edge to edge.
 */
export type SetLayout = { set: string; seat: number; seats: number };

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm';
const MODELS = [
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
];
/** Panorama geometry, matching scripts/make-sets.py. */
const PANO = { w: 2880, h: 1440 };
const HEAD_Y = 0.2; // head top sits 20% down the tile, leaving room for the sign
const MAX_ZOOM = 1.9; // never blow a far-away person up more than this over a plain cover fit
const DESK = 0.8; // desk top, as a fraction of tile height (matches the panorama)

export const tileAspect = (seats: number) => 2 / Math.max(1, seats);
export const SET_IDS = ['blush', 'gallery', 'rose', 'studio', 'brick', 'city'] as const;
export const isRoomSet = (s: string) => (SET_IDS as readonly string[]).includes(s);

type Img = HTMLImageElement;
const loadImg = (src: string) => new Promise<Img>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

export class StudioSetProcessor implements TrackProcessor<Track.Kind.Video, VideoProcessorOptions> {
  name = 'studio-set';
  processedTrack?: MediaStreamTrack;

  private layout: SetLayout;
  private bg?: Img; private fg?: Img; private loadedSet = '';
  private out = document.createElement('canvas');
  private octx = this.out.getContext('2d')!;
  private person = document.createElement('canvas');
  private pctx = this.person.getContext('2d')!;
  private small = document.createElement('canvas');
  private sctx = this.small.getContext('2d', { willReadFrequently: false })!;
  private maskC = document.createElement('canvas');
  private mctx = this.maskC.getContext('2d')!;
  private maskData?: ImageData;
  private prev?: Float32Array;
  private seg?: import('@mediapipe/tasks-vision').ImageSegmenter;
  private bgIndex = 0; private multi = false;
  private running = false; private stopFns: (() => void)[] = [];
  private frame = { s: 0, x: 0, y: 0, ready: false };
  private target = { headTop: 0.2, cx: 0.5, headW: 0.25, touchesTop: false, touchesSides: false, seen: false };
  private n = 0; private lastTs = 0;
  private filterOk = 'filter' in CanvasRenderingContext2D.prototype;

  constructor(layout: SetLayout) { this.layout = layout; }

  static supported() {
    return typeof document !== 'undefined' && !!document.createElement('canvas').getContext('webgl2')
      && ('MediaStreamTrackProcessor' in window || 'requestVideoFrameCallback' in HTMLVideoElement.prototype);
  }

  /** Change set or seat without restarting the camera. */
  async update(layout: SetLayout) {
    const reframe = layout.seats !== this.layout.seats;
    this.layout = layout; await this.loadSet();
    if (reframe) { this.frame.ready = false; this.sizeOutput(); }
  }

  async init({ track }: VideoProcessorOptions) {
    this.running = true;
    await Promise.all([this.loadSet(), this.loadModel()]);
    this.sizeOutput();
    this.start(track);
  }
  async restart(opts: VideoProcessorOptions) { this.stop(); await this.init(opts); }
  async destroy() { this.stop(); this.seg?.close(); this.seg = undefined; this.processedTrack?.stop(); }

  private stop() { this.running = false; this.stopFns.splice(0).forEach((f) => f()); }

  private async loadSet() {
    if (this.loadedSet === this.layout.set) return;
    const set = this.layout.set; this.loadedSet = set;
    const [bg, fg] = await Promise.all([loadImg(`/sets/${set}-bg.jpg`), loadImg(`/sets/${set}-fg.png`)]);
    if (this.loadedSet === set) { this.bg = bg; this.fg = fg; }
  }

  private async loadModel() {
    if (this.seg) return;
    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks(WASM);
    let lastErr: unknown;
    for (const model of MODELS) {
      for (const delegate of ['GPU', 'CPU'] as const) {
        try {
          this.seg = await ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: model, delegate }, runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false });
          const labels = this.seg.getLabels().map((l) => l.toLowerCase());
          this.bgIndex = Math.max(0, labels.indexOf('background')); this.multi = labels.length > 1;
          return;
        } catch (e) { lastErr = e; }
      }
    }
    throw lastErr;
  }

  private sizeOutput() {
    const seats = Math.max(1, this.layout.seats);
    const h = seats === 1 ? 720 : 960; const w = Math.round(h * tileAspect(seats));
    for (const c of [this.out, this.person]) { c.width = w; c.height = h; }
  }

  private start(track: MediaStreamTrack) {
    const fps = track.getSettings().frameRate || 30;
    // Output: a generator track where available (keeps running in a background tab), otherwise canvas capture.
    let write: (ts: number) => void;
    const G = (window as unknown as { MediaStreamTrackGenerator?: new (o: { kind: 'video' }) => MediaStreamTrack & { writable: WritableStream<VideoFrame> } }).MediaStreamTrackGenerator;
    if (G) {
      const gen = new G({ kind: 'video' }); const writer = gen.writable.getWriter();
      write = (ts) => { const vf = new VideoFrame(this.out, { timestamp: ts }); writer.write(vf).catch(() => vf.close()); };
      this.processedTrack = gen;
      this.stopFns.push(() => { void writer.close().catch(() => {}); });
    } else {
      const t = this.out.captureStream(fps).getVideoTracks()[0];
      write = () => {}; this.processedTrack = t;
    }
    // Input: read frames straight off the camera track where possible; otherwise from a hidden <video>.
    const P = (window as unknown as { MediaStreamTrackProcessor?: new (o: { track: MediaStreamTrack }) => { readable: ReadableStream<VideoFrame> } }).MediaStreamTrackProcessor;
    if (P) {
      const reader = new P({ track }).readable.getReader();
      const pump = async () => {
        while (this.running) {
          const { value: f, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
          if (done || !f) break;
          try { this.render(f, f.displayWidth, f.displayHeight); write(f.timestamp); } finally { f.close(); }
        }
      };
      void pump(); this.stopFns.push(() => { void reader.cancel().catch(() => {}); });
    } else {
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = new MediaStream([track]); void v.play();
      const tick = () => { if (!this.running) return; if (v.videoWidth) this.render(v, v.videoWidth, v.videoHeight); v.requestVideoFrameCallback(tick); };
      v.requestVideoFrameCallback(tick);
      this.stopFns.push(() => { v.srcObject = null; });
    }
  }

  private render(src: CanvasImageSource, vw: number, vh: number) {
    const W = this.out.width, H = this.out.height, o = this.octx, seats = Math.max(1, this.layout.seats);
    // 1) segment a small copy of the frame
    const sw = 256, sh = Math.max(1, Math.round((256 * vh) / vw));
    if (this.small.width !== sw || this.small.height !== sh) { this.small.width = sw; this.small.height = sh; this.maskC.width = sw; this.maskC.height = sh; this.maskData = this.mctx.createImageData(sw, sh); this.prev = undefined; }
    this.sctx.drawImage(src, 0, 0, sw, sh);
    let ts = performance.now(); if (ts <= this.lastTs) ts = this.lastTs + 1; this.lastTs = ts;
    if (this.seg) {
      try {
        this.seg.segmentForVideo(this.small, ts, (r) => {
          const masks = r.confidenceMasks; if (!masks?.length) return;
          const raw = (this.multi ? masks[this.bgIndex] : masks[0]).getAsFloat32Array();
          this.updateMask(raw, sw, sh, this.multi);
          masks.forEach((m) => m.close());
        });
      } catch { /* a dropped frame keeps the last mask */ }
    }
    // 2) framing: every head the same size and height. Close-ups shrink, far-away people grow; the camera frame's
    //    bottom edge always hides behind the desk, and its side/top edges stay off-screen if the person touches them.
    const cover = Math.max(W / vw, H / vh);
    const t = this.target;
    let s = cover;
    if (t.seen) {
      const headPx = Math.min(0.3 * W, 0.2 * H);
      let lo = ((DESK - HEAD_Y) * H) / ((1 - t.headTop) * vh); // camera bottom reaches the desk
      if (t.touchesTop) lo = Math.max(lo, (DESK * H) / vh);
      if (t.touchesSides) lo = Math.max(lo, W / vw);
      s = Math.min(cover * MAX_ZOOM, Math.max(lo, headPx / Math.max(0.05, t.headW * vw)));
    }
    let x = W / 2 - t.cx * vw * s, y = HEAD_Y * H - t.headTop * vh * s;
    if (!t.seen || t.touchesSides) x = Math.min(0, Math.max(W - vw * s, x));
    if (t.touchesTop || !t.seen) y = Math.min(0, y);
    y = Math.max(DESK * H - vh * s, y);
    const f = this.frame, k = f.ready ? 0.06 : 1;
    f.s += (s - f.s) * k; f.x += (x - f.x) * k; f.y += (y - f.y) * k; f.ready = true;
    const dw = vw * f.s, dh = vh * f.s;

    // 3) compose: wall slice, person cut out with a feathered edge, desk in front
    const sliceW = PANO.w / seats, sx = sliceW * Math.min(this.layout.seat, seats - 1);
    if (this.bg) o.drawImage(this.bg, sx, 0, sliceW, PANO.h, 0, 0, W, H); else { o.fillStyle = '#1b1712'; o.fillRect(0, 0, W, H); }
    const p = this.pctx;
    p.globalCompositeOperation = 'source-over'; p.clearRect(0, 0, W, H);
    p.drawImage(src, f.x, f.y, dw, dh);
    p.globalCompositeOperation = 'destination-in';
    if (this.filterOk) p.filter = `blur(${Math.max(1, dw / 900).toFixed(1)}px)`;
    p.drawImage(this.maskC, f.x, f.y, dw, dh);
    if (this.filterOk) p.filter = 'none';
    p.globalCompositeOperation = 'source-over';
    // soft shadow so people sit in the room instead of on top of it
    if (this.filterOk) { o.save(); o.filter = 'blur(18px) brightness(0)'; o.globalAlpha = 0.35; o.drawImage(this.person, 6, 10); o.restore(); }
    o.drawImage(this.person, 0, 0);
    if (this.fg) o.drawImage(this.fg, sx, 0, sliceW, PANO.h, 0, 0, W, H);
  }

  /** Temporal smoothing + a soft threshold, then framing targets from the mask. */
  private updateMask(raw: Float32Array, w: number, h: number, inverted: boolean) {
    const n = w * h; const prev = this.prev ?? new Float32Array(n); const first = !this.prev; this.prev = prev;
    const d = this.maskData!.data;
    let top = -1, sumX = 0, cnt = 0, topRow = 0;
    for (let i = 0; i < n; i++) {
      const c = inverted ? 1 - raw[i] : raw[i];
      const diff = Math.abs(c - prev[i]);
      const m = first ? c : prev[i] + (c - prev[i]) * (diff > 0.45 ? 0.85 : 0.5); // fast when moving, calm when still
      prev[i] = m;
      const a = m <= 0.3 ? 0 : m >= 0.7 ? 1 : ((m - 0.3) / 0.4) ** 2 * (3 - 2 * ((m - 0.3) / 0.4));
      const j = i * 4; d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = a * 255;
    }
    this.mctx.putImageData(this.maskData!, 0, 0);
    if (++this.n % 3) return;
    // head top: first row with a real run of person pixels; centre and head width a little below it
    for (let y = 0; y < h && top < 0; y++) { let r = 0; for (let x = 0; x < w; x++) if (prev[y * w + x] > 0.6) r++; if (r >= 3) top = y; }
    if (top < 0) return;
    for (let y = 0; y < 2; y++) { let r = 0; for (let x = 0; x < w; x++) if (prev[y * w + x] > 0.6) r++; topRow += r; }
    const band = Math.min(h, top + Math.round(h * 0.35));
    for (let y = top; y < band; y++) for (let x = 0; x < w; x++) if (prev[y * w + x] > 0.6) { sumX += x; cnt++; }
    if (!cnt) return;
    // head width: widest run in the rows 8–14% of the frame below the head top (forehead to cheeks)
    let headW = 0;
    for (let y = Math.min(h - 1, top + Math.round(h * 0.08)); y < Math.min(h, top + Math.round(h * 0.14)); y++) {
      let l = -1, r = -1; for (let x = 0; x < w; x++) if (prev[y * w + x] > 0.6) { if (l < 0) l = x; r = x; }
      if (l >= 0) headW = Math.max(headW, (r - l + 1) / w);
    }
    let side = 0; for (let y = band; y < h; y++) side += (prev[y * w] > 0.6 ? 1 : 0) + (prev[y * w + w - 1] > 0.6 ? 1 : 0);
    const prevT = this.target;
    this.target = { headTop: top / h, cx: sumX / cnt / w, headW: prevT.seen ? prevT.headW * 0.7 + headW * 0.3 : headW, touchesTop: topRow > 4, touchesSides: side > 6, seen: true };
  }
}
