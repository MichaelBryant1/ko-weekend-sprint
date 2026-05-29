# QA Checklist — KO Weekend Sprint

## ✅ Verified automatically (by Claude)

- [x] **DB seeded** — 41 hangul + 300 words in `ko_sprint_learning_items` (sort_order 1–41 / 1–300).
- [x] **Audio** — all 1,364 MP3s generated (0 failures, no empty files) and served from
      Supabase Storage with `Content-Type: audio/mpeg`.
- [x] **App boots** (headless iPhone 12) — auth screen renders, Supabase client + config + FSRS
      all load, **zero JS console errors**.
- [x] **FSRS sanity** — a new card yields Again 1m / Good 1d / Easy 16d, easy → `review` state.
- [x] **Security — gate works both ways** (RLS simulation):
      allowlisted user sees 341 items; non-allowlisted user sees **0 items, 0 cards**.
- [x] **Security — anonymous** users cannot read items (permission denied), cannot read
      cards/allowlist (empty), cannot insert cards (401).
- [x] **Storage locked down** — temporary write policies removed; bucket is public-read only.
- [x] **Pages serves real HTML** at https://bryantanalytics.com/ko-weekend-sprint/ (text/html, app.js as JS).

## 👤 Needs a human (requires receiving the sign-in email)

Do these after the **one-time Auth setup** in README (Site URL + redirect allowlist):

- [ ] Enter your email → receive email → tap link on phone → app opens signed in.
- [ ] Dashboard shows your name + sprint goals.
- [ ] **Hangul:** tap ㄱ → hear "기역", see 3 example words, each plays audio. Mark known → tile shows ✓.
- [ ] **Words:** search "water" finds 물; tap → word audio + 3 sentences play; romanization + English shown.
- [ ] **Review:** Show answer → grade buttons show intervals → grading advances; finish a session.
- [ ] **Persistence:** refresh / log out and back in → progress (due counts, mastered) is retained.
- [ ] **Separate users:** sign in as a friend on another device → your progress does NOT appear for them.
- [ ] **Mobile:** layout is clean on an iPhone-sized screen; audio plays on tap.

> Tip: ask Claude to run the full logged-in walkthrough for you — it can drive the live site and
> read the sign-in email via the Gmail connector once the Auth setup above is done.

## Known limitations

- **Auth needs the 2-minute dashboard setup** (README §1) before anyone can log in — the redirect
  URL must be allowlisted for the email link to return to the app.
- **Autoplay** of audio in review may be blocked by mobile browsers until the first tap; a "Play"
  button is always present as the reliable control.
- **ㅐ/ㅔ, ㅙ/ㅚ/ㅞ** are taught as near-merged in modern Seoul speech (notes say so) — by design.
- **"Sentences viewed"** on the dashboard is a local-device counter (vanity metric); the real SRS
  state lives in the database.
- 3 leftover `audio/_test/*.mp3` clips remain in the bucket (harmless, unreferenced) — deleting
  storage objects needs the service-role key.
- The app repo is **public** (free plan can't do Pages on private repos). Only the public anon key
  is exposed; all access is gated by login + allowlist + RLS.
