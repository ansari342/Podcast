'use client';
import { useEffect, useState } from 'react';
import { TopNav } from '@/components/TopNav';
import { downloadJoined } from '@/lib/recorder/download';

type Track = { person: string; track: string; chunks: number; bytes: number; ext: string };
type Mark = { t: number; by: string; type?: string; label?: string };
type Session = { id: string; last: number; meta: { title?: string; startedAt?: number; durationMs?: number; people?: Record<string, string>; markers?: Mark[]; events?: Mark[] } | null; tracks: Track[] };

const LABEL: Record<string, string> = { active: 'Episode video', camera_raw: 'Camera', mic_raw: 'Mic (raw)', mic_clean: 'Mic (cleaned)', screen: 'Shared screen', phone: 'Phone camera' };
const tc = (ms: number) => { const s = Math.max(0, ms / 1000); const p = (n: number) => String(Math.floor(n)).padStart(2, '0'); return `${p(s / 3600)}:${p((s / 60) % 60)}:${p(s % 60)}.${String(Math.floor(ms % 1000)).padStart(3, '0')}`; };
function saveText(name: string, text: string, type: string) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30_000); }
/** L3: markers and game/sound/debate events as CSV (timecode from the start of the recording) and JSON. */
function exportMarks(s: Session, kind: 'csv' | 'json') {
  const rows = [...(s.meta?.markers ?? []).map((m) => ({ ...m, type: 'marker', label: '' })), ...(s.meta?.events ?? [])].sort((a, b) => a.t - b.t);
  const base = (s.meta?.title ?? s.id).replace(/[^\w -]+/g, '');
  if (kind === 'json') return saveText(`${base} - markers.json`, JSON.stringify(rows, null, 2), 'application/json');
  saveText(`${base} - markers.csv`, ['timecode,seconds,type,label,by', ...rows.map((r) => [tc(r.t), (r.t / 1000).toFixed(3), r.type, JSON.stringify(r.label ?? ''), JSON.stringify(r.by ?? '')].join(','))].join('\n'), 'text/csv');
}
const mb = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`);
const personName = (p: string) => p.replace(/-p[a-z0-9]{6,}$/, '') || p;

/** Library (L1–L2): every episode with its active video and each person's camera and mic, ready to download. */
export default function Library() {
  const [data, setData] = useState<Session[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const load = () => fetch('/api/library').then(async (r) => { if (!r.ok) throw new Error(r.status === 501 ? 'Recording storage isn’t set up yet.' : 'Couldn’t load the library.'); return r.json(); })
    .then((j) => { setData(j.sessions); setUsage({ used: j.usedBytes, limit: j.limitBytes }); }).catch((e) => setErr(e.message));
  const remove = async (id: string) => { setConfirmDel(null); setBusy((b) => ({ ...b, [id]: 'Deleting…' })); await fetch(`/api/library?session=${id}`, { method: 'DELETE' }); await load(); };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async (s: Session, t: Track) => {
    const key = `${s.id}/${t.person}/${t.track}`;
    const q = new URLSearchParams({ session: s.id, person: t.person, track: t.track });
    setBusy((b) => ({ ...b, [key]: 'Preparing…' }));
    const r = await fetch(`/api/library/files?${q}`); if (!r.ok) throw new Error('list failed');
    const { parts } = (await r.json()) as { parts: { part: string; urls: string[]; sizes: number[] }[] };
    for (let i = 0; i < parts.length; i++) {
      const label = parts.length > 1 ? ` (part ${i + 1})` : '';
      const name = `${(s.meta?.title ?? s.id).replace(/[^\w -]+/g, '')} - ${t.track === 'active' ? 'Everyone' : personName(t.person)} - ${LABEL[t.track] ?? t.track}${label}`;
      await downloadJoined(parts[i].urls, parts[i].sizes, name, t.ext, (pct) => setBusy((b) => ({ ...b, [key]: `${parts.length > 1 ? `Part ${i + 1}: ` : ''}${pct}%` })));
    }
    setBusy((b) => { const c = { ...b }; delete c[key]; return c; });
  };

  return (
    <>
      <TopNav current="library" />
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h1 style={{ fontSize: 32 }}>Library</h1>
        {usage && (<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="muted" style={{ fontSize: 13 }}>{mb(usage.used)} of {mb(usage.limit)} used</span>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--panel-2)' }}><div style={{ height: 6, borderRadius: 3, width: `${Math.min(100, (usage.used / usage.limit) * 100)}%`, background: usage.used / usage.limit > 0.85 ? 'var(--rec)' : 'var(--accent)' }} /></div>
        </div>)}
        {err && <p className="muted">{err}</p>}
        {!data && !err && <p className="muted">Loading…</p>}
        {data?.length === 0 && <p className="muted">No recordings yet.</p>}
        {data?.map((s) => {
          const order = (t: Track) => ['active', 'camera_raw', 'phone', 'mic_clean', 'mic_raw', 'screen'].indexOf(t.track);
          const tracks = [...s.tracks].sort((a, b) => order(a) - order(b) || a.person.localeCompare(b.person));
          return (
            <section key={s.id} className="panel" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 20 }}>{s.meta?.title ?? 'Untitled episode'}</h2>
                <span className="muted" style={{ fontSize: 13 }}>{new Date(s.meta?.startedAt ?? s.last).toLocaleString()}{s.meta?.durationMs ? ` · ${Math.round(s.meta.durationMs / 60000)} min` : ''}</span>
                <span style={{ flex: 1 }} />
                {confirmDel === s.id
                  ? <><span style={{ fontSize: 13 }}>Delete this episode for everyone? This can’t be undone.</span><button className="btn btn-rec" style={{ borderRadius: 8 }} onClick={() => remove(s.id)}>Delete</button><button className="btn" onClick={() => setConfirmDel(null)}>Keep</button></>
                  : <button className="btn" style={{ background: 'transparent' }} disabled={!!busy[s.id]} onClick={() => setConfirmDel(s.id)}>{busy[s.id] ?? 'Delete'}</button>}
              </div>
              {(s.meta?.markers?.length || s.meta?.events?.length) ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <span style={{ flex: 1 }}><strong>Markers and events</strong> <span className="muted">· {s.meta?.markers?.length ?? 0} markers, {s.meta?.events?.length ?? 0} events</span></span>
                  <button className="btn" onClick={() => exportMarks(s, 'csv')}>CSV</button><button className="btn" onClick={() => exportMarks(s, 'json')}>JSON</button>
                </div>) : null}
              {tracks.map((t) => {
                const key = `${s.id}/${t.person}/${t.track}`;
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <span style={{ flex: 1 }}><strong>{t.track === 'active' ? 'Everyone' : personName(t.person)}</strong> <span className="muted">· {LABEL[t.track] ?? t.track} · {mb(t.bytes)}</span></span>
                    <button className="btn" disabled={!!busy[key] && !busy[key].startsWith('Failed')} onClick={() => download(s, t).catch(() => setBusy((b) => ({ ...b, [key]: 'Failed — tap to retry' })))}>{busy[key] ?? 'Download'}</button>
                  </div>);
              })}
            </section>);
        })}
      </main>
    </>
  );
}
