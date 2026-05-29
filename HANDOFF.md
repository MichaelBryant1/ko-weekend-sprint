# HANDOFF — KO Weekend Sprint

Built in one session. Private Korean learning app for Michael + friends.

## Live
- **App:** https://bryantanalytics.com/ko-weekend-sprint/
- **Repo:** https://github.com/MichaelBryant1/ko-weekend-sprint (public — see note below)
- **Supabase:** project `ylceljdbapxeynyqphcr` (JP Atlas), tables prefixed `ko_sprint_*`
- **Audio:** Supabase Storage bucket `ko-sprint` (public read)

## 👉 Before friends can use it (you, ~2 min)
See **README.md §1–3**. Short version:
1. Auth → URL Configuration → set Site URL + add redirect URLs (the app URL).
2. (optional) add `{{ .Token }}` to the Magic Link email template for code entry.
3. `insert into ko_sprint_allowed_users …` for each friend's email.

## Decisions made
| Decision | Choice | Why |
|---|---|---|
| Database | New `ko_sprint_*` tables inside the JP Atlas project | Your call; isolated by prefix + RLS, $0 |
| App hosting | GitHub Pages (`/docs`) | Supabase Storage **refuses to serve HTML** (forces text/plain) |
| Repo visibility | Public | Free plan can't do Pages on private repos; only the public anon key is exposed |
| Audio hosting | Supabase Storage | Serves MP3/JS/CSS fine; one platform |
| Auth | Email link (primary) + 6-digit code (fallback) | No password management; robust on phones |
| Voices | Yooni (F) letters/words, Minjoon (M) sentences | Native Seoul Korean from ElevenLabs shared library; 2 voices = better listening training |
| Content | I authored the 300-word list + Hangul; 6 parallel Sonnet sub-agents wrote the 900 sentences; I validated/merged | Speed + quality; all Korean spot-checked, romaja normalized |
| FSRS | FSRS-6, 21 default weights, per-direction cards | Each direction scheduled independently (no "fake" mastery) |

## What was created
**Supabase**
- Tables: `ko_sprint_allowed_users`, `ko_sprint_learning_items` (341 rows), `ko_sprint_fsrs_cards`, `ko_sprint_review_logs`
- Function `ko_sprint_is_allowed()` + RLS policies (allowlist + per-user ownership)
- Storage bucket `ko-sprint` (public read), 1,364 MP3s + app files
- Allowlist seeded with `focusimmersion@gmail.com` (admin)

**Repo / local (`C:\Users\Micha\Downloads\ko-weekend-sprint`)**
- `app/` (=`docs/` for Pages): `index.html`, `app.css`, `app.js`, `config.js`, `fsrs.js`
- `content/`: `hangul.json`, `words_base.json`, `words_part_1..6.json`, `seed_items.json`, `audio_manifest.json`
- Writing additions: `content/hangul_strokes.json`, `content/hangul_blocks.json`, `/write` route, stroke animator, trace canvas, and separate writing FSRS directions.
- `scripts/`: `build_content.py`, `build_strokes.py`, `generate_audio.py`, `upload_to_storage.py`, `qa_smoke.mjs`
- `.env` (ElevenLabs key) — **gitignored, never pushed**

## Security notes
- All temporary "anon can write" policies used for seeding/upload were **dropped** after use.
  Current state: content readable only by allowlisted authenticated users; storage is public-read,
  writes require the service-role key.
- The ElevenLabs API key lives only in the local gitignored `.env`.
- ElevenLabs quota used: ~10.5K of 176K characters.

## If you want to change things
- **Add/edit words or sentences:** edit `content/words_*` → `python scripts/build_content.py` →
  re-seed (ask Claude) → `generate_audio.py` (new clips only) → `upload_to_storage.py`.
- **Restyle / fix UI:** edit `app/*`, copy to `docs/`, commit + push (Pages redeploys ~1 min).
- **Make repo private later:** if you upgrade GitHub or move to Netlify/Vercel/Cloudflare Pages.
