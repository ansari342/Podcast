'use client';
import { useEffect, useRef, useState } from 'react';
import { LocalRecorder } from '@/lib/recorder/LocalRecorder';
import { chunkStore, type SessionManifest } from '@/lib/recorder/chunkStore';
import { joinWavChunks } from '@/lib/recorder/wav';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';

/** Developer test bench for the recorder (M1 exit test helpers). Not linked from the UI. */
export default function RecorderBench() {
  const video = useRef<HTMLVideoElement>(null);
  const rec = useRef<LocalRecorder | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [state, setState] = useState<'idle' | 'rec' | 'paused'>('idle');
  const [sessionId, setSessionId] = useState('');
  const [chunks, setChunks] = useState(0);
  const [onDisk, setOnDisk] = useState<SessionManifest[]>([]);
  useLeaveGuard(state !== 'idle');

  const refresh = async () => {
    const ids = await chunkStore.sessions();
    const ms = (await Promise.all(ids.map((id) => chunkStore.manifest(id)))).filter(Boolean) as SessionManifest[];
    setOnDisk(ms);
  };
  useEffect(() => { void refresh(); }, []);

  const start = async () => {
    const s = stream ?? await navigator.mediaDevices.getUserMedia({ video: { width: 1920, height: 1080, frameRate: 30 }, audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 } });
    setStream(s); if (video.current) video.current.srcObject = s;
    const id = `dev-${Date.now()}`; setSessionId(id); setChunks(0);
    rec.current = new LocalRecorder(id, 'me', Date.now(), { onChunk: () => setChunks((n) => n + 1), onError: (e) => console.error(e) });
    await rec.current.start(s); setState('rec');
  };
  const stop = async () => { await rec.current?.stop(); setState('idle'); await refresh(); };

  const download = async (m: SessionManifest, track: 'camera_raw' | 'mic_raw') => {
    const metas = m.chunks.filter((c) => c.track === track).sort((a, b) => a.index - b.index);
    const blobs = (await Promise.all(metas.map((c) => chunkStore.get(m.sessionId, c)))).filter(Boolean) as Blob[];
    const out = track === 'mic_raw' ? await joinWavChunks(blobs, m.sampleRate) : new Blob(blobs, { type: m.mimeType });
    const a = document.createElement('a'); a.href = URL.createObjectURL(out);
    a.download = `${m.sessionId}-${track}.${track === 'mic_raw' ? 'wav' : m.mimeType.includes('mp4') ? 'mp4' : 'webm'}`; a.click();
  };

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1>Recorder test bench</h1>
      <p className="muted">Records camera (video chunks) and mic (48 kHz WAV chunks) into browser storage every 5 s. Close the tab mid-recording and come back: the session stays listed below.</p>
      <video ref={video} autoPlay muted playsInline style={{ width: '100%', borderRadius: 12, background: '#2B2F3A' }} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {state === 'idle' && <button className="btn btn-rec" onClick={start}>Record</button>}
        {state === 'rec' && <button className="btn" onClick={() => { rec.current?.pause(); setState('paused'); }}>Pause</button>}
        {state === 'paused' && <button className="btn" onClick={() => { rec.current?.resume(); setState('rec'); }}>Resume</button>}
        {state !== 'idle' && <button className="btn btn-rec" onClick={stop}>Stop</button>}
        <span className="muted">{sessionId && `${sessionId} · ${chunks} chunks saved`}</span>
      </div>
      <h2 style={{ fontSize: 18 }}>On disk</h2>
      {onDisk.map((m) => (
        <div key={m.sessionId} className="panel" style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>{m.sessionId} · {m.chunks.length} chunks · {m.stoppedAt ? 'stopped' : 'interrupted (recoverable)'}</span>
          <button className="btn" onClick={() => download(m, 'camera_raw')}>Video</button>
          <button className="btn" onClick={() => download(m, 'mic_raw')}>WAV</button>
          <button className="btn" onClick={async () => { await chunkStore.deleteSession(m.sessionId); await refresh(); }}>Delete</button>
        </div>
      ))}
    </main>
  );
}
