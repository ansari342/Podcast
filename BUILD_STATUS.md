# Build status — handoff notes

Branch: `build/m1` · Spec: `docs/BRIEF.md` · Mocks: `docs/mocks/`

**For the next agent:** read `docs/BRIEF.md`, then this file. Work top to bottom through "Next up". Keep this file updated on every push.

## Done
- [x] **Scaffold** — Next.js 15 + TypeScript, dark theme tokens from the mocks (`app/globals.css`), config (`src/lib/config.ts`).
- [x] **Home** (`app/page.tsx`) — title + Open the studio. Session id is random for now (TODO: create Session via API, A1).
- [x] **Green room** (`app/green-room/[session]/page.tsx`) — live camera preview, Microphone + Speakers menus only, collapsed "More settings and troubleshooting" with real checks (browser support, free browser storage, network) and camera picker (S2, T1 partial).

- [x] **Local recorder** (`src/lib/recorder/`) — `LocalRecorder` records camera via MediaRecorder (VP9/VP8 WebM, MP4 on Safari) and mic via AudioWorklet (`public/worklets/pcm-capture.js`) as 48 kHz 24-bit WAV, both in 5 s chunks with `startMs` on a shared session clock (R1, R2, R3, R6). `chunkStore` saves chunks + manifest to OPFS and keeps them until uploaded; `sessions()` finds interrupted sessions for resume (R4). `UploadQueue` uploads in order, deletes only after confirmation, retries every 3 s; `notConfiguredSend` keeps everything on disk until storage keys exist. `useLeaveGuard` = R9.
- [x] **Recorder test bench** at `/dev/recorder` — record, pause, stop, list sessions on disk (including interrupted ones), download joined video and WAV. WAV encoder/joiner unit-checked.

- [x] **Studio screen** (`app/studio/[session]/page.tsx`) — host/guest from `?role=`; stage with local camera; controls under the video (mic, camera, share, React, Overlay, Record, Leave); Record → 3-2-1 → timer, Pause/Resume, Stop with "Stop recording for everyone?" (S3, S4, U4); recording wired to `LocalRecorder` + `UploadQueue`; top tabs Games / Topics / Setup (U2). Games and Topics replace the stage; Setup opens beside it.
- [x] **Game catalog** (`src/lib/games.ts`) — all 17 games with codes, list line, min players, rules per count, board-on-recording default, and special routing flags (Fast Money: mute asker for guessers; Guess the Sound: hide video from guessers). Games tab disables games below the minimum (G14, G15, V4). Trivia playable end to end (question, Reveal answer, Next question).
- [x] **Setup tab** — People (count, invite link + Copy), Plan (Now/Next, tick, rename, reorder, Start, Add — P2, P3, local state only), Sound effects (9 pads, placeholder synth tones — SB1), mic/camera pickers.

- [x] **Live call (code ready, needs keys)** — `app/api/livekit-token/route.ts` issues join tokens; `src/hooks/useLiveRoom.ts` joins the session room, publishes camera + mic, lists remote people; studio shows up to 3 tiles side by side and in the faces strip during games; people count is live (S1, G14). Without keys the studio runs solo and Setup says "call not configured yet".
- [x] **Uploads (code ready, needs keys)** — `app/api/upload-url/route.ts` returns presigned PUT URLs for R2/S3 (key: `sessions/<session>/<user>/<track>/<index>.<ext>`); `makeS3Send` plugs into `UploadQueue`; studio recordings upload as chunks arrive and stay on disk until confirmed (R3, R4).
- [x] `.env.example` lists every variable.

## In progress
- (nothing — handoff point)

## Next up (in order)
1. **Add keys and test the call + uploads end to end** with 2–3 browsers (fill `.env.local`). Check the bucket receives chunks for both `camera_raw` and `mic_raw`.
2. **Shared session clock (R6):** when Record is pressed, broadcast `{type:'rec-start', epochMs}` over `room.localParticipant.publishData`; every browser starts its `LocalRecorder` with that epoch (anyone can press Record — S3). Same for pause/stop.
3. **Supabase auth + allowlist (A1–A3)** and tables from `docs/BRIEF.md` → Data model; protect both API routes.
4. **Library (L1–L2)** listing sessions from the DB and signed download URLs; **render worker** that joins chunks and builds the active video (R5, R7).
5. **Shared game/plan state (G8, G9, P4)** over the data channel, then the launch games G1–G3 boards. Fast Money needs per-listener muting (`setTrackSubscriptionPermissions` / unsubscribe the asker's mic for guessers only) — G3.
6. Screen share (V1–V3), reactions (RX1), troubleshooting (T1–T7), noise cancellation + backgrounds (S9–S14), topics (C1–C4), overlays (AO1–AO4), remaining games — in `docs/BRIEF.md` milestone order.

## Needs from Ahsan (keys go in `.env.local` / Vercel env, never in git)
- LiveKit Cloud: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; Google provider enabled
- Cloudflare R2 (or S3): `S3_ENDPOINT`, `S3_BUCKET=studio-three-recordings`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`

## Known gaps / TODO in studio
- Stage shows only the local camera; remote people, shared "one room" set and faces strip need LiveKit (S1, S12–S18, U3). People count is `1 + remote participants` — becomes live once the call is wired (G14).
- Only Trivia has a real game board; others show their rules + "TODO (G8, G9)". Build the shared game-state layer (G8, G9) then each game per `docs/BRIEF.md` → Games spec.
- Plan, board switches and game state are local to one browser — must sync over the realtime channel (P4, G9).
- Share screen, React, Overlay, Topics feed, noise cancellation/background/Fix this are placeholders (V1, RX1, AO1–AO4, C1–C4, S9, S12, T1–T7).

## Known gaps / TODO in recorder
- Not yet verified in a real browser by a human: run `/dev/recorder` in Chrome, record 1 min, close the tab mid-way, reopen, confirm the session is listed and both downloads play.
- Session epoch: pass the same `epochMs` to every participant's `LocalRecorder` (host broadcasts it when the 3-2-1 countdown ends) — wire this with the realtime layer.
- `mic_clean` (noise-cancelled) track and `camera_processed` (with set) are not recorded yet (S10, S19).

## Decisions made
- No separate join page: invite link → `/green-room/[session]` → `/studio/[session]?role=guest`.
- COOP/COEP headers set in `next.config.mjs` for the audio worklet.

## Prompt for the next agent
> You're continuing the Studio Three build in this repo (branch `build/m1`). Read `docs/BRIEF.md` (spec, source of truth) and `BUILD_STATUS.md` (what's done and what's next). Mocks are in `docs/mocks/` (`Studio.dc.html` is the main studio). Work through "Next up" in order, keep `npm run build` passing, commit and push after each item, and update `BUILD_STATUS.md` every push.

## Deployment (2026-11-22)
- Live at https://theboys.space (www redirects to it). Vercel project `podcast` (prj_sH7X1srWqmvap8Tr4K3fJ3E3y6sN), team ansari342-2369s-projects.
- Production branch: build/m1. Every push to it deploys automatically.
- Next.js pinned to 15.5.29. Vercel blocks older 15.5.x builds (CVE-2025-66478).
- Env vars are NOT set yet. Add them in Vercel → Project → Settings → Environment Variables (see .env.example), then redeploy.
