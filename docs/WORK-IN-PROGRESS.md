# Work in progress — read this first after any interruption

Last updated: 2026-11-28, round 6 started (Claude, Project 06)

## Current task
**Project 06 (episode id 17) — round 5 fixes from the user's screenshots** (`screenshots/`), then a final 1080p render and a review of the finished video.
The user asked to fix everything in the screenshots, match every shot's action to the lyric words, and keep LEARNINGS and the logs updated continuously.

## Done (committed)
- **Riding:**
  - the leg solver is off for rides (it caused the broken legs); a GENTLE version is being tested;
  - swing seat 14 cm deep with the child at its back; seesaw plank and seat narrower; Mira's legs spread wider (52°);
  - merry-go-round seat at the very edge.
- **Mango on seats:** seated from real skin points against the equipment shapes (lift or lower); the seesaw nudge removed.
- **Background blur:** a focus band over all characters (Mango was blurred).
- **Mouth:** mipmaps back on (it broke up in medium shots); no dark outline above the teeth (the black line).
- **Ball:** real physics (kick, gravity arcs, squash, rolls about its centre).
- **Natural joints:** elbows never locked straight; soft standing knees; the wave hand in front of the face; cheer bends the elbows.
- **Direction (`docs/project-06/direction.mjs`, previous: `direction-v3.mjs`):**
  - every action timed to the words with `W(line, word)`;
  - the seesaw at the top on "up" and the bottom on "down" (`seesawOff`);
  - yes/no/wave shots are full shots;
  - "Wave hello" uses a dolly-in full shot;
  - balloons framed whole and lifting on "float";
  - the kite in front of Mira (profile, `holdKite`), lower, with a short tail; the camera frames the kite;
  - the ball only in the instrumental ball game.
- **Engine:** every action setting reaches the moves (height, nods, tugs…); rides keep their exact timing.
- **New projects:** the kids-first rules are in Claude's director prompt; the move catalog has the Project 06 moves; finger bones for new two-legged characters.

## In progress (resume here): Project 06 ROUND 6 (user feedback, 28 Nov 2026)
User feedback on the round 5 video:
- (a) "spin around" shots: too much moving at once (the camera orbits while the merry-go-round spins). Hold the camera still and spin more gently.
- (b) Mira's movements are too fast (swing hands and legs, head shake, wave). Make her polite, soft and slow so toddlers can follow and copy.
- (c) Make the ball colourful, matching the props and landscape.
- (d) Swing legs are still wrong in a later swing shot (the slow-chorus swing, around 2:14–2:23). Fix them in EVERY swing shot.

FOUND (round 6): an action's `seconds` = TOTAL of all repeats. The direction passed one cycle, so rides ran 8–10× too fast and then ENDED (Mira stood up in the slow-chorus swing). Fixed in direction.mjs (`period × repeats`, skip, climb) and applied.
Status: engine edits are built (Project 07 OK'd the build); direction applied. NEXT: re-check the swing/seesaw/slide clearance and the slow-chorus swing frames; check the gesture tempo, spin shots, ball and Mira's mouth; then export (message Project 07 first).

Steps:
1. Edit (no build yet; coordinate with Project 07 first):
   - MoveMaker: wave, shake and nod slower and softer; swingRide with hands steady on the chains and a gentle leg swing;
   - direction: no orbit on spin shots, slower merry-go-round;
   - the ball: a procedural rainbow beach ball (actor `procedural: 'beachball'`).
2. Message `production-studio-6a` for a build/export window, then `npx vite build` and `node docs/project-06/direction.mjs`.
3. Check: swing legs in all swing shots (clearance + close looks), gesture speed (frame runs), spin shots, the ball.
4. Export detached (coordinate with Project 07), review, update the log, LEARNINGS and this file, commit.

Another Claude session (`production-studio-6a`, Project 07 "My Little Home") works in this repo too. Coordinate server restarts and `client/dist` builds with it via SendMessage.

## How to resume
- The server: `node src/index.js` in `server/` (port 5175 serves `client/dist`; rebuild with `npx vite build` in `client/`).
- Re-apply the direction: `node docs/project-06/direction.mjs`.
- Tools: `tools/testing/clearance.mjs`, `peek.mjs` (`{face: 0}`, `{actor: i}`), `shots.mjs`, `export.mjs`.
- The user's preferences: kids-first direction; nothing through anything; update learnings and logs continuously; close unneeded apps; no new Meshy calls for Project 06.

---
# Project 07 "My Little Home" (episode id 18): a separate session's work
**Resume from `docs/project-07/RESUME.md`** (fixed facts, done, ordered next steps). Log: `docs/project-07/EXECUTION-LOG.md`.
- Meshy is finished: 18 calls / 247 credits used of the approved 25 / 324. No more Meshy calls without asking the user.
- Shared machine: the Project 06 session uses the same server (port 5175) and `client/dist`. Don't restart the server, rebuild dist or kill node/chrome during the other project's export; message that session first.
