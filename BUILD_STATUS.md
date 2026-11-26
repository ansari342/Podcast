# Build status — handoff notes

Live: **https://theboys.space** · Branch: `build/m1` (production; every push deploys) · Spec: `docs/BRIEF.md` · Mocks: `docs/mocks/`

**For the next agent:** read `docs/BRIEF.md`, then this file. Keep `npm run build` passing, push to `build/m1`, update this file every push.

## How it fits together
- **Sign-in** (`middleware.ts`, `src/lib/auth.ts`, `/enter`): shared passcode (`STUDIO_PASSCODE`) + first name → HMAC-signed cookie (`AUTH_SECRET`) protects home + Library. **Invite links** (`/green-room/<room>?k=<HMAC>` from `/api/invite`) let guests into that one room with just a name — no passcode. Room APIs check `canUseRoom`. Off entirely when `STUDIO_PASSCODE` is unset. Supabase was dropped: its built-in email only sends to org members and Google sign-in needed a Cloud project — a passcode is simpler for three people.
- **Call + sync** (`src/hooks/useLiveRoom.ts`, `src/lib/sync.ts`): LiveKit room per session. `SharedStore` is a per-key Lamport map sent over the data channel; newcomers get a full dump. Without LiveKit keys, tabs on the same computer sync via `BroadcastChannel` (use 3 tabs to test games locally).
- **Studio** (`app/studio/[session]/page.tsx`): everything shared lives in the store — `rec`, `plan`, `now`, `set`, `screenRec`, `game`, `g.<round>.*`, `board.<gameId>`, `ov.<identity>`, `title`.
- **Recording**: anyone presses Record → `rec = {state:'countdown', at}`; every browser starts `LocalRecorder` with epoch `at` (R6). Whoever pressed Record also runs `ActiveRecorder` (canvas composite of faces / game board / shared screen + mixed audio, R5). Local OPFS session id is `<session>~<part>`; upload key `sessions/<session>/<name-identity>/<track>/<part>-<index>.<ext>`. Leftover chunks resume uploading on next studio visit (R4).
- **Games** (`src/components/GameBoard.tsx`, content in `src/lib/gameContent.ts`): all 17 playable. Secrets only shown to the right person. Fast Money mutes the asker for guessers only (`mutedForMe`); Guess the Sound hides the maker's video (`hiddenForMe`). `caption()` feeds the active video.
- **Sets** (S12, reworked 2026-11-24): our own processor `src/lib/studioSet.ts` (MediaPipe multiclass selfie model, confidence mask smoothed over time + feathered, auto-framing by head size/height). One panorama per set (`public/sets/<set>-bg.jpg` + desk `<set>-fg.png`, made by `scripts/make-sets.py`); each seat renders its slice at the tile's shape (2:1 stage ÷ seats), unmirrored, and the stage/episode video show tiles edge to edge so the room is continuous. Blur still uses `@livekit/track-processors`. Without a call, the set runs locally on your camera.
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

## Added 2026-11-24
- **Fast Money** reworked: one asker for all 5 questions; guessers type answers (nothing shown or recorded until the end); then the asker reveals answers one cell at a time, then points, on a Family-Feud-style blue board (also drawn into the episode video). Points come from a simulated 200-person survey per question (`src/lib/fastMoney.ts`: hand-estimated boards re-rolled each game, fuzzy answer matching; unmatched = 0). The asker can click any points box to change it and can open the survey privately.
- **Imposter question**: answers are revealed one person at a time (each says theirs out loud) before anyone sees the question; then a non-imposter reads the real question aloud and shows it; then vote. 52 question pairs, mostly non-numeric.
- **Scoreboard**: +1 per mini game won, across the session (`win.<round>` in the store, `scoreFrom` for Reset). Clear winners fill in automatically (Imposter, Imposter question, Fast Money, Trivia, Guess the Price); for other games tap the round winner. Shown on the game board, the Games tab and the episode video.
- **Guess the Price**: item photo from Wikipedia via `/api/image` (same-origin, so it can be drawn into the episode video); more items incl. pricey ones.
- **Test mode**: name the episode “test” (home page or the title in the studio header) and pretend players fill empty seats in games; a “Play as” bar switches whose turn you take.
- **More sets** (bright, natural): Blush (white plaster, window light, pink niches), Gallery (pink/red prints under picture lights), Rosé (panel mouldings, red lamp and flowers on the desk). Desk layer `<set>-fg.png` is now full height so desk props can stand tall.
- **Minimal game screens**: one header row (name, rules behind an “i”, compact score, × to end), hints removed, winner shown as a single 🏆 line with “+1 winner” to award by hand; game cards are name + Play + a small Board/Faces toggle.
- **Studio redesign**: editable title, status chips, avatars, segmented tabs, framed 2:1 stage, floating control dock, restyled panels and game cards.
- **Phone companion** (S14): on a phone, home and the green room show “Join companion” when people are in a call (`/api/companion` lists rooms/people via LiveKit server API). `/companion/<room>`: pick who you are, front/back camera, “Record only” or “Show live” (PiP on that person’s tile). The phone joins as `cmp_<identity>__x` (never a seat), follows Record/Pause/Stop, records its camera as track `phone` into that person’s folder (laptops publish `uid.<identity>` so the folder matches). Phone browsers can’t capture their own screen, so it’s the phone camera.
- **Not verified here**: the new set and phone companion against the real LiveKit call (the test sandbox can’t reach LiveKit or the model CDN). The set pipeline was checked headless with a locally served model and a real face clip; the games in test mode end to end.

## Added 2026-11-26 — Auction draft rework
- **Host**: whoever presses Play is stored as `m.host` (kept on Next round); `amHost` in `GameBoard`. Only the host sees the pool and puts items up (`cur`), can undo a sale (× next to a price) or put an item back.
- **Live** (default): bid out loud or type an amount (`bid.<i>.<id>`, must beat the leader, capped so $1 stays for each empty slot). The winner enters what they paid and taps “I won it” → `won.<i>`, deducted from their $20.
- **Blind** (host checkbox, `m.blind`): everyone still bidding locks one sealed bid (`sb.<i>.<id>`, hidden — only ✓ shown); host reveals; highest wins and pays their bid; a tie clears the bids for a rebid.
- **Running list**: 5 slots per person with prices and $ left, on the board and in the episode-video caption.
- Verified with 3 local tabs (live bid → claim, blind reveal, budget cap, guests can’t see the pool).

## Instinct agenda (P1)
Instinct emails the agenda → inbound-email service (Postmark/CloudMailin) → `POST /api/agenda?token=<AGENDA_TOKEN>` → saved to R2 `agenda/latest.json`. Studio Plan shows "Agenda from <date> · Use it" and auto-applies a fresh one (≤3 days) if the plan hasn't been touched. Parser strips bullets, numbers, times, durations, greetings and signatures.

## Tests (`tests/`)
- `live-e2e.mjs` — runs against https://theboys.space with 3 headless Chromium browsers (fake camera/mic): invite links, real LiveKit call (video frames decoded, audio attached), Imposter + Fast Money over the data channel, shared set, synced Record/Pause/Stop, uploads to R2, Library listing + downloads (WebM/WAV headers), markers/events, storage meter, agenda webhook, topics, then deletes its test episode. Needs env `AUTH_SECRET` and `AGENDA_TOKEN`. Last run (2026-11-22): **27/27 passed**. Ran in a Vercel Sandbox (Ubuntu; `npx playwright install chromium && sudo npx playwright install-deps chromium`).
- `local-three-tabs.py`, `local-guest-link.py` — Python Playwright against `next start` on :3100 with no keys (tabs sync via BroadcastChannel). Need STUDIO_PASSCODE set locally.

## Review pass (2026-11-22)
Reliability: 3 parallel uploads with backoff; Library downloads stream to disk (no multi-GB blobs in memory; WAV header written once from listed sizes); Leave confirms and stops local recorders cleanly; recorders also stop on navigation; first click/key unlocks audio (autoplay); call auto-rejoins after a full drop; if the person who pressed Record leaves, the first person in the room takes over the episode video; recorder start errors show a banner; backgrounds re-apply when the camera changes; storage-usage listing cached 10 min.
Copy/UI: games list is a grid with "Play" and a clear "Recording shows: Game + faces / Faces only" switch; "Show screen in recording"; People rows read "Good connection · All uploaded · 12 GB free · Noise standard"; header just says Recording/Paused; green room shows "All set / N things need a look" and no nav links for guests; overlay hint fixed ("Bilal’s head"); tier list 2-player rule matches the shared board; Library labels "Episode video / Camera / Mic (raw|cleaned) / Shared screen"; favicon.

## Verified (headless Chrome, fake devices, 3 tabs)
Sound files decode; keys play for everyone; markers sync; debate caption; mic_clean + mic_raw recorded; people status + remote Fix this; sign-in + wrong passcode; all 17 games start; Imposter roles + reveal; Fast Money muting/unmuting; auction bids/budgets; snake order; Guess the Sound hiding; Record/Pause/Stop synced across 3 tabs; each tab saved camera + mic, presser also saved active; plan sync; overlay sticker; Fix this. **Not yet verified:** the real LiveKit call between machines, R2 uploads, backgrounds and face tracking (blocked from the test sandbox).

## Env (Vercel)
Set: `LIVEKIT_URL`, `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `STUDIO_PASSCODE`, `AUTH_SECRET`.
Storage cap: `STORAGE_LIMIT_GB=150` (upload route refuses new chunks past it; Library shows usage and can delete episodes).
R2: bucket `studio-three-recordings`, token scoped to that bucket (Object Read & Write), CORS allows GET/PUT/HEAD from theboys.space. All `S3_*` vars set.

## Next up
1. Record a 2-minute test with 2–3 people on separate machines with a set on and one phone companion; confirm the Library downloads play (incl. Phone camera).
3. Server-side render that joins chunks into MP4 (R7) — the browser join is fine for WebM but large episodes are slow to download chunk by chunk.
4. Topics ranked by channel performance (C4, needs YouTube Analytics).
5. AI-generated overlay images instead of emoji (AO3) — swap `pickSticker`.

## Deployment
Vercel project `podcast` (prj_sH7X1srWqmvap8Tr4K3fJ3E3y6sN), team ansari342-2369s-projects. Next.js pinned to 15.5.29+ (Vercel blocks older 15.5.x, CVE-2025-66478).
