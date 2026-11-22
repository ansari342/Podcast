'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DisconnectReason, Room, RoomEvent, Track, type Participant, type RemoteParticipant, type LocalVideoTrack } from 'livekit-client';
import { SharedStore, batches } from '@/lib/sync';

export type Person = {
  identity: string; name: string; isLocal: boolean; joinedAt: number;
  video?: MediaStreamTrack; audio?: MediaStreamTrack; screen?: MediaStreamTrack; quality?: string;
};
export type LiveEvent = { type: string; from: string; [k: string]: unknown };

const enc = new TextEncoder(); const dec = new TextDecoder();

/** Stable identity for this tab. */
export function useIdentity() {
  return useMemo(() => {
    if (typeof window === 'undefined') return { identity: 'ssr', name: '' };
    // Per tab, kept across reloads (sessionStorage), so a reload keeps your seat and game role.
    let id = sessionStorage.getItem('st3-id');
    if (!id) { id = 'p' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('st3-id', id); }
    return { identity: id, name: sessionStorage.getItem('st3-name') || localStorage.getItem('st3-name') || 'Guest' };
  }, []);
}

/**
 * Joins the session's LiveKit room (S1), publishes camera + mic, and carries:
 * - `store`: shared state (game, plan, recording, set) over the reliable data channel (G9, P4, R6).
 * - `emit` / `onEvent`: one-off events (reactions, sound effects, face boxes for overlays).
 * Works solo with no keys: status 'not-configured', the store still works locally.
 */
export function useLiveRoom(session: string, identity: string, name: string, stream: MediaStream | null) {
  const store = useMemo(() => new SharedStore(identity), [identity]);
  const [room, setRoom] = useState<Room | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [status, setStatus] = useState<'offline' | 'connecting' | 'live' | 'not-configured'>('offline');
  const listeners = useRef(new Set<(e: LiveEvent) => void>());
  const roomRef = useRef<Room | null>(null);
  const published = useRef<MediaStream | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Connect once per session.
  useEffect(() => {
    if (!stream) return;
    let r: Room | null = null; let cancelled = false;
    (async () => {
      setStatus('connecting');
      const res = await fetch('/api/livekit-token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room: session, identity, name }) });
      if (!res.ok) { setStatus(res.status === 501 ? 'not-configured' : 'offline'); return; }
      const { token, url } = (await res.json()) as { token: string; url?: string };
      const wss = url || process.env.NEXT_PUBLIC_LIVEKIT_URL;
      if (!wss || cancelled) { setStatus('not-configured'); return; }
      r = new Room({ adaptiveStream: true, dynacast: true, publishDefaults: { videoSimulcastLayers: undefined } });
      roomRef.current = r;
      const sync = () => setPeople(listPeople(r!));
      r.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        sync();
        for (const b of batches(store.dump())) void r!.localParticipant.publishData(enc.encode(JSON.stringify({ t: 's', e: b })), { reliable: true, destinationIdentities: [p.identity] });
      })
        .on(RoomEvent.ParticipantDisconnected, sync).on(RoomEvent.TrackSubscribed, sync).on(RoomEvent.TrackUnsubscribed, sync)
        .on(RoomEvent.LocalTrackPublished, sync).on(RoomEvent.LocalTrackUnpublished, sync).on(RoomEvent.TrackMuted, sync).on(RoomEvent.TrackUnmuted, sync).on(RoomEvent.ConnectionQualityChanged, sync)
        .on(RoomEvent.Reconnected, () => { setStatus('live'); for (const b of batches(store.dump())) void r!.localParticipant.publishData(enc.encode(JSON.stringify({ t: 's', e: b })), { reliable: true }); })
        .on(RoomEvent.Reconnecting, () => setStatus('connecting'))
        // A full drop (network change, laptop sleep): rejoin automatically. Local recording is unaffected.
        .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
          if (cancelled || reason === DisconnectReason.CLIENT_INITIATED || reason === DisconnectReason.DUPLICATE_IDENTITY) return;
          setStatus('connecting'); setRoom(null); published.current = null; setTimeout(() => setAttempt((n) => n + 1), 2000);
        })
        .on(RoomEvent.DataReceived, (payload, p) => {
          try {
            const msg = JSON.parse(dec.decode(payload));
            if (msg.t === 's') store.apply(msg.e);
            else if (msg.t === 'ev') listeners.current.forEach((f) => f({ ...msg.ev, from: p?.identity ?? '' }));
          } catch { /* ignore malformed */ }
        });
      store.onSend = (entries, to) => {
        for (const b of batches(entries)) void r!.localParticipant.publishData(enc.encode(JSON.stringify({ t: 's', e: b })), { reliable: true, destinationIdentities: to });
      };
      await r.connect(wss, token);
      if (cancelled) { void r.disconnect(); return; }
      setRoom(r); setStatus('live'); sync();
    })().catch(() => { if (!cancelled) { setStatus('connecting'); setTimeout(() => setAttempt((n) => n + 1), 4000); } });
    return () => { cancelled = true; store.onSend = () => {}; void r?.disconnect(); roomRef.current = null; published.current = null; setRoom(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, identity, !!stream, store, attempt]);

  // (Re)publish camera + mic whenever the device stream changes.
  useEffect(() => {
    const r = room; if (!r || !stream || published.current === stream) return;
    (async () => {
      for (const pub of [...r.localParticipant.trackPublications.values()]) {
        if (pub.source === Track.Source.Camera || pub.source === Track.Source.Microphone) if (pub.track) await r.localParticipant.unpublishTrack(pub.track, false);
      }
      for (const t of stream.getTracks()) await r.localParticipant.publishTrack(t, { source: t.kind === 'video' ? Track.Source.Camera : Track.Source.Microphone });
      published.current = stream; setPeople(listPeople(r));
    })().catch(() => {});
  }, [room, stream]);

  const tabEmit = useRef<((ev: unknown) => void) | null>(null);
  const emit = (ev: Omit<LiveEvent, 'from'>, lossy = false) => {
    listeners.current.forEach((f) => f({ ...ev, from: identity } as LiveEvent));
    tabEmit.current?.(ev);
    void roomRef.current?.localParticipant.publishData(enc.encode(JSON.stringify({ t: 'ev', ev })), { reliable: !lossy });
  };
  const onEvent = (f: (e: LiveEvent) => void) => { listeners.current.add(f); return () => { listeners.current.delete(f); }; };

  const setScreenShare = async (on: boolean) => {
    const r = roomRef.current;
    if (r) { await r.localParticipant.setScreenShareEnabled(on, { audio: true }); setPeople(listPeople(r)); return true; }
    return false;
  };
  const cameraTrack = () => roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;

  // No call configured: tabs on this computer still share state (handy for testing games with three tabs).
  const [tabs, setTabs] = useState<Person[]>([]);
  const joined = useRef(Date.now());
  useEffect(() => {
    if (status !== 'not-configured' || typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(`st3-${session}`);
    const seen = new Map<string, { name: string; at: number; joinedAt: number }>();
    const hello = (to?: string) => bc.postMessage({ t: 'hi', id: identity, name, joinedAt: joined.current, to });
    const prune = () => { const now = Date.now(); for (const [k, v] of seen) if (now - v.at > 4000) seen.delete(k); setTabs([...seen].map(([id, v]) => ({ identity: id, name: v.name, isLocal: false, joinedAt: v.joinedAt }))); };
    bc.onmessage = (e) => {
      const m = e.data;
      if (m.t === 'hi' && m.id !== identity) { const isNew = !seen.has(m.id); seen.set(m.id, { name: m.name, at: Date.now(), joinedAt: m.joinedAt }); if (isNew) { hello(); bc.postMessage({ t: 's', e: store.dump(), to: m.id }); } prune(); }
      if (m.t === 's' && (!m.to || m.to === identity)) store.apply(m.e);
      if (m.t === 'ev') listeners.current.forEach((f) => f({ ...m.ev, from: m.from }));
    };
    store.onSend = (entries) => bc.postMessage({ t: 's', e: entries });
    tabEmit.current = (ev) => bc.postMessage({ t: 'ev', ev, from: identity });
    hello(); const t = setInterval(() => { hello(); prune(); }, 1500);
    return () => { clearInterval(t); bc.close(); tabEmit.current = null; store.onSend = () => {}; };
  }, [status, session, identity, name, store]);

  const self: Person = { identity, name, isLocal: true, joinedAt: joined.current, video: stream?.getVideoTracks()[0], audio: stream?.getAudioTracks()[0] };
  const all = room ? people : [self, ...tabs].sort((a, b) => a.joinedAt - b.joinedAt || a.identity.localeCompare(b.identity)).slice(0, 3);
  const startAudio = async () => { await roomRef.current?.startAudio(); };
  return { room, people: all, status, store, emit, onEvent, setScreenShare, cameraTrack, startAudio };
}

function toPerson(p: Participant, isLocal: boolean): Person {
  const t = (s: Track.Source) => p.getTrackPublication(s)?.track?.mediaStreamTrack;
  return { identity: p.identity, name: p.name || p.identity, isLocal, joinedAt: p.joinedAt?.getTime() ?? 0, quality: String(p.connectionQuality ?? ''),
    video: t(Track.Source.Camera), audio: isLocal ? undefined : t(Track.Source.Microphone), screen: t(Track.Source.ScreenShare) };
}

/** Seats are automatic (no seat picker): ordered by who joined first. Max three people. */
function listPeople(r: Room): Person[] {
  const list = [toPerson(r.localParticipant, true), ...[...r.remoteParticipants.values()].map((p) => toPerson(p, false))];
  return list.sort((a, b) => a.joinedAt - b.joinedAt || a.identity.localeCompare(b.identity)).slice(0, 3);
}
