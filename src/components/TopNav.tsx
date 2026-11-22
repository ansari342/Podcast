import Link from 'next/link';
import { APP_NAME } from '@/lib/config';

export function TopNav({ current }: { current: 'record' | 'library' }) {
  return (
    <header className="topnav">
      <div className="brand"><span className="brand-mark">3</span>{APP_NAME}</div>
      <nav>
        <Link href="/" aria-current={current === 'record' ? 'page' : undefined}>Record</Link>
        <Link href="/library" aria-current={current === 'library' ? 'page' : undefined}>Library</Link>
      </nav>
    </header>
  );
}
