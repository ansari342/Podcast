'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TopNav } from '@/components/TopNav';

/** Home (brief: Screens → 1. Home). Host names the episode and opens the studio. */
export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const open = () => {
    const id = Math.random().toString(36).slice(2, 9);
    router.push(`/studio/${id}?title=${encodeURIComponent(title.trim() || 'New episode')}`);
  };
  return (
    <>
      <TopNav current="record" />
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <h1 style={{ fontSize: 36 }}>New episode</h1>
        <label className="field">Title
          <input className="input" placeholder="Episode title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && open()} />
        </label>
        <button className="btn btn-primary" style={{ minHeight: 52 }} onClick={open}>Open the studio</button>
      </main>
    </>
  );
}
