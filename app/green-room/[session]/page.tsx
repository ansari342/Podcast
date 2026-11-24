'use client';
import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { useDevices } from '@/hooks/useDevices';
import { runChecks, type Check } from '@/lib/checks';
import { fixThis, testTone, type FixStep } from '@/lib/fixThis';
import { CompanionEntry } from '@/components/CompanionEntry';

/** Green room (brief: Screens → 2). Only mic + speaker menus are visible; everything else is under "More settings and troubleshooting". */
export default function GreenRoom({ params }: { params: Promise<{ session: string }> }) {
  const { session } = use(params);
  const d = useDevices();
  const video = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<Check[]>([]);
  const [fix, setFix] = useState<FixStep[] | null>(null);
  const [name, setName] = useState('');
  const [hasName, setHasName] = useState(true);
  useEffect(() => { const n = localStorage.getItem('st3-name'); setHasName(!!n); setName(n ?? ''); }, []);
  const runFix = async () => { setFix([{ label: 'Checking…', ok: true }]); setFix(await fixThis('general', { stream: d.stream, error: d.error, retry: d.retry, speakerId: d.speakerId })); setChecks(await runChecks()); };

  useEffect(() => { if (video.current && d.stream) video.current.srcObject = d.stream; }, [d.stream]);
  useEffect(() => { runChecks().then(setChecks); }, []);
  const failed = checks.filter((c) => !c.ok);

  return (
    <>
      <header className="topnav"><div className="brand"><span className="brand-mark">3</span>Studio Three</div></header>
      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 24px', display: 'flex', flexWrap: 'wrap', gap: 40 }}>
        <div style={{ flex: '1 1 100%' }}><CompanionEntry room={session} /></div>
        <section style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <video ref={video} autoPlay muted playsInline style={{ width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', borderRadius: 16, background: '#2B2F3A', transform: 'scaleX(-1)' }} />
          {d.error && <p style={{ color: 'var(--warn)' }}>Camera or mic blocked: {d.error} <button className="btn" onClick={runFix}>Fix this</button></p>}
          <button className="btn" style={{ alignSelf: 'flex-start', background: 'transparent', color: failed.length ? 'var(--warn)' : 'var(--good)' }} aria-expanded={open} onClick={() => setOpen(!open)}>
            {failed.length ? `${failed.length} ${failed.length === 1 ? 'thing needs' : 'things need'} a look` : 'All set'} <span className="muted">· {open ? 'Hide' : 'Settings and troubleshooting'}</span>
          </button>
          {open && (
            <div className="panel" style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {checks.map((c) => (
                <div key={c.label}>
                  <div className="muted" style={{ fontSize: 12 }}>{c.label}</div>
                  <div style={{ fontWeight: 600 }}>{c.value}</div>
                  {c.note && <div style={{ fontSize: 12, color: c.ok ? 'var(--good)' : 'var(--warn)' }}>{c.note}</div>}
                </div>
              ))}
              <label className="field">Camera
                <select className="select" value={d.camId} onChange={(e) => d.setCamId(e.target.value)}>
                  {d.lists.cams.map((c) => <option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'end' }}><input type="checkbox" checked={d.noiseCancel} onChange={(e) => d.setNoiseCancel(e.target.checked)} />Noise cancellation</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
                <button className="btn btn-primary" onClick={runFix}>Fix this</button>
                <button className="btn" onClick={() => testTone(d.speakerId)}>Test speakers</button>
              </div>
              {fix && <ul style={{ gridColumn: '1 / -1', margin: 0, paddingLeft: 18, fontSize: 14 }}>{fix.map((s) => <li key={s.label} style={{ color: s.ok ? 'var(--good)' : 'var(--warn)' }}>{s.label}{s.note ? ` — ${s.note}` : ''}</li>)}</ul>}
            </div>
          )}
        </section>
        <aside style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {!hasName && <label className="field">Your first name<input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></label>}
          <label className="field">Microphone
            <select className="select" value={d.micId} onChange={(e) => d.setMicId(e.target.value)}>
              {d.lists.mics.map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microphone'}</option>)}
            </select>
          </label>
          <label className="field">Speakers
            <select className="select" value={d.speakerId} onChange={(e) => d.setSpeakerId(e.target.value)}>
              {d.lists.speakers.map((s) => <option key={s.deviceId} value={s.deviceId}>{s.label || 'Speakers'}</option>)}
            </select>
          </label>
          <Link className="btn btn-primary" style={{ minHeight: 52, pointerEvents: !hasName && !name.trim() ? 'none' : undefined, opacity: !hasName && !name.trim() ? 0.5 : 1 }} href={`/studio/${session}`} onClick={() => { if (name.trim()) localStorage.setItem('st3-name', name.trim()); }}>Enter studio</Link>
        </aside>
      </main>
    </>
  );
}
