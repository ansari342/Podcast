'use client';
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Room, RoomEvent, Track, type LocalVideoTrack } from 'livekit-client';
import { SharedStore, batches, useStore } from '@/lib/sync';
import { COMPANION_PREFIX } from '@/hooks/useLiveRoom';
import { TrackRecorder, pickMime } from '@/lib/recorder/LocalRecorder';
import { UploadQueue } from '@/lib/recorder/uploadQueue';
import { makeS3Send } from '@/lib/recorder/s3Send';
import { chunkStore } from '@/lib/recorder/chunkStore';

type Rec = { state: 'idle' | 'countdown' | 'rec' | 'paused'; at: number; by: string; pausedAt?: number; pausedTotal: number };
type Who = { identity: string; name: string };
const dec = new TextDecoder(); const enc = new TextEncoder();

export default function Page(props: { params: Promise<{ session: string }> }) {
  return <Suspense><Companion {...props} /></Suspense>;
}

/**
 * Phone companion (S14): a phone joins the call as a second camera for one person. It never takes a seat. It records
 * its own camera when anyone presses Record (same take, same clock) and uploads into that person's folder as
 * "Phone camera". Optionally it also shows live, as a small picture-in-picture on that person's tile.
 */
function Companion({ params }: { params: Promise<{ session: string }> }) {
  const { session } = use(params);
  const [people, setPeople] = useState<Who[] | null>(null);
  const [err, setErr] = useState('');
  const [who, setWho] = useState<Who | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [live, setLive] = useState(false);
  const [joined, setJoined] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [upl, setUpl] = useState({ done: 0, pending: 0 });
  const [now, setNow] = useState(Date.now());
  const identity = useMemo(() => (who ? `${COMPANION_PREFIX}${who.identity}__${Math.random().toString(36).slice(2, 7)}` : ''), [who]);
  const store = useMemo(() => new SharedStore(identity || 'companion'), [identity]);
  useStore(store);
  const room = useRef<Room | null>(null);

  // Who's in the call (refreshes until you pick).
  useEffect(() => {
    if (who) return;
    const load = () => fetch(`/api/companion?room=${session}`).then(async (r) => {
      const j = await r.json(); if (!r.ok) { setErr(r.status === 501 ? 'Calls aren’t set up on this site.' : j.error ?? 'Couldn’t load the call.'); return; }
      setErr(''); setPeople(j.rooms?.[0]?.people ?? []);
    }).catch(() => setErr('Couldn’t reach the studio.'));
    void load(); const t = setInterval(load, 3000); return () => clearInterval(t);
  }, [session, who]);

  // Camera (front or back). Video only: the laptop mic already records this person's voice.
  useEffect(() => {
    if (!who) return;
    let s: MediaStream | null = null; let off = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, audio: false })
      .then((m) => { if (off) m.getTracks().forEach((t) => t.stop()); else { s = m; setStream(m); } })
      .catch(() => setErr('Allow camera access to use your phone as a second camera.'));
    return () => { off = true; s?.getTracks().forEach((t) => t.stop()); };
  }, [who, facing]);

  // Join the call as a companion: receive the shared state (Record/Pause/Stop), publish video only if "live".
  const join = async () => {
    if (!who) return;
    const res = await fetch('/api/livekit-token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room: session, identity, name: `${who.name} · phone` }) });
    if (!res.ok) { setErr('Couldn’t join the call.'); return; }
    const { token, url } = await res.json();
    const r = new Room({ adaptiveStream: true, dynacast: true }); room.current = r;
    r.on(RoomEvent.DataReceived, (payload) => { try { const m = JSON.parse(dec.decode(payload)); if (m.t === 's') store.apply(m.e); } catch { /* ignore */ } });
    store.onSend = (entries, to) => { for (const b of batches(entries)) void r.localParticipant.publishData(enc.encode(JSON.stringify({ t: 's', e: b })), { reliable: true, destinationIdentities: to }); };
    await r.connect(url || process.env.NEXT_PUBLIC_LIVEKIT_URL!, token);
    setJoined(true);
    try { await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<unknown> } }).wakeLock?.request('screen'); } catch { /* not supported */ }
  };
  useEffect(() => () => { void room.current?.disconnect(); }, []);

  // Live or record-only: (un)publish the phone camera.
  useEffect(() => {
    const r = room.current; const t = stream?.getVideoTracks()[0]; if (!joined || !r || !t) return;
    (async () => {
      const pub = r.localParticipant.getTrackPublication(Track.Source.Camera);
      if (pub?.track && (!live || pub.track.mediaStreamTrack !== t)) await r.localParticipant.unpublishTrack(pub.track as LocalVideoTrack, false);
      if (live && r.localParticipant.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack !== t) await r.localParticipant.publishTrack(t, { source: Track.Source.Camera });
    })().catch(() => {});
  }, [live, joined, stream]);

  // Recording follows the studio's shared `rec`, on the same clock, into this person's folder.
  const rec = store.get<Rec>('rec') ?? { state: 'idle', at: 0, by: '', pausedTotal: 0 };
  const recorder = useRef<TrackRecorder | null>(null);
  const uploader = useRef<UploadQueue | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const startRec = useCallback(async () => {
    if (!who || !stream) return;
    const userId = store.get<string>(`uid.${who.identity}`) ?? `${who.name}-${who.identity}`;
    const sessionId = `${session}~${Date.now().toString(36)}p`;
    await chunkStore.init({ sessionId, userId, epochMs: rec.at, mimeType: pickMime(), sampleRate: 48000, chunks: [] });
    uploader.current = new UploadQueue(sessionId, makeS3Send(userId), (done, pending) => setUpl({ done, pending }));
    const t = new TrackRecorder(sessionId, rec.at, 'phone', (m) => uploader.current?.add(m));
    t.start(new MediaStream(stream.getVideoTracks())); recorder.current = t;
  }, [who, stream, session, rec.at, store]);
  useEffect(() => {
    if (!joined) return;
    const on = (rec.state === 'countdown' && now >= rec.at) || rec.state === 'rec' || rec.state === 'paused';
    if (on && !recorder.current) void startRec().then(() => { if (rec.state === 'paused') recorder.current?.pause(); });
    if (rec.state === 'paused') recorder.current?.pause();
    if (rec.state === 'rec') recorder.current?.resume();
    if (rec.state === 'idle' && recorder.current) { const t = recorder.current; recorder.current = null; void t.stop(); }
  }, [rec.state, rec.at, now >= rec.at, joined]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leftover chunks from an earlier take (phone locked, tab closed) upload next time this page opens.
  useEffect(() => {
    void chunkStore.sessions().then((ids) => ids.filter((id) => id.endsWith('p')).forEach(async (id) => {
      const m = await chunkStore.manifest(id); if (m?.chunks.length) void new UploadQueue(id, makeS3Send(m.userId)).resumeFromDisk();
    }));
  }, []);

  const preview = useCallback((el: HTMLVideoElement | null) => { if (el) el.srcObject = stream; }, [stream]);
  const recording = rec.state === 'rec' || rec.state === 'paused';
  const elapsed = rec.state === 'paused' ? (rec.pausedAt ?? now) - rec.at - rec.pausedTotal : now - rec.at - rec.pausedTotal;
  const fmt = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  const shell = (children: React.ReactNode) => (
    <main className="studio" style={{ padding: 20, gap: 16, maxWidth: 520, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="brand-mark">3</span><strong style={{ fontFamily: 'var(--font-head)', fontSize: 18 }}>Phone companion</strong></div>
      {err && <span className="chip chip-warn">{err}</span>}
      {children}
    </main>);

  if (!who) return shell(<>
    <h1 style={{ fontSize: 26 }}>Who are you?</h1>
    <span className="muted">Your phone becomes a second camera for you. It records when the studio records.</span>
    {people === null ? <span className="muted">Looking for the call…</span>
      : !people.length ? <span className="muted">Nobody’s in the studio yet. This updates on its own.</span>
      : people.map((p) => <button key={p.identity} className="btn" style={{ minHeight: 60, fontSize: 18, justifyContent: 'flex-start' }} onClick={() => setWho(p)}>{p.name}</button>)}
  </>);

  return shell(<>
    <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', background: '#000', aspectRatio: '9 / 16', maxHeight: '58vh', alignSelf: 'center', width: '100%' }}>
      <video ref={preview} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />
      <span className={`chip${recording ? ' chip-rec' : ''}`} style={{ position: 'absolute', top: 12, left: 12 }}>
        {recording ? <><span className={rec.state === 'rec' ? 'dot dot-live' : 'dot'} />{rec.state === 'paused' ? 'Paused' : 'Recording'} {fmt(elapsed)}</> : joined ? 'Waiting for Record' : 'Not joined'}
      </span>
      {joined && live && <span className="chip" style={{ position: 'absolute', top: 12, right: 12 }}>Live in the call</span>}
    </div>
    <span className="muted" style={{ textAlign: 'center' }}>Second camera for <strong style={{ color: 'var(--text)' }}>{who.name}</strong>{upl.pending ? ` · uploading ${upl.pending}` : upl.done ? ' · all uploaded' : ''}</span>
    <div className="seg" role="radiogroup" aria-label="Show this camera">
      <button className="btn" style={{ flex: 1 }} role="radio" aria-checked={!live} aria-pressed={!live} onClick={() => setLive(false)}>Record only</button>
      <button className="btn" style={{ flex: 1 }} role="radio" aria-checked={live} aria-pressed={live} onClick={() => setLive(true)}>Show live</button>
    </div>
    <button className="btn" disabled={recording} onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}>Switch to {facing === 'user' ? 'back' : 'front'} camera</button>
    {!joined
      ? <button className="btn btn-primary" style={{ minHeight: 56, fontSize: 17 }} disabled={!stream} onClick={() => void join().catch(() => setErr('Couldn’t join the call.'))}>Join as {who.name}’s phone</button>
      : <button className="btn btn-ghost" onClick={async () => { if (recording && !confirm('Stop this phone’s recording? The studio keeps recording.')) return; const t = recorder.current; recorder.current = null; await t?.stop(); await room.current?.disconnect(); location.href = '/'; }}>Leave</button>}
    {!joined && <button className="btn btn-ghost" onClick={() => setWho(null)}>Not {who.name}?</button>}
    <span className="muted" style={{ fontSize: 12, textAlign: 'center' }}>Keep this page open with the screen on while recording. Prop the phone up and point it at yourself or the room.</span>
  </>);
}
