# Project 07 — "My Little Home" — Execution log

Project number **7** · database id **18** · lyrics id 28 (approved) · `http://localhost:5175/#/project/18/export`

## Brief (user, 27 Nov 2026)
Mommy teaches her toddler six household objects in three rooms: sofa and TV (living room), bed and fan (bedroom), fridge and cup (kitchen). Pattern: Mommy introduces → the child acknowledges → the child repeats → the picture reinforces. The user's own song (~2:45) will follow. Target: 4K. Full creative delegation. **Meshy cap: 25 paid calls / 324 credits.** Plan: `ASSET-PLAN.md`.

## Meshy ledger (paid calls only; progress checks are free)
| # | Call | Asset | Credits | Result |
|---|---|---|---:|---|
| 1–7 | Preview images | Mommy, Little Leo, Sofa, Bed, Teddy Bear, Potted Plant, Fruit Bowl | 21 | Props good. Both characters rejected (see "Studio bug 1") |
| 8–9 | Preview images (retry, fixed prompts) | Mommy, Little Leo | 6 | Both right: correct outfits, plain background, A-pose, separated fingers, painted closed mouth |
| 10–14 | 3D from preview | Sofa, Bed, Teddy Bear, Potted Plant, Fruit Bowl | 150 | All clean: one piece each (the plant has 3 attached parts); nothing to cut |
| 15–18 | 3D from preview + rig with finger bones | Mommy, Little Leo | 70 | Mommy 1.62 m, 44 bones (fingers: thumb + middle only). Leo 0.95 m, 68 bones (all five fingers). Walking and running clips for both |
| | **Final total (balance check: 2,175 → 1,928)** | | **247 / 324** | **18 / 25 calls** |

All 7 assets checked on the Meshy thumbnails (contact sheet), approved and saved to My World: Mommy 107, Little Leo 108, Sofa 109, Bed 110, Teddy Bear 111, Potted Plant 112, Fruit Bowl 113. **No more Meshy calls are planned.**

## Studio bug 1: the character preview prompts lost their clothing (fixed)
- **Seen:** both character previews had busy meadow backgrounds full of plush creatures. Mommy wore a long blue dress, barefoot, instead of a cardigan, jeans and sneakers. Leo's outfit was wrong.
- **Cause, from the exact prompt sent** (job 96):
  1. `meshyPrompt` fitted the card's own description *after* reserving room for the World Style summary, so the clothing sentences and "plain background" were dropped.
  2. The summary itself said "Sculpted soft creatures".
  3. `meshyPlan` then chopped the summary mid-word to append the rig stance, whose wording ("two hind legs… front paws") was written for animals.
- **Fix** (`server/src/studio.js`):
  - The card prompt, the stance sentence (room reserved before fitting) and a new "Alone, centred, on a plain light background. No scenery, no other characters, animals or creatures." sentence (characters and props) always survive.
  - The World Style summary fills only the room that is left, in whole sentences.
  - "Creature" sentences are never sent.
  - Humans get a human stance sentence.
- **Verified:** `meshy-plan` (no Meshy call) now shows the full clothing, the plain-background sentence and the human stance for both characters.

## Stage 3: the song (done)
- `songs/What Is This_.mp3`, 164.64 s, copied to `music/what-is-this.mp3`.
- faster-whisper `small.en` with word timestamps (`music/transcribe.py`), then Needleman–Wunsch alignment to the 25 lyric lines (`music/align.mjs`): **25/25 lines, every word matched**. Word times are kept for word-timed actions.
- The song sings the lyrics once, in order. Structure:

| Time | Section |
|---|---|
| 0–5.8 s | Instrumental intro |
| 5.8–16.2 | Opening chorus |
| 16.6–28.4 | Sofa |
| 29.3–42.3 | TV |
| 42.7–55.3 | Bed |
| 56.9–68.9 | Fan |
| **68.9–91.5** | **Instrumental break (22.6 s)**: the walk from the bedroom to the kitchen |
| 91.5–103.7 | Fridge |
| 104.9–117.7 | Cup |
| 119.3–143.4 | Ending chorus |
| 143.4–164.6 | Outro (21 s) |

- Tempo: **89.1 bpm** (beat 0.673 s, first beat 0.455 s), from the audio's onset envelope (`music/beats.py`).
- Singers: Mommy on "This is a…" lines plus "together" lines; Leo on the chorus lines and "Oh, a…!" lines plus "together" lines. Voices were not separated by ear: the singer roles follow the user's lyric labels.
- Song uploaded as master (audio 211), line timing set and approved.
