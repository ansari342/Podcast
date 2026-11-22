'use client';
import { useEffect, useState } from 'react';
import { TopNav } from '@/components/TopNav';
import { joinWavChunks } from '@/lib/recorder/wav';

type Track = { person: string; track: string; chunks: number; bytes: number; ext: string };
type Session = { id: string; last: number; meta: { title?: string; startedAt?: number; durationMs?: number; people?: Record<string, string> } | null; tracks: Track[] };

const LABEL: Record<string, string> = { active: 'Active video', camera_raw: 'Camera', mic_raw: 'Mic (WAV)', mic_clean: 'Mic, cleaned', screen: 'Screen' };
const mb = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);
const personName = (p: string) => p.replace(/-p[a-z0-9]{6,}$/, '') || p;

/** Library (L1–L2): every episode with its active video and each person's camera and mic, ready to download. */
export default function Library() {
  const [data, setData] = useState<Session[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch('/api/library').then(async (r) => { if (!r.ok) throw new Error(r.status === 501 ? 'Recording storage isn’t set up yet.' : 'Couldn’t load the library.'); return r.json(); })
      .then((j) => setData(j.sessions)).catch((e) => setErr(e.message));
  }, []);

  const download = async (s: Session, t: Track) => {
    const key = `${s.id}/${t.person}/${t.track}`;
    const q = new URLSearchParams({ session: s.id, person: t.person, track: t.track });
    const { parts } = (await (await fetch(`/api/library/files?${q}`)).json()) as { parts: { part: string; urls: string[] }[] };
    let pi = 0;
    for (const part of parts) {
      pi++;
      const blobs: Blob[] = [];
      for (let i = 0; i < part.urls.length; i++) {
        setBusy((b) => ({ ...b, [key]: `${parts.length > 1 ? `Part ${pi}: ` : ''}${Math.round((i / part.urls.length) * 100)}%` }));
        blobs.push(await (await fetch(part.urls[i])).blob());
      }
      const file = t.ext === 'wav' ? await joinWavChunks(blobs, 48000) : new Blob(blobs, { type: t.ext === 'mp4' ? 'video/mp4' : 'video/webm' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(file);
      a.download = `${(s.meta?.title ?? s.id).replace(/[^\w -]+/g, '')} - ${personName(t.person)} - ${LABEL[t.track] ?? t.track}${parts.length > 1 ? ` (part ${pi})` : ''}.${t.ext}`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    }
    setBusy((b) => { const c = { ...b }; delete c[key]; return c; });
  };

  return (
    <>
      <TopNav current="library" />
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h1 style={{ fontSize: 32 }}>Library</h1>
        {err && <p className="muted">{err}</p>}
        {!data && !err && <p className="muted">Loading…</p>}
        {data?.length === 0 && <p className="muted">No recordings yet.</p>}
        {data?.map((s) => {
          const order = (t: Track) => ['active', 'camera_raw', 'mic_raw', 'screen'].indexOf(t.track);
          const tracks = [...s.tracks].sort((a, b) => order(a) - order(b) || a.person.localeCompare(b.person));
          return (
            <section key={s.id} className="panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 20 }}>{s.meta?.title ?? 'Untitled episode'}</h2>
                <span className="muted" style={{ fontSize: 13 }}>{new Date(s.meta?.startedAt ?? s.last).toLocaleString()}{s.meta?.durationMs ? ` · ${Math.round(s.meta.durationMs / 60000)} min` : ''}</span>
              </div>
              {tracks.map((t) => {
                const key = `${s.id}/${t.person}/${t.track}`;
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <span style={{ flex: 1 }}><strong>{t.track === 'active' ? 'Active video' : personName(t.person)}</strong> <span className="muted">· {t.track === 'active' ? 'everyone' : LABEL[t.track] ?? t.track} · {mb(t.bytes)}</span></span>
                    <button className="btn" disabled={!!busy[key]} onClick={() => download(s, t).catch(() => setBusy((b) => ({ ...b, [key]: 'Failed — try again' })))}>{busy[key] ?? 'Download'}</button>
                  </div>);
              })}
            </section>);
        })}
      </main>
    </>
  );
}
