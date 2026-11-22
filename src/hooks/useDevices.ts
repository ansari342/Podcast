'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type DeviceLists = { cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] };
export type NoiseLevel = 'off' | 'standard' | 'strong';

/**
 * Camera / mic / speakers (S2, T2) plus noise cancellation (S9) and a raw mic copy (S10).
 * - Standard: the browser's noise suppression. Strong: that plus a high-pass filter, compressor and noise gate.
 * - `rawMic` is a second capture of the same mic with all processing off, recorded as `mic_raw`.
 * - `lock(true)` while recording: device changes are refused so the local recording never stops (T5).
 */
export function useDevices() {
  const saved = (k: string) => (typeof window !== 'undefined' ? localStorage.getItem(k) ?? '' : '');
  const [lists, setLists] = useState<DeviceLists>({ cams: [], mics: [], speakers: [] });
  const [camId, setCamIdRaw] = useState(() => saved('st3-cam'));
  const [micId, setMicIdRaw] = useState(() => saved('st3-mic'));
  const [speakerId, setSpeakerIdRaw] = useState(() => saved('st3-spk'));
  const [noise, setNoiseRaw] = useState<NoiseLevel>(() => { const v = saved('st3-ns'); return v === 'off' ? 'off' : v === 'strong' ? 'strong' : 'standard'; });
  const [echoCancel, setEchoCancelRaw] = useState(() => saved('st3-ec') !== 'off');
  const [hd, setHdRaw] = useState(() => saved('st3-hd') !== '720');
  const [attempt, setAttempt] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [rawMic, setRawMic] = useState<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);

  const guard = <T,>(f: (v: T) => void) => (v: T) => { if (!locked.current) f(v); };
  const setCamId = guard((v: string) => { localStorage.setItem('st3-cam', v); setCamIdRaw(v); });
  const setMicId = guard((v: string) => { localStorage.setItem('st3-mic', v); setMicIdRaw(v); });
  const setSpeakerId = (v: string) => { localStorage.setItem('st3-spk', v); setSpeakerIdRaw(v); };
  const setNoise = guard((v: NoiseLevel) => { localStorage.setItem('st3-ns', v); setNoiseRaw(v); });
  const setEchoCancel = guard((v: boolean) => { localStorage.setItem('st3-ec', v ? 'on' : 'off'); setEchoCancelRaw(v); });
  const setHd = guard((v: boolean) => { localStorage.setItem('st3-hd', v ? '1080' : '720'); setHdRaw(v); });
  /** Re-open camera + mic (Fix this). Pass true to fall back to the default devices. */
  const retry = (useDefaults = false) => { if (locked.current) return false; if (useDefaults) { setCamId(''); setMicId(''); } setAttempt((n) => n + 1); return true; };
  const lock = useCallback((v: boolean) => { locked.current = v; }, []);

  const refresh = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    setLists({ cams: all.filter((d) => d.kind === 'videoinput'), mics: all.filter((d) => d.kind === 'audioinput'), speakers: all.filter((d) => d.kind === 'audiooutput') });
  }, []);

  useEffect(() => {
    const opened: MediaStreamTrack[] = []; let ctx: AudioContext | null = null; let cancelled = false;
    (async () => {
      try {
        const video = { ...(camId ? { deviceId: { exact: camId } } : {}), width: { ideal: hd ? 1920 : 1280 }, height: { ideal: hd ? 1080 : 720 }, frameRate: { ideal: 30 } };
        const audio = (raw: boolean) => ({ ...(micId ? { deviceId: { exact: micId } } : {}), echoCancellation: raw ? false : echoCancel, noiseSuppression: raw ? false : noise !== 'off', autoGainControl: false, sampleRate: 48000, channelCount: 1 });
        const s = await navigator.mediaDevices.getUserMedia({ video, audio: audio(false) }).catch(async (e) => {
          if (camId || micId) return navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: echoCancel, noiseSuppression: noise !== 'off' } });
          throw e;
        });
        opened.push(...s.getTracks());
        let out = s;
        if (noise === 'strong' && s.getAudioTracks()[0]) {
          ctx = new AudioContext({ sampleRate: 48000 });
          await ctx.audioWorklet.addModule('/worklets/gate.js');
          const src = ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks()));
          const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 100;
          const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = 4;
          const gate = new AudioWorkletNode(ctx, 'gate'); const dest = ctx.createMediaStreamDestination();
          src.connect(hp).connect(comp).connect(gate).connect(dest);
          out = new MediaStream([...s.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        }
        let raw: MediaStreamTrack | null = null;
        try { const r = await navigator.mediaDevices.getUserMedia({ audio: audio(true) }); raw = r.getAudioTracks()[0] ?? null; if (raw) opened.push(raw); } catch { /* raw copy is optional */ }
        if (cancelled) return;
        setStream(out); setRawMic(raw); setError(null); await refresh();
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); }
    })();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => { cancelled = true; navigator.mediaDevices.removeEventListener('devicechange', refresh); opened.forEach((t) => t.stop()); void ctx?.close(); };
  }, [camId, micId, noise, echoCancel, hd, attempt, refresh]);

  return { lists, camId, setCamId, micId, setMicId, speakerId, setSpeakerId, noise, setNoise, echoCancel, setEchoCancel, hd, setHd, retry, lock, stream, rawMic, error,
    // kept for the green room's simple toggle
    noiseCancel: noise !== 'off', setNoiseCancel: (v: boolean) => setNoise(v ? 'standard' : 'off') };
}
