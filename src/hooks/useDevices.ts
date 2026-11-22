'use client';
import { useCallback, useEffect, useState } from 'react';

export type DeviceLists = { cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] };

/** Camera/mic/speaker lists plus a live preview stream (S2, T2). */
export function useDevices() {
  const [lists, setLists] = useState<DeviceLists>({ cams: [], mics: [], speakers: [] });
  const saved = (k: string) => (typeof window !== 'undefined' ? localStorage.getItem(k) ?? '' : '');
  const [camId, setCamIdRaw] = useState<string>(() => saved('st3-cam'));
  const [micId, setMicIdRaw] = useState<string>(() => saved('st3-mic'));
  const [speakerId, setSpeakerIdRaw] = useState<string>(() => saved('st3-spk'));
  const [noiseCancel, setNoiseCancelRaw] = useState<boolean>(() => saved('st3-ns') !== 'off');
  const [attempt, setAttempt] = useState(0);
  const setCamId = (v: string) => { localStorage.setItem('st3-cam', v); setCamIdRaw(v); };
  const setMicId = (v: string) => { localStorage.setItem('st3-mic', v); setMicIdRaw(v); };
  const setSpeakerId = (v: string) => { localStorage.setItem('st3-spk', v); setSpeakerIdRaw(v); };
  const setNoiseCancel = (v: boolean) => { localStorage.setItem('st3-ns', v ? 'on' : 'off'); setNoiseCancelRaw(v); };
  /** Re-open camera + mic (used by Fix this). Pass true to fall back to the default devices. */
  const retry = (useDefaults = false) => { if (useDefaults) { setCamId(''); setMicId(''); } setAttempt((n) => n + 1); };
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const all = await navigator.mediaDevices.enumerateDevices();
    setLists({
      cams: all.filter((d) => d.kind === 'videoinput'),
      mics: all.filter((d) => d.kind === 'audioinput'),
      speakers: all.filter((d) => d.kind === 'audiooutput'),
    });
  }, []);

  useEffect(() => {
    let active: MediaStream | null = null;
    (async () => {
      try {
        active = await navigator.mediaDevices.getUserMedia({
          video: { ...(camId ? { deviceId: { exact: camId } } : {}), width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
          // S9: noise cancellation uses the browser's built-in suppression; the raw mic file is still recorded either way.
          audio: { ...(micId ? { deviceId: { exact: micId } } : {}), echoCancellation: true, noiseSuppression: noiseCancel, autoGainControl: false, sampleRate: 48000 },
        }).catch(async (e) => {
          // A saved device that's been unplugged: fall back to defaults instead of failing.
          if (camId || micId) return navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: true, noiseSuppression: noiseCancel } });
          throw e;
        });
        setStream(active);
        setError(null);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', refresh);
      active?.getTracks().forEach((t) => t.stop());
    };
  }, [camId, micId, noiseCancel, attempt, refresh]);

  return { lists, camId, setCamId, micId, setMicId, speakerId, setSpeakerId, noiseCancel, setNoiseCancel, retry, stream, error };
}
