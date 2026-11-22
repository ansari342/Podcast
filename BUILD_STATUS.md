# Build status — handoff notes

Branch: `build/m1` · Spec: `docs/BRIEF.md` · Mocks: `docs/mocks/`

**For the next agent:** read `docs/BRIEF.md`, then this file. Work top to bottom through "Next up". Keep this file updated on every push.

## Done
- [x] **Scaffold** — Next.js 15 + TypeScript, dark theme tokens from the mocks (`app/globals.css`), config (`src/lib/config.ts`).
- [x] **Home** (`app/page.tsx`) — title + Open the studio. Session id is random for now (TODO: create Session via API, A1).
- [x] **Green room** (`app/green-room/[session]/page.tsx`) — live camera preview, Microphone + Speakers menus only, collapsed "More settings and troubleshooting" with real checks (browser support, free browser storage, network) and camera picker (S2, T1 partial).

- [x] **Local recorder** (`src/lib/recorder/`) — `LocalRecorder` records camera via MediaRecorder (VP9/VP8 WebM, MP4 on Safari) and mic via AudioWorklet (`public/worklets/pcm-capture.js`) as 48 kHz 24-bit WAV, both in 5 s chunks with `startMs` on a shared session clock (R1, R2, R3, R6). `chunkStore` saves chunks + manifest to OPFS and keeps them until uploaded; `sessions()` finds interrupted sessions for resume (R4). `UploadQueue` uploads in order, deletes only after confirmation, retries every 3 s; `notConfiguredSend` keeps everything on disk until storage keys exist. `useLeaveGuard` = R9.
- [x] **Recorder test bench** at `/dev/recorder` — record, pause, stop, list sessions on disk (including interrupted ones), download joined video and WAV. WAV encoder/joiner unit-checked.

## In progress
- [ ] Studio UI shell (U1–U4, G14–G15)

## Next up (in order)
2. Studio UI shell: stage, controls under the video, Games / Topics / Setup tabs, 17-game catalog with player-count rules (U1–U4, G14–G15).
3. LiveKit call: token API route + room hook, mic/camera/share (S1, V1). Needs keys.
4. Uploads: presigned multipart to R2/S3, upload queue, library page (R3–R4, L1–L2). Needs keys.
5. Supabase auth + allowlist (A1–A3) and Session/Participant/Track tables (Data model).
6. Remaining M1/M2 items per `docs/BRIEF.md` → Build order.

## Needs from Ahsan (keys go in `.env.local` / Vercel env, never in git)
- LiveKit Cloud: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; Google provider enabled
- Cloudflare R2 (or S3): `S3_ENDPOINT`, `S3_BUCKET=studio-three-recordings`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`

## Known gaps / TODO in recorder
- Not yet verified in a real browser by a human: run `/dev/recorder` in Chrome, record 1 min, close the tab mid-way, reopen, confirm the session is listed and both downloads play.
- Session epoch: pass the same `epochMs` to every participant's `LocalRecorder` (host broadcasts it when the 3-2-1 countdown ends) — wire this with the realtime layer.
- `mic_clean` (noise-cancelled) track and `camera_processed` (with set) are not recorded yet (S10, S19).

## Decisions made
- No separate join page: invite link → `/green-room/[session]` → `/studio/[session]?role=guest`.
- COOP/COEP headers set in `next.config.mjs` for the audio worklet.
