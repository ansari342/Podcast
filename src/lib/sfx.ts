'use client';
/**
 * Sound effects (SB1, SB2). Eight built-in sounds (public/sfx, synthesised for this app — no licensing) plus one
 * slot for a sound anyone uploads. Everyone in the room hears a sound when anyone plays it, and the active video's
 * recorder mixes it in via `onSfx` taps.
 */
export const SOUNDS = [
  { id: 'buzzer', name: 'Buzzer' }, { id: 'ding', name: 'Ding' }, { id: 'drumroll', name: 'Drumroll' },
  { id: 'applause', name: 'Applause' }, { id: 'rimshot', name: 'Rimshot' }, { id: 'airhorn', name: 'Airhorn' },
  { id: 'crickets', name: 'Crickets' }, { id: 'gasp', name: 'Gasp' },
] as const;
export type CustomSound = { name: string; key: string };

let ctx: AudioContext | null = null;
const cache = new Map<string, Promise<AudioBuffer>>();
const taps = new Set<(b: AudioBuffer) => void>();
let volume = 0.8;

export const sfxContext = () => (ctx ??= new AudioContext());
export const setSfxVolume = (v: number) => { volume = v; };
/** Called with every sound that plays (the active recorder mixes it into the episode). */
export const onSfx = (f: (b: AudioBuffer) => void) => { taps.add(f); return () => { taps.delete(f); }; };

const urlFor = (i: number, custom?: CustomSound | null) =>
  i < SOUNDS.length ? `/sfx/${SOUNDS[i].id}.mp3` : custom ? `/api/sfx?key=${encodeURIComponent(custom.key)}` : null;

function load(url: string) {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error('sound missing'); return r.arrayBuffer(); }).then((a) => sfxContext().decodeAudioData(a)));
  const p = cache.get(url)!; p.catch(() => cache.delete(url)); return p;
}

/** Warm the cache so the first press plays instantly. */
export function preloadSounds(custom?: CustomSound | null) { SOUNDS.forEach((_, i) => void load(urlFor(i)!).catch(() => {})); const u = urlFor(8, custom); if (u) void load(u).catch(() => {}); }

export async function playSound(i: number, custom?: CustomSound | null) {
  const url = urlFor(i, custom); if (!url) return;
  const c = sfxContext(); if (c.state === 'suspended') await c.resume().catch(() => {});
  const buf = await load(url);
  const src = c.createBufferSource(); const g = c.createGain(); g.gain.value = volume;
  src.buffer = buf; src.connect(g).connect(c.destination); src.start();
  taps.forEach((f) => f(buf));
}
