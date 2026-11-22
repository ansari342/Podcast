# Studio Three

Private, browser-based podcast studio for a three-person show (Riverside-style local recording, shared "same room" set, built-in podcast games).

- **Spec:** [`docs/BRIEF.md`](docs/BRIEF.md) — source of truth.
- **Mocks:** [`docs/mocks/`](docs/mocks) — `.dc.html` design files (open in a browser or read the markup); `Studio.dc.html` is the main studio.
- **Progress / handoff:** [`BUILD_STATUS.md`](BUILD_STATUS.md) — read this first if you're picking up the work.

## Run

```bash
npm install
cp .env.example .env.local   # fill in keys (see BUILD_STATUS.md → Needs from Ahsan)
npm run dev                  # http://localhost:3000
```
