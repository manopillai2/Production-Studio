# Project 07 — RESUME HERE (keep this file current; read it first after any interruption)

Last updated: 2026-11-28 ~00:00, during Stage 4/5 test renders.

## NOW (read this first)
- Follow the user's cost rules in `~/.claude/CLAUDE.md` (Sonnet by default, Haiku for routine helpers, token-efficient checks).
- **Usage limit:** pause and continue after the reset (`autoContinueAtUsageLimit` is on; re-create the 30-minute cron in a new session).
- Coordinate with the Project 06 session before builds, restarts and long renders.
- Fixed and seen in renders (commit 7f225d3): gestures play over held postures; sips reach the mouth; sleeping eyes and covering quilt; tall open-front rooms; side-on bed; cup hand-over; intro title framing.
- **Running:** the overlap check (`clearance.mjs 18`, output in this session's scratchpad `cl2`/`cl2.log`; re-run if lost).
- Next: fix overlaps, one full contact sheet and a blink check, then the 1080p export (`Start-Process node export.mjs 18 <dir> 1080p`, env GPU=1), review the MP4, 4K, final report, LEARNINGS.

## Fixed facts
- Episode id **18**, project number 7, approved lyrics id **28**. Server: `http://localhost:5175`. Restart it with `Start-Process node src/index.js` in `server/`.
- **Meshy cap: 25 paid calls / 324 credits. FINAL use: 18 calls / 247 credits (balance 1,928). Meshy work is done.** Never exceed the cap; ask the user first. The ledger is in `EXECUTION-LOG.md`.
- Song: `songs/What Is This_.mp3` (164.64 s), copied to `docs/project-07/music/what-is-this.mp3`.
- Cards: Mommy 68, Little Leo 69, Sofa 70, Bed 71, Teddy Bear 72, Potted Plant 73, Fruit Bowl 74.
- Whisper venv: `C:/Users/atcha/AppData/Local/Temp/claude/4d02aa0d02ff76d7/75ce594c-43bc-4f0e-834e-960f3b36f5ae/scratchpad/whisper-venv/Scripts/python.exe` (run with `-I`).

## Done
- [x] Plan (`ASSET-PLAN.md`), project and lyrics (`setup.mjs episode`), 7 cards.
- [x] Previews checked. The prop previews are good; the characters needed a retry after fixing the prompt bug in `server/src/studio.js` (see log).
- [x] 3D for the 5 props: clean single pieces, no stray islands.
- [x] `client/src/engine/Home.js`: room builder (living, bedroom, kitchen), tv, fan, fridge, cup, nightstand, seats, blanket.
- [x] SceneEngine: home items are built, `noCast` is respected, and `_holdProps` holds a cup in a palm with a tilt to sip. **Not yet built or rendered.**
- [x] Whisper transcription: `music/words.json`.
- [x] Alignment: `music/timing.json` (25/25 lines, every word matched, word times kept). Beats: `music/beats.json` (89.1 bpm, period 0.673 s, first beat 0.455 s).
- [x] Mommy (1.62 m, thumb + middle finger bones) and Leo (0.95 m, all 5 fingers) rigged, with walking and running clips. All 7 cards approved and saved to My World (items 107–113). **Stage 2 assets done.**
- [x] Song uploaded as master (audio id 211), timing approved, singers set (Mommy card 68, Leo 69). **Stage 3 done.**

## In progress / next (in order)
5. [x] New moves in `MoveMaker.js`: point, present, kneel, sitRelax, lie, holdCup, sip, shiver, pat, hug, tuck, sway, plus `BASES` and `act.base` (a gesture on a kneel/sit/lie posture). Engine: fridge `hinge`, `camera.include` points, room `onCamera` (hides wall decor seen from behind).
6. [ ] **WAIT for the Project 06 session's "export done" message** before `npx vite build` or a server restart. Then `npx vite build` in `client/`, then test renders of each room with `tools/testing/peek.mjs` / `shots.mjs`.
7. [x] Direction written: `docs/project-07/direction.mjs`, 32 shots covering 0–164.64 s, word-timed. Re-apply with `node docs/project-07/direction.mjs` (`--dry` lists the shots).
8. [ ] QA: `clearance.mjs 18`, contact sheets, face close-ups and medium shots, blinks. Fix and re-render.
9. [ ] Export at 1080p, check, then 4K. Update the logs and LEARNINGS, commit.
