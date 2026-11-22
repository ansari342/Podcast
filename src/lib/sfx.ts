/**
 * Sound effects (SB1, SB2). Placeholder tones synthesised with WebAudio so the board works with no assets.
 * TODO: replace with licensed audio files and route them into the call + a dedicated `sfx` track.
 */
export const SOUNDS = ['Buzzer', 'Ding', 'Drumroll', 'Applause', 'Rimshot', 'Airhorn', 'Crickets', 'Gasp', 'Your upload'] as const;
let ctx: AudioContext | null = null;
export function playSound(i: number) {
  ctx ??= new AudioContext();
  const o = ctx.createOscillator(); const g = ctx.createGain();
  const freqs = [110, 880, 220, 440, 330, 520, 1200, 660, 300];
  o.type = i === 0 ? 'sawtooth' : 'sine'; o.frequency.value = freqs[i] ?? 440;
  g.gain.setValueAtTime(0.2, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
  o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.6);
}
