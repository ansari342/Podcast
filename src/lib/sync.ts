'use client';
import { useEffect, useReducer } from 'react';

/**
 * Shared room state (G8, G9, P4, R6). A key → value map where every key carries a Lamport version, so concurrent
 * writes to different keys never clobber each other and the same key resolves the same way in every browser.
 * Write per-person facts under their own key (e.g. `g.5.ans.<identity>`) so answers can't overwrite each other.
 * Transport-agnostic: `onSend` is wired to the LiveKit data channel; `apply` takes what arrives.
 */
type Entry = [key: string, v: number, by: string, val: unknown];

export class SharedStore {
  private m = new Map<string, { v: number; by: string; val: unknown }>();
  private clock = 0;
  private subs = new Set<() => void>();
  onSend: (entries: Entry[], to?: string[]) => void = () => {};
  constructor(public me: string) {}

  get<T = unknown>(k: string): T | undefined { return this.m.get(k)?.val as T | undefined; }
  /** All live keys under a prefix, as { suffix: value }. */
  under<T = unknown>(prefix: string): Record<string, T> {
    const out: Record<string, T> = {};
    for (const [k, e] of this.m) if (k.startsWith(prefix) && e.val !== null && e.val !== undefined) out[k.slice(prefix.length)] = e.val as T;
    return out;
  }
  set(k: string, val: unknown) { this.setMany({ [k]: val }); }
  setMany(kv: Record<string, unknown>) {
    const entries: Entry[] = Object.entries(kv).map(([k, val]) => [k, ++this.clock, this.me, val ?? null]);
    this.apply(entries); this.onSend(entries);
  }
  apply(entries: Entry[]) {
    let changed = false;
    for (const [k, v, by, val] of entries) {
      this.clock = Math.max(this.clock, v);
      const cur = this.m.get(k);
      if (!cur || v > cur.v || (v === cur.v && by > cur.by)) { this.m.set(k, { v, by, val }); changed = true; }
    }
    if (changed) this.subs.forEach((f) => f());
  }
  /** Everything we know, for someone who just joined. */
  dump(): Entry[] { return [...this.m].map(([k, e]) => [k, e.v, e.by, e.val]); }
  subscribe(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; }
}

/** Re-render when the store changes. */
export function useStore(s: SharedStore | null) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => s?.subscribe(bump), [s]);
}

/** Split entries into messages under the data-channel size limit. */
export function batches(entries: Entry[], max = 12_000): Entry[][] {
  const out: Entry[][] = []; let cur: Entry[] = []; let size = 0;
  for (const e of entries) {
    const n = JSON.stringify(e).length;
    if (cur.length && size + n > max) { out.push(cur); cur = []; size = 0; }
    cur.push(e); size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}
