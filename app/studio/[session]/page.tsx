'use client';
import Link from 'next/link';
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useDevices } from '@/hooks/useDevices';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { useIdentity, useLiveRoom, type Person } from '@/hooks/useLiveRoom';
import { useStore } from '@/lib/sync';
import { GAMES, isPlayable, type GameId } from '@/lib/games';
import { GameBoard, caption, hiddenForMe, mutedForMe, startGame, type GameRef } from '@/components/GameBoard';
import { SAMPLE_PLAN, nextAfter, type PlanItem } from '@/lib/plan';
import { SOUNDS, playSound, preloadSounds, onSfx, sfxContext, type CustomSound } from '@/lib/sfx';
import { LocalRecorder, TrackRecorder } from '@/lib/recorder/LocalRecorder';
import { ActiveRecorder } from '@/lib/recorder/ActiveRecorder';
import { UploadQueue } from '@/lib/recorder/uploadQueue';
import { makeS3Send } from '@/lib/recorder/s3Send';
import { chunkStore } from '@/lib/recorder/chunkStore';
import { pickSticker, pickTarget, place, trackFace, type FaceBox, type Overlay } from '@/lib/overlay';
import { fixThis, testTone, SYMPTOMS, type FixStep, type Symptom } from '@/lib/fixThis';
import { runChecks, type Check } from '@/lib/checks';

type Tab = 'games' | 'topics' | 'setup' | null;
type Status = { up: number; done: number; freeGb: number | null; ns: string; cam: boolean; err?: string };
type Rec = { state: 'idle' | 'countdown' | 'rec' | 'paused'; at: number; by: string; pausedAt?: number; pausedTotal: number };
const SETS = [{ id: 'none', name: 'Off' }, { id: 'blur', name: 'Blur' }, { id: 'studio', name: 'Studio' }, { id: 'city', name: 'City' }, { id: 'library', name: 'Library' }] as const;
const REACTIONS = ['😂', '🔥', '👏', '😮', '💀', '❤️'];

export default function Page(props: { params: Promise<{ session: string }> }) {
  return <Suspense><Studio {...props} /></Suspense>;
}

/**
 * Studio (brief: Screens → 3). Everything shared — recording, games, plan, set, overlays — lives in the shared store,
 * so all three browsers stay in step and anyone can press Record (S3).
 */
function Studio({ params }: { params: Promise<{ session: string }> }) {
  const { session } = use(params);
  const sp = useSearchParams();
  const d = useDevices();
  const { identity, name } = useIdentity();
  const live = useLiveRoom(session, identity, name, d.stream);
  const { store, people, emit, onEvent } = live;
  useStore(store);
  const me = identity;
  const count = Math.max(1, people.length);
  const userId = `${name}-${identity}`;

  // ---- shared state ----
  const rec = store.get<Rec>('rec') ?? { state: 'idle', at: 0, by: '', pausedTotal: 0 };
  const title = store.get<string>('title') ?? sp.get('title') ?? 'Episode';
  const plan = store.get<PlanItem[]>('plan') ?? SAMPLE_PLAN;
  const nowId = store.get<string>('now') ?? plan[0]?.id ?? null;
  const set = store.get<string>('set') ?? 'none';
  const screenOnRec = store.get<boolean>('screenRec') ?? true;
  const game = store.get<GameRef | null>('game') ?? null;
  const boardOn = (id: GameId) => store.get<boolean>(`board.${id}`) ?? GAMES.find((g) => g.id === id)!.boardOnRecording;
  const overlays = store.under<Overlay>('ov.');
  const customSound = store.get<CustomSound | null>('sfx.custom') ?? null;
  const debate = store.get<string | null>('debate') ?? null;
  const statuses = store.under<Status>('st.');
  const fixes = store.under<FixStep[]>('fix.');
  useEffect(() => { if (sp.get('title') && !store.get('title')) store.set('title', sp.get('title')); }, [sp, store]);

  // ---- local UI ----
  const [tab, setTab] = useState<Tab>(null);
  const [muted, setMuted] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [menu, setMenu] = useState<'react' | 'overlay' | null>(null);
  const [prompt, setPrompt] = useState('');
  const [now, setNow] = useState(Date.now());
  const [floaters, setFloaters] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const [faces, setFaces] = useState<Record<string, FaceBox | null>>({});
  const [fix, setFix] = useState<FixStep[] | null>(null);
  const [symptom, setSymptom] = useState<Symptom>('general');
  const [recError, setRecError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [sfxBusy, setSfxBusy] = useState('');
  const [agenda, setAgenda] = useState<{ subject: string; receivedAt: number; items: string[] } | null>(null);
  useEffect(() => { fetch(`/api/agenda?session=${session}`).then((r) => r.json()).then((j) => setAgenda(j.agenda)).catch(() => {}); }, [session]);
  const applyAgenda = () => { if (!agenda) return; const items = agenda.items.map((t, i) => ({ id: `a${agenda.receivedAt}-${i}`, title: t, done: false })); store.setMany({ plan: items, now: items[0]?.id ?? null }); };
  // P1: a fresh agenda (last 3 days) becomes the plan automatically if nobody has touched the plan yet.
  useEffect(() => { if (agenda?.items.length && Date.now() - agenda.receivedAt < 3 * 864e5 && store.get('plan') === undefined && live.status !== 'connecting') { const t = setTimeout(() => { if (store.get('plan') === undefined) applyAgenda(); }, 2500); return () => clearTimeout(t); } }, [agenda, live.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const [upl, setUpl] = useState({ done: 0, pending: 0 });
  const upRef = useRef(upl); upRef.current = upl;
  const [full, setFull] = useState(false);
  const [invite, setInvite] = useState('');
  useEffect(() => { fetch(`/api/invite?session=${session}`).then((r) => r.json()).then((j) => j.path && setInvite(location.origin + j.path)).catch(() => {}); }, [session]);
  useEffect(() => { const f = () => setFull(true); window.addEventListener('st3-storage-full', f); return () => window.removeEventListener('st3-storage-full', f); }, []);
  const els = useRef(new Map<string, HTMLVideoElement>());
  const screenEl = useRef<HTMLVideoElement | null>(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  useEffect(() => { d.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted)); }, [muted, d.stream]);
  useEffect(() => { d.stream?.getVideoTracks().forEach((t) => (t.enabled = camOn)); }, [camOn, d.stream]);

  // ---- events: reactions, sound effects, face boxes ----
  useEffect(() => onEvent((e) => {
    if (e.type === 'react') { const id = Math.random(); setFloaters((f) => [...f, { id, emoji: String(e.emoji), x: 10 + Math.random() * 80 }]); setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 2600); }
    if (e.type === 'sfx') void playSound(Number(e.i), store.get<CustomSound | null>('sfx.custom'));
    if (e.type === 'fix' && e.to === me) void runFixRef.current(String(e.symptom ?? 'general') as Symptom).then((steps) => store.set(`fix.${me}`, steps));
    if (e.type === 'face') setFaces((f) => ({ ...f, [e.from]: e.box as FaceBox | null }));
  }), [onEvent]);

  // ---- overlays: if someone put an overlay on me, track my face and share the box (AO2) ----
  const myOverlay = overlays[me];
  useEffect(() => {
    if (!myOverlay || !d.stream) return;
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = new MediaStream(d.stream.getVideoTracks()); void v.play();
    let stop: (() => void) | undefined; let last = 0;
    trackFace(v, (box) => { setFaces((f) => ({ ...f, [me]: box })); if (Date.now() - last > 120) { last = Date.now(); emit({ type: 'face', box }, true); } })
      .then((s) => (stop = s)).catch(() => { /* no face tracking: sticker sits in a default spot */ });
    return () => { stop?.(); v.srcObject = null; };
  }, [!!myOverlay, d.stream, me]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- shared set (S12): same set for everyone, each person gets their slice of the room by seat ----
  const seat = Math.max(0, people.findIndex((p) => p.identity === me));
  const processor = useRef<import('@livekit/track-processors').BackgroundProcessorWrapper | null>(null);
  const [processed, setProcessed] = useState<MediaStreamTrack | undefined>();
  const processedFor = useRef<unknown>(null);
  useEffect(() => {
    const track = live.cameraTrack(); if (!track) return;
    if (processedFor.current !== track) { processor.current = null; processedFor.current = track; } // camera changed: start fresh
    (async () => {
      const tp = await import('@livekit/track-processors');
      if (!tp.supportsBackgroundProcessors()) return;
      if (set === 'none') { if (processor.current) { await track.stopProcessor(); processor.current = null; } setProcessed(undefined); return; }
      const opts = set === 'blur' ? { mode: 'background-blur' as const, blurRadius: 12 } : { mode: 'virtual-background' as const, imagePath: `/sets/${set}-${seat % 3}.jpg` };
      if (processor.current) await processor.current.switchTo(opts);
      else { processor.current = tp.BackgroundProcessor(opts); await track.setProcessor(processor.current); }
      setProcessed(processor.current?.processedTrack ?? track.mediaStreamTrack);
    })().catch(() => {});
  }, [set, seat, live.room, live.people.length, d.stream]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- recording (R1–R6): every browser follows the shared `rec` state ----
  const recorder = useRef<LocalRecorder | null>(null);
  const active = useRef<ActiveRecorder | null>(null);
  const uploader = useRef<UploadQueue | null>(null);
  const localSess = useRef('');
  const peopleRef = useRef(people); peopleRef.current = people;
  const sceneRef = useRef<() => import('@/lib/recorder/ActiveRecorder').Scene>(() => ({ tiles: [] }));
  sceneRef.current = () => {
    const shown = people.find((p) => p.screen);
    const g = store.get<GameRef | null>('game');
    return {
      tiles: people.map((p) => ({ el: els.current.get(p.identity) ?? null, mirrored: p.isLocal, overlay: overlays[p.identity], face: faces[p.identity] ?? undefined })),
      screen: shown && screenOnRec ? screenEl.current : null,
      board: g && boardOn(g.id) ? caption(store, people) : null,
      caption: store.get<string | null>('debate') ?? null,
    };
  };

  useEffect(() => {
    const running = !!recorder.current;
    if ((rec.state === 'countdown' && now >= rec.at) || rec.state === 'rec' || rec.state === 'paused') {
      if (!running && d.stream) {
        const part = Date.now().toString(36);
        localSess.current = `${session}~${part}`;
        uploader.current = new UploadQueue(localSess.current, makeS3Send(userId), (done, pending) => setUpl({ done, pending }));
        const r = new LocalRecorder(localSess.current, userId, rec.at, { onChunk: (m) => uploader.current?.add(m) });
        recorder.current = r; setRecError('');
        void r.start(d.stream, d.rawMic).then(() => { if (store.get<Rec>('rec')?.state === 'paused') r.pause(); })
          .catch((err) => { setRecError(`Recording couldn’t start on this computer: ${(err as Error)?.message ?? err}`); recorder.current = null; });
      }
      // R5: whoever pressed Record makes the episode video; if they've left, the first person in the room takes over.
      const owner = peopleRef.current.some((p) => p.identity === rec.by) ? rec.by : peopleRef.current[0]?.identity;
      if (owner === me && !active.current && recorder.current && d.stream) {
          const a = new ActiveRecorder(localSess.current, rec.at, () => sceneRef.current(), (m) => uploader.current?.add(m));
          a.setAudio(peopleRef.current.flatMap((p) => (p.isLocal ? d.stream!.getAudioTracks() : p.audio ? [p.audio] : [])));
          try { a.start(); active.current = a; } catch (err) { setRecError(`Episode video couldn’t start: ${(err as Error).message}`); }
          void fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: session, title, startedAt: rec.at, people: Object.fromEntries(peopleRef.current.map((p) => [p.identity, p.name])) }) }).catch(() => {});
      }
      if (rec.state === 'countdown' && recorder.current) store.set('rec', { ...rec, state: 'rec' });
      if (rec.state === 'paused') { recorder.current?.pause(); active.current?.pause(); screenRec.current?.pause(); }
      if (rec.state === 'rec') { recorder.current?.resume(); active.current?.resume(); screenRec.current?.resume(); }
    }
    if (rec.state === 'idle' && running) {
      const r = recorder.current!, a = active.current, sr = screenRec.current; recorder.current = null; active.current = null; screenRec.current = null;
      void (async () => {
        await Promise.allSettled([r.stop(), a?.stop(), sr?.stop()]);
        if (a) void fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: session, title, startedAt: rec.at, durationMs: Date.now() - rec.at - rec.pausedTotal, people: Object.fromEntries(peopleRef.current.map((p) => [p.identity, p.name])), markers: markerList(), events: eventList() }) }).catch(() => {});
      })();
    }
  }, [rec.state, rec.at, rec.by, now >= rec.at, d.stream, people.map((p) => p.identity).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Devices can't change mid-recording, so the recording never stops (T5).
  useEffect(() => { d.lock(rec.state !== 'idle'); }, [rec.state]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sound effects go into the active video (SB2).
  useEffect(() => onSfx((b) => active.current?.mixBuffer(b)), []);
  useEffect(() => { preloadSounds(customSound); }, [customSound?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // V2: whoever shares records their screen as its own track when "Screen on recording" is on.
  const screenRec = useRef<TrackRecorder | null>(null);
  const myScreen = people.find((p) => p.isLocal)?.screen;
  useEffect(() => {
    const want = !!myScreen && screenOnRec && !!recorder.current && (rec.state === 'rec' || rec.state === 'paused');
    if (want && !screenRec.current) { const t = new TrackRecorder(localSess.current, rec.at, 'screen', (m) => uploader.current?.add(m)); t.start(new MediaStream([myScreen!])); screenRec.current = t; }
    if (!want && screenRec.current) { const t = screenRec.current; screenRec.current = null; void t.stop(); }
  }, [myScreen, screenOnRec, rec.state, now >= rec.at]); // eslint-disable-line react-hooks/exhaustive-deps

  // Markers (S8) and game/sound events (G12), saved with the episode for editing.
  const elapsedNow = () => Date.now() - rec.at - rec.pausedTotal;
  const recording = rec.state === 'rec' || rec.state === 'paused';
  const logEvent = (type: string, label: string) => { if (recording) store.set(`ev.${Date.now()}.${me}`, { t: elapsedNow(), type, label, by: name }); };
  const addMarker = () => { if (recording) store.set(`mk.${Date.now()}.${me}`, { t: elapsedNow(), by: name }); };
  const markerList = () => Object.values(store.under<{ t: number; by: string }>('mk.')).filter((m) => m.t >= 0).sort((a, b) => a.t - b.t);
  const eventList = () => Object.values(store.under<{ t: number; type: string; label: string; by: string }>('ev.')).filter((m) => m.t >= 0).sort((a, b) => a.t - b.t);
  const markers = markerList().filter((m) => m.t <= elapsedNow());
  const lastGame = useRef(0);
  useEffect(() => { if (game && game.round !== lastGame.current) { lastGame.current = game.round; logEvent('game', GAMES.find((g) => g.id === game.id)?.name ?? game.id); } }, [game?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  const playSfx = (i: number) => { emit({ type: 'sfx', i }); logEvent('sound', i < SOUNDS.length ? SOUNDS[i].name : customSound?.name ?? 'Upload'); };
  const uploadSound = async (f: File) => {
    setSfxBusy('Uploading…');
    try {
      const r = await fetch('/api/sfx', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room: session, type: f.type || 'audio/mpeg', bytes: f.size }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error);
      const put = await fetch(j.url, { method: 'PUT', body: f, headers: { 'content-type': f.type || 'audio/mpeg' } }); if (!put.ok) throw new Error('Upload failed');
      store.set('sfx.custom', { name: f.name.replace(/\.[^.]+$/, '').slice(0, 20), key: j.key }); setSfxBusy('');
    } catch (e) { setSfxBusy((e as Error).message || 'Upload failed'); }
  };

  // Keys 1–9 play sounds, M drops a marker (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement; if (el.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[1-9]$/.test(e.key)) { const i = Number(e.key) - 1; if (i < SOUNDS.length || customSound) playSfx(i); }
      if (e.key === 'm' || e.key === 'M') addMarker();
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  // PP1/PP2/R8: everyone shares their upload, storage and audio status for the People section.
  useEffect(() => {
    let last = '';
    const tick = async () => {
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      const st: Status = { up: upRef.current.pending, done: upRef.current.done, freeGb: est?.quota && est.usage !== undefined ? Math.round((est.quota - est.usage) / 1e8) / 10 : null, ns: d.noise, cam: !!d.stream?.getVideoTracks()[0], err: d.error ?? undefined };
      const j = JSON.stringify(st); if (j !== last) { last = j; store.set(`st.${me}`, st); }
    };
    void tick(); const t = setInterval(tick, 3000); return () => clearInterval(t);
  }, [d.noise, d.stream, d.error, me, store]);

  // Keep the active mix in step with who's in the room.
  useEffect(() => { active.current?.setAudio(people.flatMap((p) => (p.isLocal ? d.stream?.getAudioTracks() ?? [] : p.audio ? [p.audio] : []))); }, [people, d.stream]);

  // Upload anything left on disk from an earlier crash or closed tab (R4).
  useEffect(() => {
    void chunkStore.sessions().then((ids) => ids.forEach(async (id) => {
      if (id === localSess.current) return;
      const m = await chunkStore.manifest(id);
      if (!m) return;
      if (!m.chunks.length && m.stoppedAt) { await chunkStore.deleteSession(id); return; }
      void new UploadQueue(id, makeS3Send(m.userId)).resumeFromDisk();
    }));
  }, []);

  useLeaveGuard(rec.state !== 'idle' || upl.pending > 0);

  // Stop this computer's recorders cleanly (Leave, or navigating away): chunks already saved stay on disk and upload later.
  const stopLocal = async () => {
    const r = recorder.current, a = active.current, sr = screenRec.current; recorder.current = null; active.current = null; screenRec.current = null;
    await Promise.allSettled([r?.stop(), a?.stop(), sr?.stop()]);
  };
  useEffect(() => () => { void stopLocal(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const leave = async () => {
    if ((recording || upl.pending > 0) && !confirmLeave) { setConfirmLeave(true); return; }
    await stopLocal(); location.href = '/';
  };

  // Browsers block sound until you click: the first click or key press anywhere turns on call audio and sound effects.
  useEffect(() => {
    const unlock = () => { void live.startAudio().catch(() => {}); document.querySelectorAll('audio').forEach((a) => void a.play().catch(() => {})); void sfxContext().resume().catch(() => {}); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, [live.startAudio]); // eslint-disable-line react-hooks/exhaustive-deps

  const startRecording = () => store.set('rec', { state: 'countdown', at: Date.now() + 3000, by: me, pausedTotal: 0 });
  const pause = () => store.set('rec', { ...rec, state: 'paused', pausedAt: Date.now() });
  const resume = () => store.set('rec', { ...rec, state: 'rec', pausedTotal: rec.pausedTotal + (Date.now() - (rec.pausedAt ?? Date.now())), pausedAt: undefined });
  const stop = () => { store.set('rec', { state: 'idle', at: rec.at, by: rec.by, pausedTotal: rec.pausedTotal }); setConfirmStop(false); };
  const elapsed = rec.state === 'paused' ? (rec.pausedAt ?? now) - rec.at - rec.pausedTotal : now - rec.at - rec.pausedTotal;
  const fmt = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); const p = (n: number) => String(n).padStart(2, '0'); return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`; };

  // ---- media routing for games (G3, G21) ----
  const mutedIds = mutedForMe(store, me);
  const hiddenIds = hiddenForMe(store, me);

  const toggleShare = async () => {
    try { const ok = await live.setScreenShare(!sharing); if (ok) setSharing(!sharing); } catch { setSharing(false); }
  };
  const screenPerson = people.find((p) => p.screen);
  const showGame = !!game;
  const fullView = tab === 'games' || tab === 'topics';
  const setPlan = (p: PlanItem[]) => store.set('plan', p);
  const next = nextAfter(plan, nowId);
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= plan.length) return; const c = [...plan]; [c[i], c[j]] = [c[j], c[i]]; setPlan(c); };
  const addOverlay = (e: React.FormEvent) => { e.preventDefault(); if (!prompt.trim()) return; store.set(`ov.${pickTarget(prompt, people, me)}`, pickSticker(prompt)); setPrompt(''); setMenu(null); };
  const fixFor = (sym: Symptom) => fixThis(sym, { stream: d.stream, error: d.error, retry: d.retry, recording, muted, unmute: () => setMuted(false), callStatus: live.status, startAudio: live.startAudio,
    setEchoCancel: d.setEchoCancel, setHd: d.setHd, speakerId: d.speakerId, reconnect: () => { if (!recording) location.reload(); } });
  const runFixRef = useRef(fixFor); runFixRef.current = fixFor;
  // T1: same checks as the green room, kept fresh while the Setup tab is open.
  const [checks, setChecks] = useState<Check[]>([]);
  useEffect(() => { if (tab !== 'setup') return; void runChecks().then(setChecks); const t = setInterval(() => void runChecks().then(setChecks), 30_000); return () => clearInterval(t); }, [tab]);
  const runFix = async () => { setFix([{ label: 'Checking…', ok: true }]); setFix(await fixFor(symptom)); setChecks(await runChecks()); };

  const tile = (p: Person, style: React.CSSProperties) => (
    <PersonTile key={p.identity} p={p} style={style} localTrack={p.isLocal ? (processed ?? d.stream?.getVideoTracks()[0]) : undefined}
      hidden={hiddenIds.includes(p.identity)} mutedAudio={mutedIds.includes(p.identity)} sinkId={d.speakerId}
      overlay={overlays[p.identity]} face={faces[p.identity] ?? undefined}
      register={(el) => { if (el) els.current.set(p.identity, el); else els.current.delete(p.identity); }} />
  );

  const Controls = (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flex: '1 1 0', position: 'relative' }}>
        <button className="icon-btn danger" aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}><Icon name="mic" slash={muted} /></button>
        <button className="icon-btn danger" aria-pressed={!camOn} aria-label={camOn ? 'Turn camera off' : 'Turn camera on'} title="Camera" onClick={() => setCamOn(!camOn)}><Icon name="cam" slash={!camOn} /></button>
        <button className="icon-btn" aria-pressed={sharing} aria-label={sharing ? 'Stop sharing' : 'Share screen'} title={sharing ? 'Stop sharing' : 'Share screen'} onClick={toggleShare} disabled={live.status !== 'live'} style={{ background: sharing ? 'var(--accent)' : undefined, color: sharing ? 'var(--bg)' : undefined }}><Icon name="share" /></button>
        <button className="icon-btn" aria-label="React" title="React" onClick={() => setMenu(menu === 'react' ? null : 'react')}><Icon name="react" /></button>
        <button className="btn" style={{ minHeight: 52 }} onClick={() => setMenu(menu === 'overlay' ? null : 'overlay')}><Icon name="overlay" />Overlay</button>
        {menu === 'react' && (
          <div className="panel" style={{ position: 'absolute', bottom: 60, left: 0, padding: 8, display: 'flex', gap: 4, border: '1px solid var(--line)', zIndex: 6 }}>
            {REACTIONS.map((r) => <button key={r} className="btn" style={{ fontSize: 24, minHeight: 48, padding: '0 10px', background: 'transparent' }} onClick={() => { emit({ type: 'react', emoji: r }); setMenu(null); }}>{r}</button>)}
          </div>)}
        {menu === 'overlay' && (
          <form onSubmit={addOverlay} className="panel" style={{ position: 'absolute', bottom: 60, left: 0, width: 380, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--line)', zIndex: 6 }}>
            <input className="input" autoFocus placeholder={`e.g. Add a crown to ${people.find((p) => !p.isLocal) ? `${people.find((p) => !p.isLocal)!.name}’s` : 'my'} head`} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            <button className="btn btn-primary">Add overlay</button>
            {Object.entries(overlays).map(([id, o]) => (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <span style={{ fontSize: 22 }}>{o.emoji}</span><span style={{ flex: 1 }} className="muted">{people.find((p) => p.identity === id)?.name ?? ''}</span>
                <button type="button" className="btn" style={{ minHeight: 30 }} onClick={() => store.set(`ov.${id}`, null)}>Remove</button>
              </div>))}
          </form>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
        {rec.state === 'idle' && <button className="btn btn-rec" style={{ minHeight: 48, padding: '0 22px' }} onClick={startRecording} disabled={!d.stream}>● Record</button>}
        {rec.state === 'countdown' && <span style={{ fontWeight: 600 }}>Starting…</span>}
        {(rec.state === 'rec' || rec.state === 'paused') && (<>
          <span style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: rec.state === 'rec' ? 'var(--rec)' : 'var(--muted)' }}>● {fmt(elapsed)}</span>
          <button className="btn" title="Drop a marker (M)" onClick={addMarker}>Mark{markers.length ? ` · ${markers.length}` : ''}</button>
          <button className="btn" style={{ borderRadius: 999 }} onClick={rec.state === 'paused' ? resume : pause}>{rec.state === 'paused' ? 'Resume' : 'Pause'}</button>
          <button className="btn btn-rec" onClick={() => setConfirmStop(true)}>Stop</button>
        </>)}
        {confirmStop && (
          <div role="alertdialog" aria-label="Stop recording for everyone?" className="panel" style={{ position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)', width: 300, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--line)', zIndex: 5 }}>
            <strong>Stop recording for everyone?</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-rec" style={{ flex: 1, borderRadius: 8 }} onClick={stop}>Stop</button>
              <button className="btn" style={{ flex: 1 }} onClick={() => setConfirmStop(false)}>Keep recording</button>
            </div>
          </div>)}
      </div>
      <div style={{ display: 'flex', flex: '1 1 0', justifyContent: 'flex-end' }}>
        <div style={{ position: 'relative' }}>
          <button className="btn" style={{ minHeight: 52 }} onClick={leave}><Icon name="leave" />Leave</button>
          {confirmLeave && (
            <div role="alertdialog" aria-label="Leave the studio?" className="panel" style={{ position: 'absolute', bottom: 60, right: 0, width: 300, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--line)', zIndex: 5 }}>
              <strong>{recording ? 'Leave while recording?' : 'Leave before uploads finish?'}</strong>
              <span className="muted" style={{ fontSize: 13 }}>{recording ? 'Your recording stops here; everyone else keeps recording. ' : ''}Anything not uploaded yet finishes next time you open the studio on this computer.</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-rec" style={{ flex: 1, borderRadius: 8 }} onClick={leave}>Leave</button>
                <button className="btn" style={{ flex: 1 }} onClick={() => setConfirmLeave(false)}>Stay</button>
              </div>
            </div>)}
        </div>
      </div>
    </div>
  );

  const countdownLeft = rec.state === 'countdown' ? Math.max(1, Math.ceil((rec.at - now) / 1000)) : 0;
  const strip = people.filter((p) => !(screenPerson && p.identity === screenPerson.identity && false));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 24px' }}>
        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 16 }}>{title}</span>
        {(rec.state === 'rec' || rec.state === 'paused') && <span className="muted" style={{ fontSize: 13 }}>{rec.state === 'paused' ? 'Paused' : 'Recording'}{upl.pending > 6 ? ` · uploading ${upl.pending}` : ''}</span>}
        {rec.state === 'idle' && upl.pending > 0 && <span style={{ fontSize: 13, color: 'var(--warn)' }}>Uploading ({upl.pending} left) — keep this tab open</span>}
        {recError && <span style={{ fontSize: 13, color: 'var(--rec)' }}>{recError}</span>}
        {full && <span style={{ fontSize: 13, color: 'var(--warn)' }}>Storage full — still recording on this computer. Delete old episodes in the Library to upload.</span>}
        {live.status === 'connecting' && <span className="muted" style={{ fontSize: 13 }}>Connecting…</span>}
        <span style={{ flex: 1 }} />
        <nav aria-label="Studio panels" style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 14, background: 'var(--panel)' }}>
          {(['games', 'topics', 'setup'] as const).map((t) => (
            <button key={t} className="btn" aria-pressed={tab === t} onClick={() => setTab(tab === t ? null : t)}
              style={{ fontWeight: 600, background: tab === t ? 'var(--accent)' : 'var(--panel-2)', color: tab === t ? 'var(--bg)' : 'var(--text)' }}>
              <Icon name={t} size={20} />{t[0].toUpperCase() + t.slice(1)}
            </button>))}
        </nav>
      </header>

      <div style={{ flex: 1, display: 'flex', gap: 16, padding: '0 24px 16px', minHeight: 0 }}>
        <main style={{ flex: '1 1 0', minWidth: 0, display: fullView ? 'none' : 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ position: 'relative', aspectRatio: showGame || screenPerson ? undefined : '16 / 8', minHeight: showGame || screenPerson ? 480 : undefined, borderRadius: 16, overflow: 'hidden', background: showGame || screenPerson ? 'var(--bg)' : '#2B2F3A' }}>
            {showGame || screenPerson ? (
              <div style={{ display: 'flex', gap: 12, height: '100%', minHeight: 480 }}>
                <div className="panel" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: screenPerson && !showGame ? 0 : 24, overflow: 'auto', position: 'relative' }}>
                  {screenPerson && !showGame && <ScreenView track={screenPerson.screen!} register={(el) => (screenEl.current = el)} />}
                  {showGame && <GameBoard store={store} me={me} people={people} isHost />}
                  {screenPerson && showGame && <div style={{ display: 'none' }}><ScreenView track={screenPerson.screen!} register={(el) => (screenEl.current = el)} /></div>}
                  {screenPerson && (
                    <label className="muted" style={{ position: 'absolute', top: 10, right: 12, fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(14,15,18,.7)', padding: '4px 8px', borderRadius: 8 }}>
                      <input type="checkbox" checked={screenOnRec} onChange={(e) => store.set('screenRec', e.target.checked)} />Show screen in recording
                    </label>)}
                </div>
                <div style={{ width: '18%', minWidth: 140, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {strip.map((p) => tile(p, { flex: 1, minHeight: 0, borderRadius: 10 }))}
                </div>
              </div>
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
                {people.map((p) => tile(p, { width: '100%', height: '100%' }))}
              </div>
            )}
            {countdownLeft > 0 && <div style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-head)', fontSize: 120, fontWeight: 700 }}>{countdownLeft}</div>}
            {debate && (
              <div style={{ position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)', maxWidth: '86%', padding: '8px 18px', borderRadius: 14, background: 'rgba(14,15,18,.86)', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'var(--accent-text)' }}>TONIGHT’S DEBATE</div>
                <div style={{ fontWeight: 600 }}>{debate}</div>
                <button className="btn" aria-label="Hide debate caption" style={{ position: 'absolute', top: 4, right: 4, minHeight: 22, padding: 2, background: 'transparent' }} onClick={() => store.set('debate', null)}><Icon name="close" size={12} /></button>
              </div>)}
            {floaters.map((f) => <span key={f.id} className="floater" style={{ left: `${f.x}%` }}>{f.emoji}</span>)}
          </div>
          {Controls}
        </main>

        {tab && (
          <aside className="panel" aria-label={tab} style={{ flex: fullView ? '1 1 0' : '0 0 360px', padding: fullView ? 24 : 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', maxHeight: fullView ? 'none' : 'calc(100vh - 90px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 18 }}>{tab[0].toUpperCase() + tab.slice(1)}</h2>
              <button className="btn" aria-label="Close panel" style={{ background: 'transparent', minHeight: 32 }} onClick={() => setTab(null)}><Icon name="close" size={16} /></button>
            </div>

            {tab === 'games' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                {GAMES.map((g) => {
                  const ok = isPlayable(g, count); const on = boardOn(g.id);
                  return (
                    <div key={g.id} style={{ padding: 12, borderRadius: 10, background: ok ? 'var(--panel-2)' : 'transparent', border: ok ? 'none' : '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ flex: 1, fontWeight: 600, color: ok ? 'var(--text)' : '#8A8D96' }}>{g.name}</span>
                        {ok && <button className="btn btn-primary" style={{ minHeight: 32 }} onClick={() => { startGame(store, g.id, people); setTab(null); }}>{game?.id === g.id ? 'Restart' : 'Play'}</button>}
                      </div>
                      <span className="muted" style={{ fontSize: 13 }}>{ok ? g.line : `Needs ${g.min} players`}</span>
                      {ok && (
                        <div role="radiogroup" aria-label={`${g.name}: what the recording shows`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <span className="muted">Recording shows</span>
                          {([true, false] as const).map((v) => (
                            <button key={String(v)} role="radio" aria-checked={on === v} className="btn" onClick={() => store.set(`board.${g.id}`, v)}
                              style={{ minHeight: 26, padding: '0 10px', fontSize: 12, background: on === v ? 'var(--text)' : 'transparent', color: on === v ? 'var(--bg)' : 'var(--muted)', border: '1px solid var(--line)' }}>
                              {v ? 'Game + faces' : 'Faces only'}
                            </button>))}
                        </div>)}
                    </div>);
                })}
              </div>)}

            {tab === 'topics' && <Topics store={store} me={me} onAdd={(t) => setPlan([...plan, { id: `t${Date.now()}`, title: t, done: false }])} onShow={(t) => { store.set('debate', t); logEvent('debate', t); setTab(null); }} />}

            {tab === 'setup' && (<>
              <h3 style={{ fontSize: 16 }}>People</h3>
              <span className="muted" style={{ fontSize: 13 }}>{count} {count === 1 ? 'person' : 'people'} in the room{live.status === 'not-configured' ? ' · calls aren’t set up yet' : ''}</span>
              {people.map((p) => { const st = statuses[p.identity]; const warn = st && (st.err || (st.freeGb !== null && st.freeGb < 5) || st.up > 10 || p.quality === 'poor' || p.quality === 'lost'); return (
                <div key={p.identity} style={{ padding: 8, borderRadius: 10, background: 'var(--panel-2)', display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: warn ? 'var(--warn)' : 'var(--good)' }} />
                    <strong style={{ flex: 1 }}>{p.isLocal ? `${p.name} (you)` : p.name}</strong>
                    {!p.isLocal && <button className="btn" style={{ minHeight: 26, fontSize: 12 }} onClick={() => { store.set(`fix.${p.identity}`, null); emit({ type: 'fix', to: p.identity, symptom: 'general' }); }}>Fix this</button>}
                  </div>
                  {st ? <span className="muted">{[p.quality && !['unknown', ''].includes(p.quality) ? `${p.quality[0].toUpperCase()}${p.quality.slice(1)} connection` : null, st.up ? `Uploading ${st.up}` : st.done ? 'All uploaded' : null, st.freeGb !== null ? `${st.freeGb} GB free` : null, `Noise ${st.ns}`, st.err].filter(Boolean).join(' · ')}</span> : <span className="muted">Connecting…</span>}
                  {fixes[p.identity] && !p.isLocal && <span style={{ color: fixes[p.identity].every((f) => f.ok) ? 'var(--good)' : 'var(--warn)' }}>{fixes[p.identity].map((f) => f.note ? `${f.label}: ${f.note}` : `${f.label} ok`).join(' · ')}</span>}
                </div>); })}
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" readOnly value={invite} aria-label="Invite link" style={{ flex: 1, minWidth: 0 }} />
                <button className="btn btn-primary" disabled={!invite} onClick={() => navigator.clipboard.writeText(invite)}>Copy</button>
              </div>

              <h3 style={{ fontSize: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>Plan</h3>
              {agenda && <div className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1 }}>Agenda from {new Date(agenda.receivedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {agenda.items.length} items</span>
                <button className="btn" style={{ minHeight: 28, fontSize: 12 }} onClick={applyAgenda}>Use it</button>
              </div>}
              <div><span style={{ color: 'var(--accent-text)', fontWeight: 600 }}>Now</span> {plan.find((p) => p.id === nowId)?.title ?? '—'} <span className="muted">· Next: {next?.title ?? 'All done'}</span></div>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {plan.map((p, i) => (
                  <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderTop: '1px solid var(--line)' }}>
                    <input type="checkbox" aria-label="Done" checked={p.done} onChange={() => setPlan(plan.map((x) => x.id === p.id ? { ...x, done: !x.done } : x))} />
                    <PlanTitle value={p.title} done={p.done} now={p.id === nowId} onChange={(t) => setPlan(plan.map((x) => x.id === p.id ? { ...x, title: t } : x))} />
                    {p.id !== nowId && !p.done && <button className="btn" style={{ minHeight: 28, fontSize: 12 }} onClick={() => store.set('now', p.id)}>Start</button>}
                    <button className="btn" aria-label="Move up" style={{ minHeight: 28, padding: 4, background: 'transparent' }} onClick={() => move(i, -1)}><Icon name="up" size={16} /></button>
                    <button className="btn" aria-label="Move down" style={{ minHeight: 28, padding: 4, background: 'transparent' }} onClick={() => move(i, 1)}><Icon name="down" size={16} /></button>
                    <button className="btn" aria-label="Remove" style={{ minHeight: 28, padding: 4, background: 'transparent' }} onClick={() => setPlan(plan.filter((x) => x.id !== p.id))}><Icon name="close" size={14} /></button>
                  </li>))}
              </ol>
              <button className="btn" style={{ alignSelf: 'flex-start', background: 'transparent', color: 'var(--accent-text)' }} onClick={() => setPlan([...plan, { id: `n${Date.now()}`, title: 'New item', done: false }])}>Add item</button>

              <h3 style={{ fontSize: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>Sound effects</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                {SOUNDS.map((snd, i) => (
                  <button key={snd.id} className="btn" style={{ minHeight: 64, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', padding: 8 }} onClick={() => playSfx(i)}>
                    <span style={{ color: 'var(--accent-text)', fontWeight: 700 }}>{i + 1}</span><span style={{ fontSize: 13 }}>{snd.name}</span>
                  </button>))}
                <label className="btn" style={{ minHeight: 64, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', padding: 8, cursor: 'pointer' }}
                  onClick={(e) => { if (customSound && !(e.target as HTMLElement).closest('[data-replace]')) { e.preventDefault(); playSfx(8); } }}>
                  <span style={{ color: 'var(--accent-text)', fontWeight: 700 }}>9</span>
                  <span style={{ fontSize: 13 }}>{sfxBusy || customSound?.name || 'Upload a sound'}</span>
                  {customSound && <span data-replace className="muted" style={{ fontSize: 11, textDecoration: 'underline' }}>Replace</span>}
                  <input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadSound(f); e.target.value = ''; }} />
                </label>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>Keys 1–9 play them for everyone and into the recording. M drops a marker.</span>

              <h3 style={{ fontSize: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>Set</h3>
              <span className="muted" style={{ fontSize: 13 }}>{recording ? 'Locked while recording.' : 'Everyone gets the same room, each from their own spot in it.'}</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                {SETS.map((s) => (
                  <button key={s.id} className="btn" aria-pressed={set === s.id} disabled={(live.status !== 'live' && s.id !== 'none') || recording} onClick={() => store.set('set', s.id)}
                    style={{ minHeight: 56, flexDirection: 'column', gap: 4, padding: 6, outline: set === s.id ? '2px solid var(--accent)' : 'none', backgroundImage: ['studio', 'city', 'library'].includes(s.id) ? `url(/sets/${s.id}-preview.jpg)` : undefined, backgroundSize: 'cover', textShadow: '0 1px 3px #000' }}>
                    {s.name}
                  </button>))}
              </div>

              <h3 style={{ fontSize: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>Your audio and video</h3>
              {recording && <span className="muted" style={{ fontSize: 12 }}>Devices are locked while recording so nothing interrupts it.</span>}
              <MicMeter stream={d.stream} />
              <label className="field">Noise cancellation
                <select className="select" value={d.noise} disabled={recording} onChange={(e) => d.setNoise(e.target.value as typeof d.noise)}>
                  <option value="off">Off</option><option value="standard">Standard</option><option value="strong">Strong</option>
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" disabled={recording} checked={d.echoCancel} onChange={(e) => d.setEchoCancel(e.target.checked)} />Echo cancellation</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" disabled={recording} checked={d.hd} onChange={(e) => d.setHd(e.target.checked)} />1080p camera (off = 720p)</label>
              <label className="field">Microphone
                <select className="select" disabled={recording} value={d.micId} onChange={(e) => d.setMicId(e.target.value)}>{d.lists.mics.map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microphone'}</option>)}</select>
              </label>
              <label className="field">Speakers
                <select className="select" value={d.speakerId} onChange={(e) => d.setSpeakerId(e.target.value)}>{d.lists.speakers.map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label || 'Speakers'}</option>)}</select>
              </label>
              <label className="field">Camera
                <select className="select" disabled={recording} value={d.camId} onChange={(e) => d.setCamId(e.target.value)}>{d.lists.cams.map((c) => <option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>)}</select>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="select" aria-label="What's wrong?" value={symptom} onChange={(e) => setSymptom(e.target.value as Symptom)} style={{ flex: 1, minWidth: 0 }}>
                  {SYMPTOMS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
                <button className="btn btn-primary" onClick={runFix}>Fix this</button>
                <button className="btn" onClick={() => testTone(d.speakerId)}>Test speakers</button>
              </div>
              {fix && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>{fix.map((s) => <li key={s.label} style={{ color: s.ok ? 'var(--good)' : 'var(--warn)' }}>{s.label}{s.note ? ` — ${s.note}` : ''}</li>)}</ul>}
              <details open={checks.some((c) => !c.ok)}>
                <summary style={{ cursor: 'pointer', fontSize: 14, color: checks.some((c) => !c.ok) ? 'var(--warn)' : 'var(--good)' }}>
                  Troubleshooting · {checks.length ? (checks.every((c) => c.ok) ? 'all checks passed' : `${checks.filter((c) => c.ok).length} of ${checks.length} checks passed`) : 'checking…'}
                </summary>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 8 }}>
                  {checks.map((c) => (
                    <div key={c.label}>
                      <div className="muted" style={{ fontSize: 12 }}>{c.label}</div>
                      <div style={{ fontWeight: 600 }}>{c.value}</div>
                      {c.note && <div style={{ fontSize: 12, color: c.ok ? 'var(--good)' : 'var(--warn)' }}>{c.note}</div>}
                    </div>))}
                </div>
              </details>
            </>)}
          </aside>
        )}
      </div>
      {fullView && <div style={{ padding: '0 24px 16px' }}>{Controls}</div>}
    </div>
  );
}

function PlanTitle({ value, done, now, onChange }: { value: string; done: boolean; now: boolean; onChange: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input className="input" aria-label="Plan item" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onChange(v)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    style={{ flex: 1, minWidth: 0, minHeight: 34, border: 0, background: 'transparent', textDecoration: done ? 'line-through' : 'none', fontWeight: now ? 600 : 400 }} />;
}

/** One person's tile: video (mirrored for yourself), their audio, and any overlay. No name tag (U1). */
function PersonTile({ p, style, localTrack, hidden, mutedAudio, sinkId, overlay, face, register }: {
  p: Person; style: React.CSSProperties; localTrack?: MediaStreamTrack; hidden: boolean; mutedAudio: boolean; sinkId: string;
  overlay?: Overlay; face?: FaceBox; register: (el: HTMLVideoElement | null) => void;
}) {
  const v = useRef<HTMLVideoElement | null>(null); const a = useRef<HTMLAudioElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0, vw: 0, vh: 0 });
  const track = p.isLocal ? localTrack : p.video;
  useEffect(() => { if (v.current) v.current.srcObject = track ? new MediaStream([track]) : null; }, [track]);
  useEffect(() => { if (a.current) a.current.srcObject = p.audio ? new MediaStream([p.audio]) : null; }, [p.audio]);
  useEffect(() => { if (a.current) a.current.muted = mutedAudio; }, [mutedAudio]);
  useEffect(() => { const el = a.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null; if (el?.setSinkId && sinkId) void el.setSinkId(sinkId).catch(() => {}); }, [sinkId]);
  const ref = useCallback((el: HTMLVideoElement | null) => { v.current = el; register(el); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = v.current; if (!el) return;
    const upd = () => setBox({ w: el.clientWidth, h: el.clientHeight, vw: el.videoWidth, vh: el.videoHeight });
    const ro = new ResizeObserver(upd); ro.observe(el); el.addEventListener('loadedmetadata', upd); el.addEventListener('resize', upd);
    return () => { ro.disconnect(); el.removeEventListener('loadedmetadata', upd); el.removeEventListener('resize', upd); };
  }, []);
  let sticker: React.ReactNode = null;
  if (overlay && box.vw && !hidden) {
    const s = Math.max(box.w / box.vw, box.h / box.vh); const pw = box.vw * s, ph = box.vh * s;
    const pos = place(overlay, face, pw, ph, p.isLocal);
    sticker = <span aria-hidden style={{ position: 'absolute', left: (box.w - pw) / 2 + pos.x, top: (box.h - ph) / 2 + pos.y, fontSize: pos.size, lineHeight: 1, transform: 'translate(-50%, -50%)', pointerEvents: 'none', transition: 'left .12s linear, top .12s linear' }}>{overlay.emoji}</span>;
  }
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: '#2B2F3A', ...style }}>
      <video ref={ref} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: p.isLocal ? 'scaleX(-1)' : undefined, visibility: hidden ? 'hidden' : 'visible' }} />
      {hidden && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="muted">Hidden until the reveal</div>}
      {!hidden && (!track || track.readyState === 'ended' || !track.enabled) && <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}><Icon name="cam" slash size={36} /></div>}
      {sticker}
      {!p.isLocal && <audio ref={a} autoPlay />}
    </div>
  );
}

function ScreenView({ track, register }: { track: MediaStreamTrack; register: (el: HTMLVideoElement | null) => void }) {
  const ref = useCallback((el: HTMLVideoElement | null) => { register(el); if (el) el.srcObject = new MediaStream([track]); }, [track]); // eslint-disable-line react-hooks/exhaustive-deps
  return <video ref={ref} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />;
}

/** Topics (C1–C3): today's headlines and evergreen debates. Upvote, add to the plan, or put one on screen. */
function Topics({ store, me, onAdd, onShow }: { store: import('@/lib/sync').SharedStore; me: string; onAdd: (t: string) => void; onShow: (t: string) => void }) {
  const [data, setData] = useState<{ news: { section: string; title: string; source: string; link: string }[]; debates: string[] } | null>(null);
  const [filter, setFilter] = useState('All');
  const [added, setAdded] = useState<Set<string>>(new Set());
  useEffect(() => { fetch('/api/topics').then((r) => r.json()).then(setData).catch(() => setData({ news: [], debates: [] })); }, []);
  const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);
  const votes = (t: string) => Object.keys(store.under(`up.${key(t)}.`)).length;
  const mine = (t: string) => !!store.get(`up.${key(t)}.${me}`);
  if (!data) return <span className="muted">Loading…</span>;
  const items = [...data.debates.map((t) => ({ t, tag: 'Debate', sub: '', link: '' })), ...data.news.map((n) => ({ t: n.title, tag: n.section, sub: n.source, link: n.link }))]
    .filter((x) => filter === 'All' || x.tag === filter).sort((a, b) => votes(b.t) - votes(a.t));
  const tags = ['All', 'Debate', ...new Set(data.news.map((n) => n.section))];
  return (<>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{tags.map((t) => <button key={t} className="btn" style={{ minHeight: 32, background: filter === t ? 'var(--accent)' : undefined, color: filter === t ? 'var(--bg)' : undefined }} onClick={() => setFilter(t)}>{t}</button>)}</div>
    {!data.news.length && filter === 'All' && <span className="muted" style={{ fontSize: 13 }}>Headlines couldn’t load right now — showing debates.</span>}
    {items.map((x) => (
      <div key={x.tag + x.t} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
        <button className="btn" aria-pressed={mine(x.t)} title="Upvote" style={{ minHeight: 40, minWidth: 48, flexDirection: 'column', gap: 0, padding: 4, background: mine(x.t) ? 'var(--accent)' : undefined, color: mine(x.t) ? 'var(--bg)' : undefined }}
          onClick={() => store.set(`up.${key(x.t)}.${me}`, mine(x.t) ? null : 1)}>▲<span style={{ fontSize: 12 }}>{votes(x.t)}</span></button>
        <div style={{ flex: 1 }}>
          <span className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>{x.tag.toUpperCase()}</span>
          <div>{x.link ? <a href={x.link} target="_blank" rel="noreferrer" style={{ color: 'var(--text)', textDecoration: 'none' }}>{x.t}</a> : x.t}</div>
          {x.sub && <div className="muted" style={{ fontSize: 12 }}>{x.sub}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button className="btn" style={{ minHeight: 30, fontSize: 12 }} onClick={() => onShow(x.t)}>Show on screen</button>
          <button className="btn" style={{ minHeight: 30, fontSize: 12 }} disabled={added.has(x.t)} onClick={() => { onAdd(x.t); setAdded(new Set(added).add(x.t)); }}>{added.has(x.t) ? 'Added' : 'Add to plan'}</button>
        </div>
      </div>))}
  </>);
}

/** Live mic level (T2). */
function MicMeter({ stream }: { stream: MediaStream | null }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = stream?.getAudioTracks()[0]; if (!t) return;
    const ctx = new AudioContext(); const a = ctx.createAnalyser(); a.fftSize = 1024; ctx.createMediaStreamSource(new MediaStream([t])).connect(a);
    const buf = new Float32Array(a.fftSize); let raf = 0;
    const loop = () => { a.getFloatTimeDomainData(buf); let p = 0; for (const v of buf) p = Math.max(p, Math.abs(v)); if (bar.current) { bar.current.style.width = `${Math.min(100, Math.sqrt(p) * 110)}%`; bar.current.style.background = p > 0.9 ? 'var(--rec)' : 'var(--good)'; } raf = requestAnimationFrame(loop); };
    loop(); return () => { cancelAnimationFrame(raf); void ctx.close(); };
  }, [stream]);
  return (<div><span className="muted" style={{ fontSize: 12 }}>Mic level</span><div style={{ height: 6, borderRadius: 3, background: 'var(--panel-2)', marginTop: 4 }}><div ref={bar} style={{ height: 6, borderRadius: 3, width: 0, transition: 'width .08s linear' }} /></div></div>);
}
