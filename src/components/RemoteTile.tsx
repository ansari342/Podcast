'use client';
import { useEffect, useRef } from 'react';
import type { Remote } from '@/hooks/useLiveRoom';

/** One remote person's live video + audio. No name tag on video (U1). */
export function RemoteTile({ r, style }: { r: Remote; style?: React.CSSProperties }) {
  const v = useRef<HTMLVideoElement>(null);
  const a = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (v.current) v.current.srcObject = r.video ? new MediaStream([r.video]) : null; }, [r.video]);
  useEffect(() => { if (a.current) a.current.srcObject = r.audio ? new MediaStream([r.audio]) : null; }, [r.audio]);
  return (<><video ref={v} autoPlay playsInline style={{ objectFit: 'cover', background: '#2B2F3A', ...style }} /><audio ref={a} autoPlay /></>);
}
