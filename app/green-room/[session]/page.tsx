'use client';
import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { TopNav } from '@/components/TopNav';
import { useDevices } from '@/hooks/useDevices';
import { runChecks, type Check } from '@/lib/checks';

/** Green room (brief: Screens → 2). Only mic + speaker menus are visible; everything else is under "More settings and troubleshooting". */
export default function GreenRoom({ params }: { params: Promise<{ session: string }> }) {
  const { session } = use(params);
  const d = useDevices();
  const video = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<Check[]>([]);

  useEffect(() => { if (video.current && d.stream) video.current.srcObject = d.stream; }, [d.stream]);
  useEffect(() => { runChecks().then(setChecks); }, []);
  const failed = checks.filter((c) => !c.ok);

  return (
    <>
      <TopNav current="record" />
      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '32px 24px', display: 'flex', flexWrap: 'wrap', gap: 40 }}>
        <section style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <video ref={video} autoPlay muted playsInline style={{ width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', borderRadius: 16, background: '#2B2F3A', transform: 'scaleX(-1)' }} />
          {d.error && <p style={{ color: 'var(--warn)' }}>Camera or mic blocked: {d.error}</p>}
          <button className="btn" style={{ alignSelf: 'flex-start', background: 'transparent', color: failed.length ? 'var(--warn)' : 'var(--good)' }} aria-expanded={open} onClick={() => setOpen(!open)}>
            {failed.length ? `${checks.length - failed.length} of ${checks.length} checks passed` : 'All checks passed'} <span className="muted">· {open ? 'Hide' : 'More settings and troubleshooting'}</span>
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
              {/* TODO(T2–T6): background, noise cancellation level, mic meter/gain, Fix this flow */}
            </div>
          )}
        </section>
        <aside style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 20 }}>
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
          <Link className="btn btn-primary" style={{ minHeight: 52 }} href={`/studio/${session}?role=guest&mic=${d.micId}&cam=${d.camId}`}>Enter studio</Link>
        </aside>
      </main>
    </>
  );
}
