'use client';
/**
 * Overlays (AO1–AO4). Someone types a prompt like "Add a hat to Ahsan's head"; we pick who it's for (by name) and a
 * sticker plus where it sits on the face. The person wearing it tracks their own face (MediaPipe face detection,
 * in their browser) and sends the box ~8 times a second, so every screen and the active video draw it in the same place.
 * Stickers are emoji for now; swap `pickSticker` for an image model later without touching the tracking.
 */
export type Anchor = 'top' | 'eyes' | 'mouth' | 'face' | 'beside';
export type Overlay = { emoji: string; anchor: Anchor; label: string };
export type FaceBox = { x: number; y: number; w: number; h: number }; // normalized 0–1, unmirrored

const STICKERS: [RegExp, string, Anchor][] = [
  [/crown|king|queen/, '👑', 'top'], [/cowboy/, '🤠', 'top'], [/grad|cap and gown/, '🎓', 'top'], [/\bcap\b|baseball/, '🧢', 'top'],
  [/party/, '🥳', 'top'], [/helmet/, '⛑️', 'top'], [/hat/, '🎩', 'top'], [/halo|angel/, '😇', 'top'], [/horn|devil/, '😈', 'top'],
  [/sunglass|shades|cool/, '🕶️', 'eyes'], [/glass/, '👓', 'eyes'], [/mustache|moustache/, '🥸', 'mouth'], [/beard/, '🧔', 'mouth'],
  [/kiss|lips/, '💋', 'mouth'], [/mask/, '🎭', 'face'], [/clown/, '🤡', 'face'], [/alien/, '👽', 'face'], [/robot/, '🤖', 'face'],
  [/fire|hot/, '🔥', 'beside'], [/heart|love/, '❤️', 'beside'], [/crying|sad/, '😭', 'beside'], [/money|rich/, '💸', 'beside'],
  [/goat/, '🐐', 'beside'], [/clown/, '🤡', 'face'], [/flower/, '🌸', 'top'], [/star/, '⭐', 'top'], [/trophy|win/, '🏆', 'beside'],
];

export function pickSticker(prompt: string): Overlay {
  const p = prompt.toLowerCase();
  for (const [re, emoji, anchor] of STICKERS) if (re.test(p)) return { emoji, anchor, label: prompt };
  return { emoji: '✨', anchor: 'top', label: prompt };
}

/** Who the prompt is about: a name in the prompt, "me"/"my", or the person who typed it. */
export function pickTarget(prompt: string, people: { identity: string; name: string }[], me: string): string {
  const p = prompt.toLowerCase();
  const hit = people.find((x) => x.name && p.includes(x.name.toLowerCase()));
  return hit?.identity ?? me;
}

/** Where to draw the sticker for a face box inside a w×h tile. Returns center + size in px. */
export function place(o: Overlay, f: FaceBox | undefined, w: number, h: number, mirrored: boolean) {
  const box = f ?? { x: 0.38, y: 0.22, w: 0.24, h: 0.34 };
  const fx = (mirrored ? 1 - box.x - box.w : box.x) * w, fy = box.y * h, fw = box.w * w, fh = box.h * h;
  const cx = fx + fw / 2;
  switch (o.anchor) {
    case 'top': return { x: cx, y: fy - fh * 0.15, size: fw * 1.05 };
    case 'eyes': return { x: cx, y: fy + fh * 0.38, size: fw * 0.85 };
    case 'mouth': return { x: cx, y: fy + fh * 0.78, size: fw * 0.6 };
    case 'face': return { x: cx, y: fy + fh * 0.5, size: fw * 1.2 };
    case 'beside': return { x: fx + fw * 1.25, y: fy + fh * 0.3, size: fw * 0.55 };
  }
}

/** Tracks the face in a local video element; calls back with a normalized box (or null when no face). */
export async function trackFace(video: HTMLVideoElement, onBox: (b: FaceBox | null) => void): Promise<() => void> {
  const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
  const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm');
  const det = await FaceDetector.createFromOptions(files, {
    baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite', delegate: 'GPU' },
    runningMode: 'VIDEO',
  });
  let stop = false; let last = 0; let smooth: FaceBox | null = null;
  const loop = () => {
    if (stop) return;
    const now = performance.now();
    if (now - last > 120 && video.readyState >= 2 && video.videoWidth) {
      last = now;
      const r = det.detectForVideo(video, now).detections[0]?.boundingBox;
      if (r) {
        const b = { x: r.originX / video.videoWidth, y: r.originY / video.videoHeight, w: r.width / video.videoWidth, h: r.height / video.videoHeight };
        smooth = smooth ? { x: smooth.x * 0.5 + b.x * 0.5, y: smooth.y * 0.5 + b.y * 0.5, w: smooth.w * 0.5 + b.w * 0.5, h: smooth.h * 0.5 + b.h * 0.5 } : b;
        onBox(smooth);
      } else onBox(null);
    }
    requestAnimationFrame(loop);
  };
  loop();
  return () => { stop = true; det.close(); };
}
