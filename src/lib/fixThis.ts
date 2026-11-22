'use client';
/**
 * "Fix this" (T3–T6): pick a symptom; the site checks the likely causes, fixes what it can and says what it did.
 * Fixes never stop a recording in progress (T5): while recording, device restarts are skipped and suggested instead.
 */
export type FixStep = { label: string; ok: boolean; note?: string };
export type Symptom = 'general' | 'cant-be-heard' | 'cant-hear' | 'echo' | 'camera' | 'choppy';
export const SYMPTOMS: { id: Symptom; label: string }[] = [
  { id: 'general', label: 'Check everything' }, { id: 'cant-be-heard', label: 'They can’t hear me' }, { id: 'cant-hear', label: 'I can’t hear them' },
  { id: 'echo', label: 'Echo' }, { id: 'camera', label: 'Camera black or frozen' }, { id: 'choppy', label: 'Choppy or laggy' },
];

export async function measureMic(stream: MediaStream | null, ms = 1500): Promise<number> {
  const t = stream?.getAudioTracks()[0]; if (!t) return 0;
  const ctx = new AudioContext(); const a = ctx.createAnalyser(); a.fftSize = 512;
  ctx.createMediaStreamSource(new MediaStream([t])).connect(a);
  const buf = new Float32Array(a.fftSize); let peak = 0; const end = Date.now() + ms;
  while (Date.now() < end) { a.getFloatTimeDomainData(buf); for (const v of buf) peak = Math.max(peak, Math.abs(v)); await new Promise((r) => setTimeout(r, 50)); }
  await ctx.close(); return peak;
}

export function testTone(sinkId?: string) {
  const el = new Audio(); const ctx = new AudioContext(); const dest = ctx.createMediaStreamDestination();
  const o = ctx.createOscillator(); o.frequency.value = 660; const g = ctx.createGain(); g.gain.value = 0.15; o.connect(g).connect(dest);
  el.srcObject = dest.stream; const anyEl = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
  if (sinkId && anyEl.setSinkId) void anyEl.setSinkId(sinkId).catch(() => {});
  void el.play(); o.start(); setTimeout(() => { o.stop(); void ctx.close(); }, 600);
}

export type FixOpts = {
  stream: MediaStream | null; error: string | null; retry: (defaults?: boolean) => boolean; recording?: boolean;
  muted?: boolean; unmute?: () => void; callStatus?: string; startAudio?: () => Promise<void>;
  setEchoCancel?: (v: boolean) => void; setHd?: (v: boolean) => void; speakerId?: string; reconnect?: () => void;
};

export async function fixThis(symptom: Symptom, o: FixOpts): Promise<FixStep[]> {
  const steps: FixStep[] = [];
  const restart = (defaults: boolean, what: string) => o.retry(defaults) ? `${what}.` : `Can’t restart devices mid-recording — pause and try again, or stop when you can.`;
  if (o.error || !o.stream) {
    steps.push({ label: 'Camera and mic', ok: false, note: o.error?.includes('ermission') ? 'Blocked — click the camera icon in the address bar, choose Allow, then press Fix this again.' : restart(true, 'Couldn’t open them; switched to your default devices') });
    return steps;
  }
  const all = symptom === 'general';
  if (all || symptom === 'camera') {
    const v = o.stream.getVideoTracks()[0];
    if (!v || v.readyState === 'ended' || v.muted) steps.push({ label: 'Camera', ok: false, note: restart(false, 'Camera had stopped — restarted it. If it’s still black, close other apps using the camera') });
    else steps.push({ label: 'Camera', ok: true, note: symptom === 'camera' ? 'Camera is sending video. If others see it frozen, it’s their connection or yours — try “Choppy or laggy”.' : undefined });
  }
  if (all || symptom === 'cant-be-heard') {
    if (o.muted) { o.unmute?.(); steps.push({ label: 'Mute', ok: false, note: 'You were muted — unmuted you.' }); }
    const peak = await measureMic(o.stream);
    if (peak < 0.01) steps.push({ label: 'Microphone', ok: false, note: restart(true, 'Heard nothing — switched to your default mic. Check it isn’t muted on the device') });
    else steps.push({ label: 'Microphone', ok: true, note: 'We can hear you.' });
  }
  if (all || symptom === 'cant-hear') {
    await o.startAudio?.().catch(() => {});
    document.querySelectorAll('audio').forEach((a) => void a.play().catch(() => {}));
    testTone(o.speakerId);
    steps.push({ label: 'Speakers', ok: true, note: 'Restarted call audio and played a test beep. No beep? Pick other speakers or check your volume.' });
  }
  if (symptom === 'echo') {
    o.setEchoCancel?.(true);
    steps.push({ label: 'Echo', ok: true, note: o.recording ? 'Echo cancellation is on. Wearing headphones is the surest fix.' : 'Turned echo cancellation on. Headphones fix it for good.' });
  }
  if (all || symptom === 'choppy' || symptom === 'cant-hear') {
    if (o.callStatus && o.callStatus !== 'live' && o.callStatus !== 'not-configured') { o.reconnect?.(); steps.push({ label: 'Connection', ok: false, note: 'Reconnecting to the call.' }); }
    else steps.push({ label: 'Connection', ok: true });
  }
  if (symptom === 'choppy') {
    if (!o.recording) { o.setHd?.(false); steps.push({ label: 'Video quality', ok: true, note: 'Dropped your camera to 720p to free up bandwidth. Switch back to 1080p in Setup once things are smooth.' }); }
    else steps.push({ label: 'Video quality', ok: true, note: 'Close other tabs and apps using the internet. Your local recording is unaffected.' });
  }
  if (all) {
    const est = await navigator.storage?.estimate?.();
    const freeGb = est?.quota && est.usage !== undefined ? (est.quota - est.usage) / 1e9 : null;
    steps.push(freeGb !== null && freeGb < 5 ? { label: 'Storage', ok: false, note: `Only ${freeGb.toFixed(1)} GB free for recording — free up disk space.` } : { label: 'Storage', ok: true });
  }
  return steps;
}
