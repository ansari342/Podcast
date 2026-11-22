const P: Record<string, string> = {
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM19 11a7 7 0 0 1-14 0M12 18v3',
  cam: 'M3 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 10l5-3v10l-5-3z',
  share: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 21h8M12 17v4M12 13V8M9.5 10.5L12 8l2.5 2.5',
  react: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M8 14s1.5 3 4 3 4-3 4-3M9 9h.01M15 9h.01',
  overlay: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  games: 'M7 7h10a5 5 0 0 1 0 11H7A5 5 0 0 1 7 7zM7 11v3M5.5 12.5h3M16 11.5h.01M18 13.5h.01',
  topics: 'M4 5h16v11H9l-5 4z',
  setup: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5a2 2 0 1 0 0 4a2 2 0 1 0 0-4M10 15a2 2 0 1 0 0 4a2 2 0 1 0 0-4',
  leave: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  slash: 'M3 3l18 18',
  up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', close: 'M6 6l12 12M18 6L6 18',
};
export function Icon({ name, size = 22, slash = false }: { name: keyof typeof P | string; size?: number; slash?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />{slash && <path d={P.slash} />}
    </svg>
  );
}
