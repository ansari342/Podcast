'use client';
/**
 * "Fix this" (T4–T6): checks the usual suspects and fixes what it can on the person's behalf.
 * Returns plain-language steps so they can see what happened.
 */
export type FixStep = { label: string; ok: boolean; note?: string };

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

export async function fixThis(opts: {
  stream: MediaStream | null; error: string | null; retry: (defaults?: boolean) => void;
  callStatus?: string; reconnect?: () => void;
}): Promise<FixStep[]> {
  const steps: FixStep[] = [];
  if (opts.error || !opts.stream) {
    steps.push({ label: 'Camera and mic', ok: false, note: opts.error?.includes('ermission') ? 'Blocked — click the camera icon in the address bar and choose Allow, then press Fix this again.' : 'Couldn’t open them. Switched to your default devices and tried again.' });
    opts.retry(true); return steps;
  }
  const v = opts.stream.getVideoTracks()[0];
  if (!v || v.readyState === 'ended' || v.muted) { opts.retry(); steps.push({ label: 'Camera', ok: false, note: 'Camera had stopped — restarted it. If it’s still black, close other apps using the camera.' }); }
  else steps.push({ label: 'Camera', ok: true });
  const peak = await measureMic(opts.stream);
  if (peak < 0.01) { opts.retry(true); steps.push({ label: 'Microphone', ok: false, note: 'Heard nothing — switched to your default mic. Check it isn’t muted on the device.' }); }
  else steps.push({ label: 'Microphone', ok: true, note: 'We can hear you.' });
  if (opts.callStatus && opts.callStatus !== 'live' && opts.callStatus !== 'not-configured') { opts.reconnect?.(); steps.push({ label: 'Connection', ok: false, note: 'Reconnecting to the call.' }); }
  else steps.push({ label: 'Connection', ok: true });
  const est = await navigator.storage?.estimate?.();
  const freeGb = est?.quota && est.usage !== undefined ? (est.quota - est.usage) / 1e9 : null;
  steps.push(freeGb !== null && freeGb < 5 ? { label: 'Storage', ok: false, note: `Only ${freeGb.toFixed(1)} GB free for recording — free up disk space.` } : { label: 'Storage', ok: true });
  return steps;
}
