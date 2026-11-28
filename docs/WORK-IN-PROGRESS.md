# Work in progress — read this first after any interruption

Last updated: 2026-11-28 (Claude, during Project 06 round 5)

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

## In progress (resume here)
1. A gentle leg solver for rides (`Clearance.js` `clearLegs(..., 'gentle')`, called by default in `SceneEngine._poseActors`). Last clearance run: 10 of 12 ride shots still have 2–4 cm calf contact with the swing seat, plus Mango's tail tip and hock grazing by 2–4 cm.
   - Next: visually judge, or fix by geometry (seat edge), then run the full clearance check.
2. A full contact sheet of all 52 shots (`tools/testing/shots.mjs 17 <dir> 0.55`), then review it.
3. **Final render:** close Edge, Teams and Phone Link, then start it as a detached process:
   `Start-Process node -ArgumentList "export.mjs","17","<dir>","1080p" -WorkingDirectory tools/testing` (with env GPU=1).
   Watch progress via `storage/tmp/render-<id>` (6,371 frames).
4. Review the finished MP4: a frame every 3 s plus the singing and blink runs. Then update `docs/project-06/EXECUTION-LOG.md`, `docs/LEARNINGS.md` and this file, and commit. Pushing is blocked by the safety check, so the user runs `! git push`.

## How to resume
- The server: `node src/index.js` in `server/` (port 5175 serves `client/dist`; rebuild with `npx vite build` in `client/`).
- Re-apply the direction: `node docs/project-06/direction.mjs`.
- Tools: `tools/testing/clearance.mjs`, `peek.mjs` (`{face: 0}`, `{actor: i}`), `shots.mjs`, `export.mjs`.
- The user's preferences: kids-first direction; nothing through anything; update learnings and logs continuously; close unneeded apps; no new Meshy calls for Project 06.
