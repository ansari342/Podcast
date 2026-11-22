# Build status — handoff notes

Branch: `build/m1` · Spec: `docs/BRIEF.md` · Mocks: `docs/mocks/`

**For the next agent:** read `docs/BRIEF.md`, then this file. Work top to bottom through "Next up". Keep this file updated on every push.

## Done
- [x] **Scaffold** — Next.js 15 + TypeScript, dark theme tokens from the mocks (`app/globals.css`), config (`src/lib/config.ts`).
- [x] **Home** (`app/page.tsx`) — title + Open the studio. Session id is random for now (TODO: create Session via API, A1).
- [x] **Green room** (`app/green-room/[session]/page.tsx`) — live camera preview, Microphone + Speakers menus only, collapsed "More settings and troubleshooting" with real checks (browser support, free browser storage, network) and camera picker (S2, T1 partial).

## In progress
- [ ] Local recorder (R1–R4, R9)

## Next up (in order)
1. Local recorder: MediaRecorder video chunks + AudioWorklet 48 kHz WAV, 5 s chunks to OPFS, resume after closed tab (R1–R4, R9).
2. Studio UI shell: stage, controls under the video, Games / Topics / Setup tabs, 17-game catalog with player-count rules (U1–U4, G14–G15).
3. LiveKit call: token API route + room hook, mic/camera/share (S1, V1). Needs keys.
4. Uploads: presigned multipart to R2/S3, upload queue, library page (R3–R4, L1–L2). Needs keys.
5. Supabase auth + allowlist (A1–A3) and Session/Participant/Track tables (Data model).
6. Remaining M1/M2 items per `docs/BRIEF.md` → Build order.

## Needs from Ahsan (keys go in `.env.local` / Vercel env, never in git)
- LiveKit Cloud: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; Google provider enabled
- Cloudflare R2 (or S3): `S3_ENDPOINT`, `S3_BUCKET=studio-three-recordings`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`

## Decisions made
- No separate join page: invite link → `/green-room/[session]` → `/studio/[session]?role=guest`.
- COOP/COEP headers set in `next.config.mjs` for the audio worklet.
