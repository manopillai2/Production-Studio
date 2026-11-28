# Work in progress — read this first after any interruption

Last updated: 2026-11-28, before the final render (Claude, Project 06 round 5)

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
1. DONE: the gentle leg solver and seat refits. The remaining 2–4 cm readings are resting contact (checked in the shots).
2. **NOW: the final 1080p render of Project 06** (started 2026-11-28 as a detached process, output in `scratchpad/exp5`). If interrupted: check `storage/media/exports/episode-17/` for a new folder; if there isn't one, restart the server (message the Project 07 session `production-studio-6a` first), close Edge, Teams and Phone Link, and re-run export.mjs detached.
3. Then: review the finished MP4 (a frame every 3 s, singing and blink runs, kite, ball, seesaw on "up"/"down"); update `EXECUTION-LOG.md` (round 5) and `LEARNINGS.md`; commit; tell the Project 07 session "export done"; tell the user (push with `! git push`).

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
