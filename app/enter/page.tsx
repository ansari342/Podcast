'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function Enter() {
  const sp = useSearchParams();
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await fetch('/api/enter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, passcode }) });
    if (r.ok) { localStorage.setItem('st3-name', name.trim()); location.href = sp.get('next') || '/'; }
    else { setErr(((await r.json()) as { error: string }).error); setBusy(false); }
  };
  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={submit} className="panel" style={{ width: 360, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="brand"><span className="brand-mark">3</span>Studio Three</div>
        <label className="field">Your first name<input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></label>
        <label className="field">Passcode<input className="input" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="current-password" type="password" /></label>
        {err && <span style={{ color: 'var(--warn)' }}>{err}</span>}
        <button className="btn btn-primary" style={{ minHeight: 48 }} disabled={busy || !name.trim()}>Enter</button>
      </form>
    </main>
  );
}
export default function Page() { return <Suspense><Enter /></Suspense>; }
