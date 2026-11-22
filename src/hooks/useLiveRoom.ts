'use client';
import { useEffect, useState } from 'react';
import { Room, RoomEvent, Track, type RemoteParticipant } from 'livekit-client';

export type Remote = { identity: string; name: string; video?: MediaStreamTrack; audio?: MediaStreamTrack };

/**
 * Joins the LiveKit room for this session and publishes the local camera + mic (S1).
 * If LiveKit isn't configured (token route returns 501) it stays offline and the studio works solo.
 * TODO(G9, P4): use room.localParticipant.publishData / RoomEvent.DataReceived for shared game, plan and recording state.
 * TODO(G3, G21): per-listener muting / per-viewer video hiding via track subscription permissions.
 */
export function useLiveRoom(session: string, identity: string, stream: MediaStream | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [status, setStatus] = useState<'offline' | 'connecting' | 'live' | 'not-configured'>('offline');

  useEffect(() => {
    if (!stream) return;
    let r: Room | null = null; let cancelled = false;
    (async () => {
      setStatus('connecting');
      const res = await fetch('/api/livekit-token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room: session, identity }) });
      if (!res.ok) { setStatus(res.status === 501 ? 'not-configured' : 'offline'); return; }
      const { token } = (await res.json()) as { token: string };
      const url = process.env.NEXT_PUBLIC_LIVEKIT_URL;
      if (!url || cancelled) { setStatus('not-configured'); return; }
      r = new Room({ adaptiveStream: true, dynacast: true });
      const sync = () => setRemotes(Array.from(r!.remoteParticipants.values()).map(toRemote));
      r.on(RoomEvent.ParticipantConnected, sync).on(RoomEvent.ParticipantDisconnected, sync)
        .on(RoomEvent.TrackSubscribed, sync).on(RoomEvent.TrackUnsubscribed, sync);
      await r.connect(url, token);
      for (const t of stream.getTracks()) await r.localParticipant.publishTrack(t, { source: t.kind === 'video' ? Track.Source.Camera : Track.Source.Microphone });
      setRoom(r); sync(); setStatus('live');
    })().catch(() => setStatus('offline'));
    return () => { cancelled = true; void r?.disconnect(); };
  }, [session, identity, stream]);

  return { room, remotes, status };
}

function toRemote(p: RemoteParticipant): Remote {
  const v = p.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
  const a = p.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
  return { identity: p.identity, name: p.name || p.identity, video: v, audio: a };
}
