'use client';
import { useCallback, useEffect, useState } from 'react';

export type DeviceLists = { cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] };

/** Camera/mic/speaker lists plus a live preview stream (S2, T2). */
export function useDevices() {
  const [lists, setLists] = useState<DeviceLists>({ cams: [], mics: [], speakers: [] });
  const [camId, setCamId] = useState<string>('');
  const [micId, setMicId] = useState<string>('');
  const [speakerId, setSpeakerId] = useState<string>('');
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
          video: camId ? { deviceId: { exact: camId }, width: 1920, height: 1080, frameRate: 30 } : { width: 1920, height: 1080, frameRate: 30 },
          audio: micId ? { deviceId: { exact: micId }, echoCancellation: true, noiseSuppression: true, autoGainControl: false, sampleRate: 48000 } : { echoCancellation: true, noiseSuppression: true, autoGainControl: false, sampleRate: 48000 },
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
  }, [camId, micId, refresh]);

  return { lists, camId, setCamId, micId, setMicId, speakerId, setSpeakerId, stream, error };
}
