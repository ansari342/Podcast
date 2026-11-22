# Build status — handoff notes

Live: **https://theboys.space** · Branch: `build/m1` (production; every push deploys) · Spec: `docs/BRIEF.md` · Mocks: `docs/mocks/`

**For the next agent:** read `docs/BRIEF.md`, then this file. Keep `npm run build` passing, push to `build/m1`, update this file every push.

## How it fits together
- **Sign-in** (`middleware.ts`, `src/lib/auth.ts`, `/enter`): shared passcode (`STUDIO_PASSCODE`) + first name → HMAC-signed cookie (`AUTH_SECRET`) protects home + Library. **Invite links** (`/green-room/<room>?k=<HMAC>` from `/api/invite`) let guests into that one room with just a name — no passcode. Room APIs check `canUseRoom`. Off entirely when `STUDIO_PASSCODE` is unset. Supabase was dropped: its built-in email only sends to org members and Google sign-in needed a Cloud project — a passcode is simpler for three people.
- **Call + sync** (`src/hooks/useLiveRoom.ts`, `src/lib/sync.ts`): LiveKit room per session. `SharedStore` is a per-key Lamport map sent over the data channel; newcomers get a full dump. Without LiveKit keys, tabs on the same computer sync via `BroadcastChannel` (use 3 tabs to test games locally).
- **Studio** (`app/studio/[session]/page.tsx`): everything shared lives in the store — `rec`, `plan`, `now`, `set`, `screenRec`, `game`, `g.<round>.*`, `board.<gameId>`, `ov.<identity>`, `title`.
- **Recording**: anyone presses Record → `rec = {state:'countdown', at}`; every browser starts `LocalRecorder` with epoch `at` (R6). Whoever pressed Record also runs `ActiveRecorder` (canvas composite of faces / game board / shared screen + mixed audio, R5). Local OPFS session id is `<session>~<part>`; upload key `sessions/<session>/<name-identity>/<track>/<part>-<index>.<ext>`. Leftover chunks resume uploading on next studio visit (R4).
- **Games** (`src/components/GameBoard.tsx`, content in `src/lib/gameContent.ts`): all 17 playable. Secrets only shown to the right person. Fast Money mutes the asker for guessers only (`mutedForMe`); Guess the Sound hides the maker's video (`hiddenForMe`). `caption()` feeds the active video.
- **Sets** (S12): `@livekit/track-processors` virtual background; same set for everyone, each seat gets its own slice (`public/sets/<set>-<seat>.jpg`). Needs the live call.
- **Overlays** (AO): prompt → emoji sticker + anchor (`src/lib/overlay.ts`); the wearer's browser tracks their face (MediaPipe) and broadcasts the box; drawn on every screen and in the active video.
- **Topics** (`/api/topics`): Google News RSS (top/entertainment/sports/tech) + evergreen debates; "Add to plan".
- **Library** (`/library`, `/api/library`, `/api/library/files`): lists sessions from the bucket; downloads join chunks in the browser (WAV joined properly, WebM concatenated per part).
- **Fix this** (`src/lib/fixThis.ts`): restarts camera/mic, falls back to default devices, listens for mic signal, checks connection and free space.

## Added in pass 3
- **Sound effects** (`src/lib/sfx.ts`, `public/sfx/*.mp3`, synthesised in-house — no licensing): 8 sounds + slot 9 upload (`/api/sfx`, stored in R2 under `sfx/<room>/`). Keys 1–9; everyone hears them; mixed into the active video.
- **Mic tracks** (S10): `mic_clean` = what the call hears (noise cancellation Off/Standard/Strong; Strong adds high-pass, compressor and a gate worklet), `mic_raw` = second capture with all processing off.
- **Devices locked while recording** (T5); set locked while recording (S13).
- **Screen track** (V2): the sharer records their screen as `screen` when "Screen on recording" is on.
- **Markers** (S8: Mark button or M) and **events** (G12: game starts, sounds, debate captions) saved in `meta.json`; Library exports CSV/JSON (L3).
- **People** (PP1–PP3, R8, T7): live status per person (upload backlog, free space, noise level, connection) and remote Fix this.
- **Fix this** (T4) with symptoms; **mic meter** (T2); 1080p/720p and echo cancellation switches.
- **Topics** (C2, C3): filters, upvotes, "Show on screen" puts a Tonight's debate caption on stage and in the active video.

## Verified (headless Chrome, fake devices, 3 tabs)
Sound files decode; keys play for everyone; markers sync; debate caption; mic_clean + mic_raw recorded; people status + remote Fix this; sign-in + wrong passcode; all 17 games start; Imposter roles + reveal; Fast Money muting/unmuting; auction bids/budgets; snake order; Guess the Sound hiding; Record/Pause/Stop synced across 3 tabs; each tab saved camera + mic, presser also saved active; plan sync; overlay sticker; Fix this. **Not yet verified:** the real LiveKit call between machines, R2 uploads, backgrounds and face tracking (blocked from the test sandbox).

## Env (Vercel)
Set: `LIVEKIT_URL`, `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `STUDIO_PASSCODE`, `AUTH_SECRET`.
Storage cap: `STORAGE_LIMIT_GB=150` (upload route refuses new chunks past it; Library shows usage and can delete episodes).
R2: bucket `studio-three-recordings`, token scoped to that bucket (Object Read & Write), CORS allows GET/PUT/HEAD from theboys.space. All `S3_*` vars set.

## Next up
1. Record a 2-minute test with 2–3 people on separate machines; confirm the Library downloads play.
3. Server-side render that joins chunks into MP4 (R7) — the browser join is fine for WebM but large episodes are slow to download chunk by chunk.
4. Topics ranked by channel performance (C4, needs YouTube Analytics).
5. AI-generated overlay images instead of emoji (AO3) — swap `pickSticker`.

## Deployment
Vercel project `podcast` (prj_sH7X1srWqmvap8Tr4K3fJ3E3y6sN), team ansari342-2369s-projects. Next.js pinned to 15.5.29+ (Vercel blocks older 15.5.x, CVE-2025-66478).
