# Studio Three — Build Brief

Version: Nov 22, 2026 · Owner: Ahsan

## What to build

Build **Studio Three**: a private, browser-based podcast studio (like Riverside) for a three-person show. The host starts a session, up to three people join from a link, and the site records each person locally in high quality, uploads in the background, and produces one "active video" (whatever is on stage) plus a separate video for every person. Podcast games, a live topics feed, an editable episode plan, sound effects, reactions and AI overlays run inside the studio.

**This brief is the source of truth.** Where it differs from older material, this brief wins.

- **Mocks (visual and interaction reference):** https://claude.ai/artifact/Hwi6dKPSLijvNphCpHm5fb — match layout, flows and behavior. The drawn studio "set" is a placeholder for real artwork. Ask Ahsan for the mock source files if you can't open the link.
- **Users:** three accounts on an allowlist: the host (Ahsan) and two friends. Any account can host a session. No public sign-up, billing or teams.
- **Out of scope for v1:** native desktop or mobile apps, livestreaming, a full video editor, phones as recording devices.
- **Working name:** "Studio Three" is a placeholder; keep the name in one config value.

## Build order

Ship in four milestones; each must pass its exit test before the next starts. IDs refer to the Requirements tables.

1. **M1 — Record an episode.** Accounts, home, green room, studio call, local recording, upload, library downloads. A1–A3, S1–S4, R1–R9, S9–S10, S12–S14, T1–T5, L1–L2.
   *Exit test:* three full one-hour test episodes with zero lost files, tracks in sync within one frame, and a guest who closes the tab mid-session recovers their upload on return.
2. **M2 — Run the show.** Host and guest roles, guest join flow, full-screen studio with tabs, Setup tab (people, plan, sound effects, your audio and video), reactions, AI overlays, automatic player count, screen sharing, games framework and the launch games (Imposter, Tier list, Fast Money). U1–U4, SB1–SB2, RX1, AO1–AO4, PP1–PP3, G1–G3, G8–G9, G11, G14–G15, P1–P4, V1–V5, S6, S11, R8, L3, T6–T7.
   *Exit test:* a full episode where each launch game is played with 3 and with 2 people, and the active video shows or hides each game board as set.
3. **M3 — Shared room, topics, more games.** Matching framing, light and colour, shared desk, joined wide shot; Topics tab; the remaining games. S15–S20, C1–C4, G4–G7, G10, G12, G16–G24.
   *Exit test:* in the active video, the three people read as sitting in one room to someone who wasn't told otherwise.
4. **M4 — Post-production.** Transcript, clip maker, editor export, 4K. L4–L6, S5.

## Tech stack and architecture

The live call and the recording are separate paths: the call may degrade, the local recording never does. These are recommended choices; swap any with a short note on why.

| Layer | Recommendation | Notes |
| --- | --- | --- |
| Web app | Next.js + TypeScript, React | Desktop Chrome and Edge first, then Safari and Firefox |
| Auth | Google sign-in and email magic link, with an allowlist | Three accounts |
| Live call, screen share | Hosted WebRTC SFU (LiveKit Cloud or Daily) | Data channel or WebSocket for shared state; per-listener audio muting (Fast Money) and per-viewer video hiding (Guess the Sound) needed |
| Local recording | MediaRecorder (video), AudioWorklet (48 kHz PCM to WAV), 5 s chunks in OPFS | Chunks kept until the server confirms them |
| Upload | Resumable multipart upload to S3 or Cloudflare R2 via presigned URLs | Resume on reopen |
| Noise cancellation | RNNoise (WASM) or a commercial SDK, applied to the call; raw mic always recorded too | Three levels |
| Backgrounds and set | MediaPipe segmentation on WebGL/WebGPU, compositing a seat-matched set image | Raw camera always recorded too |
| AI overlays | Image generation model + face/head tracking (e.g. MediaPipe Face Mesh) | Overlay pinned to the person, active video only |
| Database | Postgres (e.g. Supabase or Neon) | See Data model |
| Render worker | FFmpeg job queue: active video, audio exports, later transcript | Builds the active video from uploaded tracks plus game events |

```
 EACH PERSON'S BROWSER TAB (x3)                 CLOUD SERVICES
 ┌────────────────────────────┐                 ┌──────────────────────────────┐
 │ Live call + effects        │◄── audio/video ─►│ Media server (SFU), <300 ms │
 │ (noise cancel, set, share) │     screen       │                              │
 │ Studio UI                  │◄── games, plan ─►│ Realtime state + API, <200ms │
 │ (games, plan, topics, fix) │     topics       │ (auth, sessions)             │
 │ Local recorder  ★          │                  │                              │
 │ (1080p + WAV, 5 s chunks)  │                  │                              │
 │        │                   │                  │                              │
 │        ▼                   │                  │                              │
 │ Upload queue               │── file chunks ──►│ Object storage               │
 │ (resumes after crash/close)│                  │        │                     │
 │                            │                  │        ▼                     │
 │                            │                  │ Render worker (active video, │
 │                            │                  │ audio files, transcript)     │
 │                            │                  │        │                     │
 │ Library                    │◄── downloads ────│ Library API                  │
 └────────────────────────────┘                 └──────────────────────────────┘
```

The recorder is the critical path: build and test it before anything visual.

## Screens

Six screens; the studio has host and guest versions of one template. Global navigation is two links, **Record** and **Library**. No step indicators anywhere. Visual style: dark UI (#0E0F12 ground), one orange accent (#FF7A45), Space Grotesk headings, Inter body. Keep on-screen text to a minimum.

### 1. Home (host)
- New episode: title and **Open the studio**. No player count to enter; it's detected from who joins.
- Recent episodes list linking to the library.

### 2. Green room (guests)
- **The invite link opens the green room directly.** No separate join page; if the guest isn't signed in, a one-tap Google or email sign-in appears over the green room.
- Large preview of how you'll look in the recording. The seat in the shared set is assigned automatically.
- Right column shows only **Microphone** and **Speakers** menus, and **Enter studio**.
- Everything else is hidden by default under **More settings and troubleshooting**: background and noise cancellation, all checks, camera and mic details (level meter, gain, echo cancellation, auto gain) and Fix this (T1–T6). A failed check still shows a warning with its own Fix this.
- The host skips the green room and checks devices in the studio's Setup tab.

### 3. Studio (host and guest, one template)
The person's role only hides host-only controls (starting games, removing people, Fix this for others).

- **Stage.** Shows the shared room by default, with no name tags. When a game is on or someone shares a screen, the stage shows that activity beside a strip of everyone's faces.
- **Controls directly under the video.** Large buttons. Left: mic, camera, share screen, React, Overlay (icons with tooltips). Centre: **Record, which anyone can press**, then a 3-2-1 countdown on every screen, then the timer with Pause and Stop ("Stop recording for everyone?"). Right: Leave. While Games or Topics is open, the same controls sit at the bottom of the screen.
- **Top bar.** Episode title, "Recording 4 videos" while recording (opens a list: the active video and what it shows right now, plus one video per person), and three tabs with icon and label: **Games, Topics, Setup**.
- **Games tab.** Replaces the stage with just the list of games: name, one short line, Start (host). Games that need more players are greyed out with "Needs 3 players". Host also sees a small "Board on recording / Faces only" switch per game. Starting a game returns to the stage.
- **Topics tab.** Replaces the stage with the topics list: tag (Trending / Works for us), topic, debate prompt. Filters All / Trending / Works for us. Host: Show on screen (puts a "Tonight's debate" caption on the video). Guests: Upvote.
- **Setup tab.** Opens beside the stage (the stage shrinks; everyone stays visible). Four sections:
  1. **People:** how many are in the room, invite link with Copy, each person's status (issues flagged), Fix this for them (host).
  2. **Plan:** "Now … · Next …" summary and the editable plan list (P1–P4).
  3. **Sound effects:** nine pads on keys 1–9, for everyone.
  4. **Your audio and video:** noise cancellation, background, layout, devices, Fix this.
- **React.** Four reactions that float briefly over your seat. (No raise hand.)
- **Overlay.** Type a prompt such as "Add a hat to Ahsan's head", pick who it's for, Generate; the overlay sticks to that person (AO1–AO4).

### 4. Game screens (Imposter, Tier list, Fast Money)
- Each has a switch for whether the game board appears in the active video. Details in Games spec.

### 5. Library
- Episode detail: active video player; file table with the active video and one video per person first, then raw camera, raw and clean audio, screen, game and sound-effect tracks, markers and game events (CSV/JSON); Download everything (ZIP); markers and game moments with Clip 9:16; upload status per person.

## Requirements

P0 = needed for the first real episode, P1 = soon after, P2 = later.

### Accounts (A)

| ID | Requirement | Pri |
| --- | --- | --- |
| A1 | Google sign-in or email magic link; stay signed in on that browser | P0 |
| A2 | Allowlist of three accounts; anyone else is refused | P0 |
| A3 | Profile: name, avatar, default camera, mic and speakers | P0 |
| A4 | One-off guest invite with no account, 24-hour expiry | P2 |

### Studio and roles (S1–S8)

| ID | Requirement | Pri |
| --- | --- | --- |
| S1 | Live call for up to 3 people over WebRTC, under 300 ms delay | P0 |
| S2 | Green room with preview, mic and speaker pickers and browser check | P0 |
| S3 | Anyone in the session can start, pause, resume or stop recording (3-2-1 countdown on every screen; Stop confirms for everyone). Host-only: remove someone, start games | P0 |
| S4 | Recording dot and timer on every screen | P0 |
| S5 | Text chat saved with the session | P2 |
| S6 | Layouts: one room, tiles; game or screen plus faces strip | P1 |
| S8 | Timestamped markers | P1 |

### Studio layout and live tools (U, SB, RX, PP)

| ID | Requirement | Pri |
| --- | --- | --- |
| U1 | Full-screen stage; the shared room by default; no name tags on the video | P0 |
| U2 | Games and Topics open as full views in place of the stage, showing only their list (no participant video or names). Setup opens beside the stage and the stage shrinks so everyone stays visible. Starting a game returns to the stage | P0 |
| U3 | During a game or screen share the stage shows the activity beside a strip of everyone's faces | P0 |
| U4 | Tabs with icon and label at the top right: Games, Topics, Setup. Only Setup shows who and how many are in the room. Controls directly under the video: large mic, camera, share, React and Overlay buttons; Record or timer in the centre; Leave on the right | P0 |
| SB1 | Sound effects in the Setup tab: nine sounds (buzzer, ding, drumroll, applause, rimshot, airhorn, crickets, gasp, one upload), played by click or keys 1–9 | P0 |
| SB2 | Sounds go into the active video and their own track; anyone in the session can play them | P0 |
| RX1 | React button: four reactions that float briefly over the sender's seat | P1 |
| PP1 | People section in Setup: invite link with Copy, everyone in the session with their status | P0 |
| PP2 | Per person: upload %, upload speed and connection; issues flagged | P0 |
| PP3 | Host can run Fix this for a guest from People | P1 |

### AI overlays (AO)

| ID | Requirement | Pri |
| --- | --- | --- |
| AO1 | Overlay button opens a prompt: pick who it's for (or name them in the prompt, e.g. "Add a hat to Ahsan's head") and press Generate; quick ideas fill the prompt | P1 |
| AO2 | The site generates the overlay (image model) and pins it to that person using face and head tracking, so it follows them as they move | P1 |
| AO3 | Overlays show in the active video only; each person's own video stays clean. A list of what's on screen, each with Remove | P1 |
| AO4 | Anyone can add overlays; one overlay of a kind per person (a new hat replaces the old one) | P2 |

### Recording (R)

| ID | Requirement | Pri |
| --- | --- | --- |
| R1 | Each browser records its own camera and mic locally, independent of call quality | P0 |
| R2 | Video up to 1080p30 (4K later); audio 48 kHz WAV | P0 |
| R3 | 5 s chunks saved to browser storage and uploaded during the session | P0 |
| R4 | Chunks survive a crash or closed tab and resume uploading on return | P0 |
| R5 | At least four videos per episode: one active video (whatever is on stage: everyone in the room, or a game board or shared screen with everyone's faces) plus one per person. Screen, game and sound-effect tracks come on top | P0 |
| R6 | All tracks share one clock; aligned within one frame | P0 |
| R7 | Audio-only file per person | P0 |
| R8 | Each person's upload status and free space visible in Setup | P1 |
| R9 | "Leave page?" warning while recording or uploading | P0 |

### Sound and shared room (S9–S20)

| ID | Requirement | Pri |
| --- | --- | --- |
| S9 | Noise cancellation per person: Off / Standard / Strong, live | P0 |
| S10 | Raw mic recorded alongside the cleaned track | P0 |
| S11 | Host sees each person's noise-cancel and background status | P1 |
| S12 | Background per person: Off, Blur, Studio set | P0 |
| S13 | One set per session, chosen by the host, locked during recording | P0 |
| S14 | Seat-matched views: one room rendered from left, centre and right seats; seats are assigned automatically (guests don't pick) | P0 |
| S15 | Auto-framing: same head size and eye line for everyone | P1 |
| S16 | Light and colour matched to the set | P1 |
| S17 | Shared foreground (desk edge, mics) in front of each person | P1 |
| S18 | Tiles join into one continuous wide shot | P1 |
| S19 | Raw camera kept so backgrounds can be redone after the session | P1 |
| S20 | Set library: 4–6 built-in sets plus host uploads | P1 |

### Plan / itinerary (P)

The weekly plan arrives from the app Instinct and is a **proposal, not a fixed order**.

| ID | Requirement | Pri |
| --- | --- | --- |
| P1 | Import the weekly plan from Instinct and attach it to the next session (import method is an open question) | P0 |
| P2 | The plan lives in the Setup tab (between People and Sound effects) with a "Now … · Next …" summary; Next is the first unfinished item after Now | P0 |
| P3 | Below the summary, the plan is an editable list: tick done, rename inline, move up or down (drag on desktop), Start any item to make it Now, Add item. No times shown | P0 |
| P4 | Host and guests can edit; changes sync live to everyone and are saved with the episode | P1 |

### Topics (C)

| ID | Requirement | Pri |
| --- | --- | --- |
| C1 | Topics tab: tag, topic and one-line debate prompt; updates live. Store a reason for each suggestion (not shown) | P1 |
| C2 | Two sources, tagged: Trending (recent news and social trends) and Works for us (what performs well on your YouTube channel); filters All / Trending / Works for us | P1 |
| C3 | Host: Show on screen puts a "Tonight's debate" caption on the recording. Guests: upvote | P1 |
| C4 | Topics used are logged with timestamps and feed back into future suggestions | P2 |

### Troubleshooting (T)

| ID | Requirement | Pri |
| --- | --- | --- |
| T1 | Details and troubleshooting, hidden by default (green room: "More settings and troubleshooting"; studio: Setup tab): browser, free space, upload and download speed, connection delay, camera, mic, echo | P0 |
| T2 | Device controls: camera (menu, on/off, resolution); mic (menu, on/off, level meter, gain slider, sample rate, echo cancellation, auto gain); speakers (menu, volume, test sound, headphones detected) | P0 |
| T3 | A failed check shows a warning with its own Fix this button | P0 |
| T4 | General Fix this: pick a symptom (can't be heard, can't hear others, echo, camera black or frozen, choppy); the site runs checks, shows what it found and fixes what it can (gain, device, volume, echo settings, call quality) | P0 |
| T5 | Fixes never stop the local recording; the live call may drop to 720p | P0 |
| T6 | If still broken: auto-switch device, restart audio/video, or ask the host with the diagnosis attached | P1 |
| T7 | Host can run Fix this for a guest from the People section | P1 |

### Screen sharing (V)

| ID | Requirement | Pri |
| --- | --- | --- |
| V1 | Anyone shares a tab (with audio), a window or the whole screen | P0 |
| V2 | "Show in the active video" switch: on records the screen as its own track and shows it in the active video; off shows it to the call only | P0 |
| V3 | Whoever shares sets the switch | P1 |
| V4 | Each game has a "board on recording / faces only" switch with a default (see Games spec) | P0 |
| V5 | Switch available in the games list (host) and on the game screen | P1 |

### Games framework (G)

| ID | Requirement | Pri |
| --- | --- | --- |
| G8 | Host starts and controls games; each player sees their own view; the recording gets a separate audience view | P0 |
| G9 | Game state in sync for everyone within 200 ms | P0 |
| G10 | Prompt packs: built-in, host-written, or AI-generated from a topic | P1 |
| G11 | Scores carry across games and episodes | P1 |
| G12 | Game events logged with timestamps; clean game-only track | P1 |
| G13 | Plugin structure so new games don't touch the recorder | P2 |
| G14 | People count is detected from who is in the room (nobody enters it); games update live as people join or leave | P0 |
| G15 | Each game declares a minimum and rules per count; below the minimum it's disabled with "Needs N players"; with fewer it uses its 2-player or solo rules | P0 |

### Library (L)

| ID | Requirement | Pri |
| --- | --- | --- |
| L1 | Episode list with title, date, people | P0 |
| L2 | Download the active video, per-person video and audio, or a ZIP | P0 |
| L3 | Markers, reactions and game events as CSV and JSON | P1 |
| L4 | Transcript with speaker labels | P2 |
| L5 | Export a timeline for Premiere, Final Cut or Resolve | P2 |
| L6 | Clip maker: 9:16 clip from any marker | P2 |

## Games spec

Seventeen games. G1–G3 ship in M2, the rest in M3. Picks are based on formats popular on YouTube podcasts and in viral party-game videos right now. "List line" is the only description shown in the Games tab. "Rec" is the default for the board-on-recording switch.

| ID | Game | List line | Min | Solo | 2 people | 3 people | Rec |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G1 | Imposter | Find who doesn't know the word. | 3 | Off | Off | Two get the secret word, the imposter gets only the category; one-word clues for 3 rounds, then vote | Off |
| G16 | Imposter question | Spot who got a different question. | 3 | Off | Off | Everyone answers a question privately; the imposter secretly gets a different one. Answers revealed together, then vote | On |
| G2 | Tier list | Rank anything from S to F. | 1 | Rank solo | Each builds a list, then compare | One shared list; majority breaks ties | On |
| G3 | Fast Money, no sound | Read the asker's lips. | 2 | Off | One asks out loud; the other can't hear and reads lips | One asks out loud; the other two can't hear and race to read lips | On |
| G4 | Blind ranking | Rank 1–5 without seeing what's next. | 1 | Rank alone | Side by side, compare at the end | Three rankings revealed together | On |
| G17 | Auction draft | $20 each. Bid your way to the best 5. | 2 | Off | Each has $20 to bid on items and build the perfect list of 5; poll picks the best list | Same with three bidders; vote picks the best list | On |
| G5 | Snake draft | Take turns picking the best list. | 2 | Off | 1v1 snake draft (pick order 1-2, 2-1, …) | Three-team snake draft (1-2-3, 3-2-1, …) | On |
| G6 | Most Likely To | Point at who fits. | 3 | Off | Off | Everyone points at who fits the prompt | Off |
| G6b | Red Flag or Green Flag | Vote red or green. | 1 | Solo verdicts | A split starts a 30 s debate | Majority wins; the odd one out defends | Off |
| G7 | Higher or Lower | Guess higher or lower. | 1 | Keep a streak | Take turns, best streak wins | Take turns, best streak wins | On |
| G18 | Trivia | Guess the answer, reveal when ready. | 1 | Guess, then reveal | Closest guess wins | Closest guess wins | On |
| G19 | Thermostat | Show a secret number without words. | 2 | Off | One shows a secret number with body language; the other guesses | One shows; the other two race to guess | On |
| G24 | Thermostat: Questions | Ask questions to find their secret number. | 2 | Off | One holds a secret number 1–10; the other asks questions, then guesses | One holds the number; the other two take turns asking and race to guess | On |
| G20 | Name 3 in 5 | Name three things in five seconds. | 1 | Beat the clock | Take turns; the other judges | Take turns; the others judge | On |
| G21 | Guess the Sound | Guess the sound in three seconds. | 2 | Off | One makes a sound off camera; the other guesses in 3 s | One makes the sound; the other two race | On |
| G22 | Tell Me Without Telling Me | Describe a word under a twist rule. | 2 | Off | Describe a secret word under a twist rule; the other guesses | Describe it; the other two race | On |
| G23 | Guess the Price | Closest without going over wins. | 1 | Get within 10% | Closest without going over | Closest without going over | On |

**Game-specific behavior**

- **Imposter.** Each player's secret card is private (tap to hide or peek). Clue turns with a timer; votes can be saved early. With the board on, the audience view shows the word and who the imposter is; with it off, the recording shows faces only.
- **Imposter question.** Each player privately gets a question, for example "How many times do you eat in a day?". The imposter gets a different question with a similar kind of answer ("How many times do you check your phone in an hour?"). Everyone locks in an answer; answers are revealed side by side with the real question, then everyone votes. The recording never shows who got which question until the reveal.
- **Blind ranking.** The host picks a category and how many slots (default 5). Items are revealed one at a time; each player puts each item in a slot from 1 to 5 the moment it appears, without knowing what's coming next, and can't move it later. At the end, all rankings are shown side by side and the group argues about the differences.
- **Most Likely To.** A prompt appears ("Most likely to forget a birthday"); on the count of three everyone points at someone on camera, and the site records the votes. The person with the most votes explains themselves.
- **Red Flag or Green Flag.** A dating or life scenario appears ("They reply to texts a day later"); everyone votes red or green at the same time. With 2, a split triggers a 30 s debate; with 3, the odd one out has to defend their vote; solo, the player gives a verdict and a reason.
- **Higher or Lower.** The site shows an item with a known number (price, followers, box office) and a second item; players guess whether the second is higher or lower. Correct guesses build a streak; with 2 or 3 people, players take turns and the best streak wins.
- **Tier list.** Shared S–F board, drag and drop with live cursors, one "up next" item at a time; host adds items (search or upload images), locks the board and exports it as an image. Group or everyone's-own mode.
- **Fast Money, no sound (lip reading).** One person is the asker and reads a survey question out loud. The site cuts the asker's voice **for the other players only**, so they must read the asker's lips. Guessers still hear each other, and the asker hears them. **All mics are recorded**, and the active video carries everyone's audio, including the question. Guessers see the asker large with a mouth zoom and a "You can't hear [asker]" badge; the asker sees a private question card with the top survey answers and marks who got it. 20 s per question, five questions, then the asker rotates. Needs per-listener muting in the SFU.
- **Auction draft.** The host picks a category (e.g. fast-food restaurants) and items come up one at a time. Each player starts with $20; bids go up in $1 steps with a short timer; the highest bid wins the item and the money is spent. Everyone must end with a list of 5 (the site holds back enough budget so a player can always fill their list). At the end, the lists are shown side by side and a group vote or audience poll picks the perfect list.
- **Snake draft.** Players take turns picking items from a category; the pick order reverses every round (1-2-3, then 3-2-1) so whoever picks last gets the next pick first. No money. Lists compared and voted on at the end.
- **Trivia.** A random question with a number or fact answer (e.g. "How many words are in the English language?"). Everyone guesses out loud; the answer stays hidden until someone presses **Reveal answer**. Next question loads a new one and hides the answer again. Questions come from built-in or AI-generated packs, each stored with its answer and a source.
- **Thermostat.** The site privately shows one player a number from 1 to 10. Without words or counting on fingers, they show it with facial expression and body language (1 = ice cold, 10 = boiling) in response to a prompt ("How do you feel about pineapple on pizza?"). Guessers lock in a number; closest wins. The audience view shows the secret number.
- **Thermostat: Questions.** The site privately gives one player (the holder) a number from 1 to 10. The other players ask open questions that the holder must answer at that level of the scale, for example "Give me a baseball player" (1 = a player nobody has heard of, 10 = an all-time great) or "Name a vacation spot" (1 = a terrible trip, 10 = a dream trip). Guessers can ask up to 5 questions (taking turns when there are two of them), then lock in a number. Exact guess scores 3 points, one off scores 1. The audience view shows the secret number the whole time so viewers can judge the answers; the holder rotates each round. Question ideas come from built-in or AI packs.
- **Name 3 in 5.** The site shows a category ("Breakfast cereals") and a 5-second timer; the player must name three things before it runs out. Others judge with a thumbs up or down; solo, it's beat the clock. Categories come from built-in or AI packs.
- **Guess the Sound.** One player makes a sound with an everyday object (crinkling paper, pouring water). The site **hides that player's video from the guessers only** (they still hear the sound; the recording keeps the video so viewers see the object). Guessers have 3 seconds to name it; wrong guesses lose a point. Needs per-viewer video hiding, like Fast Money's per-listener muting.
- **Tell Me Without Telling Me.** The describer privately gets a secret word plus a random twist rule (no talking, one-syllable words only, or no hands). They have 60 seconds to get the others to say the word. The audience view shows the word and the rule.
- **Guess the Price.** The site shows a product with a photo; everyone locks in a price. Closest without going over wins (solo: within 10% scores). Product packs store the real price and a source.
- **All games.** The host starts and ends games; guests see games open automatically. Scores feed tonight's score and season standings.

## Data model and integrations

A starting schema; extend as needed.

| Entity | Key fields |
| --- | --- |
| User | id, name, email, avatar, default devices, is_allowed |
| Session (episode) | id, title, host_id, set_id, status (setup, live, paused, ended), started_by, started_at, ended_at |
| Participant | session_id, user_id, role (host, guest), seat (left, centre, right; auto-assigned), noise_level, background_mode, joined_at, left_at |
| Track | session_id, user_id, kind (active, camera_processed, camera_raw, mic_raw, mic_clean, screen, game, sfx), chunk_count, bytes, upload_status |
| Chunk | track_id, index, start_ms, bytes, checksum, uploaded_at |
| PlanItem | session_id, position, title, done, is_now, source (instinct, manual) |
| Topic | id, title, debate_prompt, source (trend, channel), reason, created_at; plus per-session votes and on_screen times |
| GameRun | session_id, game_id, people_count, record_board, started_at, ended_at, results |
| GameEvent | game_run_id, t_ms, type, payload |
| Overlay | session_id, target_user_id, prompt, kind, asset_url, created_by, removed_at |
| Marker | session_id, t_ms, label, created_by |
| Set | id, name, seat images (left, centre, right), foreground layer |
| Score | user_id, session_id, points |

**Integrations**

- **Instinct (weekly plan).** Import method unknown: support a webhook endpoint if Instinct can call one, else a pasted share link or uploaded file. Map each entry to a PlanItem with source = instinct.
- **YouTube Analytics API ("Works for us" topics).** OAuth to the channel; pull per-video views, watch time and comments, tag episodes by topic, and rank topic types by performance.
- **Trends ("Trending" topics).** A news and trends source (e.g. a news API plus Google Trends); an LLM writes the one-line debate prompt and stores the reason. Refresh every few minutes during a live session.
- **Image generation (AI overlays).** Generate a transparent overlay from the prompt; anchor it with face/head landmarks.

## Quality bar and acceptance tests

| Area | Target |
| --- | --- |
| Reliability | Zero lost recordings: chunks kept locally until the server confirms them |
| Sync | All tracks within 33 ms (one frame) over 2 hours |
| Latency | Call under 300 ms; shared state under 200 ms |
| Length | 3-hour sessions without degrading |
| Performance | Call, recording, noise cancellation and backgrounds under 50% CPU in one tab on a 2021 laptop; 30 fps segmentation on the GPU |
| Storage | Warn below 20 GB free; about 6–8 GB per person per hour at 1080p |
| Network | Call adapts down to 2 Mbps upload; recording quality never drops |
| Security | HTTPS and DTLS-SRTP in transit, encrypted at rest; recordings visible only to that session's people |
| Privacy | Consent on join; nothing recorded before the countdown |
| Deploys | A live session is never interrupted by a deploy |
| Cost | Under about $40 a month for three users (excluding AI generation) |
| Accessibility | Real buttons and labels, 44 px targets, icon buttons labelled, text contrast 4.5:1 |

**Acceptance tests (run before calling a milestone done)**

- [ ] Kill a guest's tab mid-recording; on reopen their upload resumes and the final tracks have no gap before the crash point.
- [ ] Throttle one guest to 2 Mbps: the call degrades, their local recording is still 1080p.
- [ ] Clap test: all tracks line up within one frame at minute 1 and minute 120.
- [ ] A guest presses Record: the countdown shows on every screen and all four videos start.
- [ ] Have one person leave mid-session: Imposter, Imposter question and Most Likely To disable; other games switch to 2-player rules.
- [ ] Imposter with the board off: the secret word never appears in any recorded file.
- [ ] Fast Money: the two guessers hear nothing from the asker but still hear each other, and the asker's mic is in every recording.
- [ ] Guess the Sound: the guessers can't see the sound-maker's video but hear the sound, and the active video shows the object.
- [ ] Trivia: the answer is never visible (on screen or in the recording) before Reveal answer is pressed.
- [ ] Share a tab with "Show in the active video" off: it's absent from the active video and from the file list.
- [ ] Add a hat overlay to one person: it follows their head as they move and appears only in the active video.
- [ ] Quiet-mic fix: lower gain to 10%, press Fix this, and the warning clears with the gain raised.
- [ ] Reorder, rename and add plan items as a guest; the host sees changes within a second.

## Open questions

Raise these with Ahsan before building the parts they affect; until answered, use the default in brackets.

- [ ] **Instinct:** what does it send and how (webhook, link, file)? [Support paste or upload of a link or file first.]
- [ ] **Media layer:** hosted SFU or self-hosted? [Hosted, LiveKit Cloud.]
- [ ] **Active video:** built after the session from tracks, or recorded live? [Built after, by the render worker.]
- [ ] **Studio sets:** who makes the artwork for the three seat angles? [Ship one placeholder set.]
- [ ] **Game content:** Fast Money survey answers, Trivia questions, Guess the Price products and category packs — written by you, polled from the audience, or AI-generated? [AI-generated packs, editable.]
- [ ] **AI overlay model and cost:** which image model, and a per-episode cap? [Pick a hosted model; cap at 20 overlays per episode.]
- [ ] **Where episodes go:** YouTube directly, a podcast host, or an editor first? [Downloads only in v1.]
- [ ] **Retention:** how long to keep raw tracks? [Archive raw after 90 days.]
