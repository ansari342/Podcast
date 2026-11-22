'use client';
import Link from 'next/link';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { useDevices } from '@/hooks/useDevices';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { GAMES, TRIVIA, isPlayable, rulesFor, type Game } from '@/lib/games';
import { SAMPLE_PLAN, nextAfter, type PlanItem } from '@/lib/plan';
import { SOUNDS, playSound } from '@/lib/sfx';
import { LocalRecorder } from '@/lib/recorder/LocalRecorder';
import { UploadQueue } from '@/lib/recorder/uploadQueue';
import { makeS3Send } from '@/lib/recorder/s3Send';
import { useLiveRoom } from '@/hooks/useLiveRoom';
import { RemoteTile } from '@/components/RemoteTile';

type Tab = 'games' | 'topics' | 'setup' | null;
type RecState = 'idle' | 'countdown' | 'rec' | 'paused';

/**
 * Studio (brief: Screens → 3). One screen for host and guest; role hides host-only controls.
 * Live call: TODO(S1) — remote participants come from LiveKit; until then the stage shows this browser's camera
 * plus placeholder seats for invited people. People count = people in the room (G14).
 */
export default function Studio({ params }: { params: Promise<{ session: string }> }) {
  const { session } = use(params);
  const sp = useSearchParams();
  const isHost = sp.get('role') !== 'guest';
  const title = sp.get('title') ?? 'Episode';
  const d = useDevices();

  const [identity] = useState(() => (isHost ? 'host' : 'guest') + '-' + Math.random().toString(36).slice(2, 7));
  const live = useLiveRoom(session, identity, d.stream);
  const people = Math.min(3, 1 + live.remotes.length); // G14: count = people in the room

  const [tab, setTab] = useState<Tab>(null);
  const [muted, setMuted] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [rec, setRec] = useState<RecState>('idle');
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [confirmStop, setConfirmStop] = useState(false);
  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [boardOn, setBoardOn] = useState<Record<string, boolean>>(() => Object.fromEntries(GAMES.map((g) => [g.id, g.boardOnRecording])));
  const [triviaIdx, setTriviaIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [plan, setPlan] = useState<PlanItem[]>(SAMPLE_PLAN);
  const [nowId, setNowId] = useState<string | null>(SAMPLE_PLAN[0].id);
  const [chunks, setChunks] = useState(0);
  const recorder = useRef<LocalRecorder | null>(null);
  const uploader = useRef<UploadQueue | null>(null);
  const startAt = useRef(0);
  const pausedMs = useRef(0);

  useLeaveGuard(rec !== 'idle');
  const attach = (el: HTMLVideoElement | null) => { if (el && d.stream && el.srcObject !== d.stream) el.srcObject = d.stream; };
  useEffect(() => { d.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted)); }, [muted, d.stream]);
  useEffect(() => { d.stream?.getVideoTracks().forEach((t) => (t.enabled = camOn)); }, [camOn, d.stream]);
  useEffect(() => {
    if (rec !== 'rec') return;
    const t = setInterval(() => setElapsed(Date.now() - startAt.current), 500);
    return () => clearInterval(t);
  }, [rec]);

  // S3: anyone can start. TODO(R6): host broadcasts the epoch over the realtime channel so all browsers share it.
  const startRecording = () => {
    if (!d.stream) return;
    setRec('countdown'); setCount(3);
    [2, 1].forEach((n, i) => setTimeout(() => setCount(n), (i + 1) * 900));
    setTimeout(async () => {
      const epoch = Date.now();
      startAt.current = epoch; pausedMs.current = 0;
      uploader.current = new UploadQueue(session, makeS3Send(identity));
      recorder.current = new LocalRecorder(session, isHost ? 'host' : 'guest', epoch, {
        onChunk: (m) => { setChunks((n) => n + 1); uploader.current?.add(m); },
      });
      await recorder.current.start(d.stream!);
      setRec('rec');
    }, 2700);
  };
  const pause = () => { recorder.current?.pause(); pausedMs.current = Date.now() - startAt.current; setRec('paused'); };
  const resume = () => { recorder.current?.resume(); startAt.current = Date.now() - pausedMs.current; setRec('rec'); };
  const stop = async () => { await recorder.current?.stop(); setRec('idle'); setConfirmStop(false); };

  const fmt = (ms: number) => { const s = Math.floor(ms / 1000); const p = (n: number) => String(n).padStart(2, '0'); return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`; };
  const playable = useMemo(() => GAMES.filter((g) => isPlayable(g, people)).length, [people]);
  const fullView = tab === 'games' || tab === 'topics';
  const next = nextAfter(plan, nowId);
  const move = (i: number, dir: -1 | 1) => setPlan((l) => { const j = i + dir; if (j < 0 || j >= l.length) return l; const c = [...l]; [c[i], c[j]] = [c[j], c[i]]; return c; });

  const Controls = (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flex: '1 1 0' }}>
        <button className="icon-btn danger" aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}><Icon name="mic" slash={muted} /></button>
        <button className="icon-btn danger" aria-pressed={!camOn} aria-label={camOn ? 'Turn camera off' : 'Turn camera on'} title="Camera" onClick={() => setCamOn(!camOn)}><Icon name="cam" slash={!camOn} /></button>
        <button className="icon-btn" aria-label="Share screen" title="Share screen (TODO V1)"><Icon name="share" /></button>
        <button className="icon-btn" aria-label="React" title="React (TODO RX1)"><Icon name="react" /></button>
        <button className="btn" style={{ minHeight: 52 }} title="AI overlay (TODO AO1–AO4)"><Icon name="overlay" />Overlay</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
        {rec === 'idle' && <button className="btn btn-rec" style={{ minHeight: 48, padding: '0 22px' }} onClick={startRecording} disabled={!d.stream}>● Record</button>}
        {rec === 'countdown' && <span style={{ fontWeight: 600 }}>Starting in {count}…</span>}
        {(rec === 'rec' || rec === 'paused') && (<>
          <span style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(rec === 'paused' ? pausedMs.current : elapsed)}</span>
          <button className="btn" style={{ borderRadius: 999 }} onClick={rec === 'paused' ? resume : pause}>{rec === 'paused' ? 'Resume' : 'Pause'}</button>
          <button className="btn btn-rec" onClick={() => setConfirmStop(true)}>Stop</button>
        </>)}
        {confirmStop && (
          <div role="alertdialog" aria-label="Stop recording for everyone?" className="panel" style={{ position: 'absolute', bottom: 60, left: '50%', transform: 'translateX(-50%)', width: 300, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--line)', zIndex: 5 }}>
            <strong>Stop recording for everyone?</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-rec" style={{ flex: 1, borderRadius: 8 }} onClick={stop}>Stop</button>
              <button className="btn" style={{ flex: 1 }} onClick={() => setConfirmStop(false)}>Keep recording</button>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flex: '1 1 0', justifyContent: 'flex-end' }}>
        <Link className="btn" style={{ minHeight: 52 }} href="/"><Icon name="leave" />Leave</Link>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 24px' }}>
        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 16 }}>{title}</span>
        {rec !== 'idle' && rec !== 'countdown' && <span className="muted" title="Active video + one per person (R5)">● Recording {people + 1} videos · {chunks} chunks saved</span>}
        <span style={{ flex: 1 }} />
        <nav aria-label="Studio panels" style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 14, background: 'var(--panel)' }}>
          {(['games', 'topics', 'setup'] as const).map((t) => (
            <button key={t} className="btn" aria-pressed={tab === t} onClick={() => setTab(tab === t ? null : t)}
              style={{ fontWeight: 600, background: tab === t ? 'var(--accent)' : 'var(--panel-2)', color: tab === t ? 'var(--bg)' : 'var(--text)' }}>
              <Icon name={t} size={20} />{t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      <div style={{ flex: 1, display: 'flex', gap: 16, padding: '0 24px 16px' }}>
        {!fullView && (
          <main style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ position: 'relative', aspectRatio: '16 / 8', borderRadius: 16, overflow: 'hidden', background: '#2B2F3A' }}>
              {activeGame ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 12, padding: 12, background: 'var(--bg)' }}>
                  <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 24 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--accent-text)' }}>NOW PLAYING</span>
                    <h2 style={{ fontSize: 30 }}>{activeGame.name}</h2>
                    {activeGame.id === 'trivia' ? (<>
                      <span style={{ fontSize: 22, fontWeight: 600 }}>{TRIVIA[triviaIdx % TRIVIA.length].q}</span>
                      {revealed && <span style={{ padding: '10px 18px', borderRadius: 12, background: '#13261C', color: '#CDEFD9', fontWeight: 600 }}>{TRIVIA[triviaIdx % TRIVIA.length].a}</span>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        {!revealed && <button className="btn btn-primary" onClick={() => setRevealed(true)}>Reveal answer</button>}
                        <button className="btn" onClick={() => { setTriviaIdx(triviaIdx + 1); setRevealed(false); }}>Next question</button>
                      </div>
                    </>) : <span className="muted">{rulesFor(activeGame, people)} — game board TODO (G8, G9)</span>}
                    {isHost && <button className="btn" onClick={() => setActiveGame(null)}>End game</button>}
                  </div>
                  <div style={{ width: '18%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <video ref={attach} autoPlay muted playsInline style={{ flex: 1, minHeight: 0, objectFit: 'cover', borderRadius: 10, transform: 'scaleX(-1)' }} />
                    {live.remotes.slice(0, 2).map((r) => <RemoteTile key={r.identity} r={r} style={{ flex: 1, minHeight: 0, borderRadius: 10 }} />)}
                  </div>
                </div>
              ) : (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${people}, minmax(0, 1fr))`, gap: 0 }}>
                  <video ref={attach} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                  {live.remotes.slice(0, 2).map((r) => <RemoteTile key={r.identity} r={r} style={{ width: '100%', height: '100%' }} />)}
                </div>
              )}
              {rec === 'countdown' && <div style={{ position: 'absolute', inset: 0, background: 'rgba(14,15,18,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-head)', fontSize: 120, fontWeight: 700 }}>{count}</div>}
            </div>
            {Controls}
          </main>
        )}

        {tab && (
          <aside className="panel" aria-label={tab} style={{ flex: fullView ? '1 1 0' : '0 0 360px', padding: fullView ? 24 : 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', maxHeight: fullView ? 'none' : 760 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 18 }}>{tab[0].toUpperCase() + tab.slice(1)}</h2>
              <button className="btn" aria-label="Close panel" style={{ background: 'transparent', minHeight: 32 }} onClick={() => setTab(null)}><Icon name="close" size={16} /></button>
            </div>

            {tab === 'games' && GAMES.map((g) => {
              const ok = isPlayable(g, people);
              return (
                <div key={g.id} style={{ padding: 12, borderRadius: 10, background: ok ? 'var(--panel-2)' : 'transparent', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, fontWeight: 600, color: ok ? 'var(--text)' : '#8A8D96' }}>{g.name}</span>
                    {ok && isHost && <button className="btn" style={{ minHeight: 32 }} onClick={() => { setActiveGame(g); setTab(null); setRevealed(false); }}>Start</button>}
                  </div>
                  <span className="muted" style={{ fontSize: 13 }}>{ok ? g.line : `Needs ${g.min} players`}</span>
                  {ok && isHost && (
                    <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }} className="muted">
                      <input type="checkbox" checked={boardOn[g.id]} onChange={(e) => setBoardOn({ ...boardOn, [g.id]: e.target.checked })} />
                      {boardOn[g.id] ? 'Board on recording' : 'Faces only'}
                    </label>
                  )}
                </div>
              );
            })}
            {tab === 'games' && <span className="muted" style={{ fontSize: 12 }}>{playable} of {GAMES.length} playable</span>}

            {tab === 'topics' && <p className="muted">Live topics feed — TODO (C1–C4): needs the trends source and YouTube Analytics.</p>}

            {tab === 'setup' && (<>
              <h3 style={{ fontSize: 16 }}>People</h3>
              <span className="muted" style={{ fontSize: 13 }}>{people} {people === 1 ? 'person' : 'people'} in the room{live.status === 'not-configured' ? ' · call not configured yet (LiveKit keys)' : ''}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" readOnly value={typeof window !== 'undefined' ? `${window.location.origin}/green-room/${session}` : ''} aria-label="Invite link" style={{ flex: 1, minWidth: 0 }} />
                <button className="btn btn-primary" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/green-room/${session}`)}>Copy</button>
              </div>

              <h3 style={{ fontSize: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>Plan</h3>
              <div><span style={{ color: 'var(--accent-text)', fontWeight: 600 }}>Now</span> {plan.find((p) => p.id === nowId)?.title ?? '—'} <span className="muted">· Next: {next?.title ?? 'All done'}</span></div>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {plan.map((p, i) => (
                  <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderTop: '1px solid var(--line)' }}>
                    <input type="checkbox" aria-label="Done" checked={p.done} onChange={() => setPlan(plan.map((x) => x.id === p.id ? { ...x, done: !x.done } : x))} />
                    <input className="input" aria-label="Plan item" value={p.title} onChange={(e) => setPlan(plan.map((x) => x.id === p.id ? { ...x, title: e.target.value } : x))}
                      style={{ flex: 1, minWidth: 0, minHeight: 34, border: 0, background: 'transparent', textDecoration: p.done ? 'line-through' : 'none', fontWeight: p.id === nowId ? 600 : 400 }} />
                    {p.id !== nowId && !p.done && <button className="btn" style={{ minHeight: 28, fontSize: 12 }} onClick={() => setNowId(p.id)}>Start</button>}
                    <button className="btn" aria-label="Move up" style={{ minHeight: 28, padding: 4, background: 'transparent' }} onClick={() => move(i, -1)}><Icon name="up" size={16} /></button>
                    <button className="btn" aria-label="Move down" style={{ minHeight: 28, padding: 4, background: 'transparent' }} onClick={() => move(i, 1)}><Icon name="down" size={16} /></button>
                  </li>
                ))}
              </ol>
              <button className="btn" style={{ alignSelf: 'flex-start', background: 'transparent', color: 'var(--accent-text)' }} onClick={() => setPlan([...plan, { id: `n${Date.now()}`, title: 'New item', done: false }])}>Add item</button>

              <h3 style={{ fontSize: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>Sound effects</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                {SOUNDS.map((s, i) => (
                  <button key={s} className="btn" style={{ minHeight: 64, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', padding: 8 }} onClick={() => playSound(i)}>
                    <span style={{ color: 'var(--accent-text)', fontWeight: 700 }}>{i + 1}</span><span style={{ fontSize: 13 }}>{s}</span>
                  </button>
                ))}
              </div>

              <h3 style={{ fontSize: 16, borderTop: '1px solid var(--line)', paddingTop: 16 }}>Your audio and video</h3>
              <label className="field">Microphone
                <select className="select" value={d.micId} onChange={(e) => d.setMicId(e.target.value)}>{d.lists.mics.map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microphone'}</option>)}</select>
              </label>
              <label className="field">Camera
                <select className="select" value={d.camId} onChange={(e) => d.setCamId(e.target.value)}>{d.lists.cams.map((c) => <option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>)}</select>
              </label>
              <span className="muted" style={{ fontSize: 12 }}>Noise cancellation, background, layout and Fix this — TODO (S9, S12, T4).</span>
            </>)}
          </aside>
        )}
      </div>
      {fullView && <div style={{ padding: '0 24px 16px' }}>{Controls}</div>}
    </div>
  );
}
