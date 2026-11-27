# Project 05 — “Mira and Mango: Up and Down!” — Execution log

Project number **5** · database id **16** · `http://localhost:5175/#/project/16/export`
Executed autonomously under the user's Project 05 authorization (26–27 Nov 2026, local time).
User changes during the run (both applied):
1. **All characters newly created from the latest My World description.**
2. **Use the user's own song** `Downloads\Slow and Fast.mp3` (made with Suno) and sync everything to it.

## Final asset count (limits: characters 2–3, landscapes 1–2, sceneries 1–2, props 1–2)
| Type | Asset | New / reused | Card → My World item |
|---|---|---|---|
| Character | Mira (girl, two-legged) | NEW — Meshy image-to-3D + biped rig + Walking/Running clips | 50 → 79 |
| Character | Mango (puppy, four-legged) | NEW — Meshy image-to-3D + quadruped rig + Walking/Running clips | 51 → 80 |
| Scenery | Sunny Backyard Garden | NEW — Meshy image-to-3D | 52 → 81 |
| Scenery | Sunny Meadow 3 | REUSED from My World | 53 |
| Prop | Big Red Kite | REUSED from My World | 54 |
| Prop | Pink Balloon Bunch | REUSED from My World | 55 |
| Landscape | Garden landscape (morning) · Meadow landscape (day → sunset via shot lighting) | Stage 2 landscape design (Claude) | 52, 53 |
**Totals: 2 characters · 2 sceneries · 2 props · 2 landscapes — all within limits. 3 new assets, 3 reused.**
All 3 new models, both rigs and all 4 movement clips are downloaded locally (`storage/media/cards/50|51|52/`) and saved to My World as approved versions.

## Stage 1 · Lyrics — DONE
- Concept: **opposites** (slow/fast, up/down, high/low, yes/no, hello/goodbye) — every pair maps to a movement the rigs can perform.
- v1 (id 25): written by the Lyrics assistant (Claude, reference “My World”), 36 lines with an action cue per line.
- **v2 (id 26, approved, current): matches the user's Suno song exactly** — 12 sections / 48 sung lines (Verse 2 and its chorus are sung twice, and the chorus three times at the end). Cues carried over from v1.

## Stage 2 · Characters, scenery, props, landscape — DONE
- Cards created by hand to keep counts exact; reuse confirmed for the meadow, kite and balloons (no generation).
- Claude drafted every Meshy prompt (reference “My World”); Meshy previews reviewed before paying for 3D:
  - round 1: Mira in a leaf dress, Mango without collar, garden full of creatures → prompts revised by Claude;
  - round 2: Mira/Mango good; garden still had creatures → **studio bug found and fixed** (see Errors 3);
  - round 3: clean garden.
- Generated from the approved previews: Mira (biped rig, 1.1 m), Mango (quadruped rig), garden.
- Mira's model contained a small stray background creature (a separate mesh island of 1,508 triangles) → removed from the model, rig and both clips with the new `tools/remove-islands.mjs` (originals backed up in `docs/project-05/backup-mira/`).
- Claude look check: all three “partly match” (correct species/identity; details differ: striped shirt + bare feet, Mango's ear colours/no collar, garden has no shrubs/birdhouse). Kept (regenerating costs ~35 credits each with no guarantee); card descriptions updated to what was actually built.
- Landscape designed by Claude: storybook sky, few clouds, rolling hills; garden = morning/low hills; meadow = lush flowers, day (sunset from verse 4 via shot lighting).

## Stage 3 · Music & timing — DONE (user's song)
- First, a locally synthesised song was produced (`music/make-song.mjs`: instrumental + TTS vocals pitched to a melody). **Superseded** when the user supplied the final song; kept in `docs/project-05/music/` for reference.
- **Final audio: `Slow and Fast.mp3`** (Suno, 3:32.36, −15.7 LUFS), copied to `docs/project-05/music/slow-and-fast-suno.mp3`, uploaded (asset 154), approved and set as master.
- **Lyric timing measured from the real vocals**: faster-whisper (small.en, CPU, in an isolated venv) transcribed the song with word timestamps (`music/words.json`); `music/align.mjs` aligned them to the 48 known lines (Needleman–Wunsch) → **48/48 lines matched, none interpolated** (`music/timing-suno.json`). First line 0:12.14, last line ends 3:05.99; instrumental outro to 3:32.36. Timing approved.
- Mira set as the singer of all 48 lines (mouths), Mango reacts.

## Stage 4 · Rigging, animation, assembly — DONE
- Rigging: Meshy auto-rigs — Mira biped (with Walking/Running), Mango quadruped (with Walking/Running). The studio's MoveMaker builds the timed body actions on these skeletons (wave, clap, cheer, jump, hop, dance, bow, look-up/point, stretch, spin, nod, shake; tail wag, head tilt, ear twitch, paw raise, play bow, sniff, excited hops) plus automatic idle breathing, blinking and singing mouths.
- Direction: `docs/project-05/animation-direction-suno.md`, generated from the measured timing (two lyric lines per shot ≈ 5 s).
- Claude (reference “My World”) planned **24 shots** with independent, staggered action timelines for Mira and Mango, look/turn-to interactions, a repeated chorus camera pattern, different angles for the repeated verse, morning → day → sunset lighting, dissolves into choruses and an iris at the change of place.
- Added **5 instrumental shots** (dance in the sunset 2:05.6, walk through the meadow 2:34.0, playtime 2:41.0, goodbye wave 3:06.2, final view under the end card 3:19.0) → **29 shots** covering 0:00–3:32.4.
- Shot Doctor + visual review of every shot (GPU-rendered stills); fixes applied: characters facing away (riders/looks), framing of Mango's close-ups, the kite as a follow target, garden scale 0.75 (fence no longer taller than Mira), crowded/cropped outro framing.
- Remaining Shot Doctor notes (accepted): long shots that hold the title card (0:00–0:17) and the outro, and a few “cut at the edge” tips in wide moving shots.

## Rendering
- Software rendering in headless Chrome ran at ~1 frame/s → switched to the laptop's Intel Iris Xe GPU (ANGLE D3D11): ~126 frames/s raw, ~31 frames/s through the full export path (render + JPEG + upload).
- Export: Stage 5 → 1080p, 30 fps, from the same engine as the preview, encoded by FFmpeg with the master audio. (Result and verification: see the end of this log.)

## Meshy calls and credits (Project 05)
| Item | Requests | Credits |
|---|---:|---:|
| Preview images (7: 3 + 3 + 1) | 7 | 21 |
| 3D models from previews (3) | 3 | 90 |
| Rigging + walk/run clips (2) | 2 | 10 |
| Status polling | 90 | 0 |
| Balance checks | 2 | 0 |
| **Total** | **104** | **121** |
Balance 2,664 → **2,543** credits. No duplicate generations; no repeated downloads.
Claude API calls (not metered by the studio — tokens not logged): ≈ 16 (lyrics 1, prompt drafts 6, look checks 3, landscape design 1, shot plans 3 incl. one that hit the output limit, error-free otherwise).
Other costs: none (Suno song supplied by the user; local TTS/FFmpeg/faster-whisper are free).

## Errors encountered and resolved
1. Song generator wrote into a stray `Production%20Studio` folder (URL-encoded path) → moved, folder removed, script fixed.
2. Garden card auto-matched a different “Sunny Meadow” by name → switched to a new design.
3. **Studio bug:** Meshy scenery prompts got the character-oriented World Style summary and were cut mid-sentence (dropping “No animals, creatures…”) → `server/src/studio.js` `meshyPrompt` fixed (character words filtered for scenery/props; prompt fitted by whole sentences keeping “No/Never/Only …”).
4. Mira's mesh had a stray background object → removed with `tools/remove-islands.mjs`.
5. **Studio bug:** the 36-shot Claude plan exceeded the 16k output limit → `providers.js` now streams Claude calls (`messages.stream().finalMessage()`, max_tokens 64,000) and reports a cut-off answer clearly.
6. **Studio bug:** close-ups of small/four-legged characters put the camera inside the head → framing for quadrupeds and a minimum frame size added (`SceneEngine.js`); Shot Doctor no longer flags intentional cropping in single-subject shots.
7. **Studio gap:** manually added cards had no “used in lines” list (decides who sings) → `PUT /api/cards/:id` accepts `usages`.
8. Title/end cards covered the characters → moved to the upper third.
9. Export in headless Chrome was too slow in software mode → GPU (D3D11) rendering; one export was stopped by the test script itself and re-run.

## Outstanding limitations
- **4K was not produced**: the Stage 5 exporter offers 720p/1080p only (the server supports 4K, the UI does not), and 4K frames on this integrated GPU would need ~10 GB of temporary JPEGs. Preview delivered at **1080p30**.
- No facial expressions on cue (only blinks + singing mouths), no hand contact (Mira cannot hold the kite string or balloon ribbons), no part animation of props.
- The Meshy models follow the World Style but miss some described details (see Stage 2).
- Depth of field, reflections and atmospheric particles are not implemented in the engine.
- Claude token usage is not recorded by the studio, so Claude costs can only be estimated.

## Final preview — VERIFIED (27 Nov 2026)
- File: `storage/media/exports/episode-16/2026-11-27T04-17-03-1080p/mira-and-mango-up-and-down-1080p.mp4` (93.1 MB) + `captions.srt` (48 cues, measured times).
- H.264 1920×1080, 30 fps, 212.37 s (3:32.4) · AAC audio 212.36 s.
- Audio = the user's Suno song: waveform correlation 1.000 at 0.0 ms offset, loudness −15.7 LUFS (identical).
- Lyric sync checked on frames at the middle of lines 1, 13, 25, 33, 42 and 48: the on-screen karaoke line matches the line sung at that moment in every case.
- Plays from start to end with the actual 3D characters, both sceneries with their landscapes, both props, title card (intro), end card (outro), transitions.
- Asset limits respected: 2 characters, 2 sceneries, 2 props, 2 landscapes.
- Project status set to **Awaiting User Review** (project notes). Not approved, not published. Project left open at Preview & Export.

---

# Round 2 — user feedback (26 Nov 2026)

Feedback: the mouth sits near Mira's stomach; Mango's tail is disliked; no props or sceneries from earlier projects; the landscape should feel real (flowing river, colourful houses, moving trees); waving and face movement look copy-pasted.

## What changed
| Feedback | Fix |
|---|---|
| Mouth on the stomach | **Studio bug** in `client/src/engine/FaceRig.js`: the face finder paired the wrong texture blobs as eyes and accepted a "mouth" far below the head. The search now requires the two eyes to be the same size, limits the mouth to a zone between the eyes and the chin, and gives up (no overlay) rather than drawing a mouth away from the head. Verified on frames: the mouth sits on Mira's face. |
| Mango's tail | New Mango model (Meshy, image-to-3D + four-legged rig with walking/running clips), saved to My World as a new version of item 80. |
| Reused scenery/props | Removed cards 53 (Sunny Meadow 3), 54 (Big Red Kite) and 55 (Pink Balloon Bunch) from the project. New, more colourful assets: **Rainbow Flower Meadow** (card 56), **Rainbow Diamond Kite** (57), **Rainbow Balloon Bunch** (58), all approved and saved to My World. 23 shots switched to the new assets; meadow scale tuned to 0.75. |
| Landscape should feel real | New landscape features in `client/src/engine/Landscape.js`, available everywhere (World Style, Stage 2 Landscape, Stage 4 Look, per shot, and in Claude's prompts): **river** (none / behind / winding; flowing water texture, sandy banks), **houses** (colourful cottages with glowing windows at night), **wind** (calm / breezy / windy; trees, flowers and grass sway), **birds** (circling, flapping). Project 05: houses "some", wind breezy, birds few; Garden: houses some; Meadow: winding river, a few houses beyond it, lush flowers. |
| Waving copy-paste | Every performance now varies: energy (size of the move, ±14 %), tempo (±7 %) and number of waves (2–4), seeded per character and shot (`SceneEngine.js` + `MoveMaker.js`). |

## Meshy credits (round 2)
4 previews (~12) + 4 generations (~120) + Mango four-legged rig (~5) ≈ **137 credits**. No new subscriptions or paid resources.

## Checks
- New models: no stray mesh pieces (balloons have 2 pieces by design: balloons and ribbon bow).
- Shot Doctor after the changes: reframed shots 13, 19, 24, 28 (wider views showing the river and houses; group framing).
- Motion check: between two frames 1 s apart, the water area changes about twice as much as the trees area, so the water flows.

## Round 2 preview — VERIFIED (27 Nov 2026)
- File: `storage/media/exports/episode-16/2026-11-27T05-13-54-1080p/mira-and-mango-up-and-down-1080p.mp4` (98.8 MB), rendered in 399 s.
- H.264 1920×1080, 30 fps, 212.37 s · AAC 212.36 s · loudness −15.7 LUFS, identical to the Suno song.
- Frames checked from the MP4 at 0:10, 0:30, 1:26, 2:30 and 3:25: new meadow, kite and balloons; cottages around both places; the flowing river in the meadow wide shots; the mouth on Mira's face; captions and the end card in place.
- Known small issue: in some close-ups the singing mouth shows a small dark mark at its right corner.
- Status stays **Awaiting User Review**. Not approved, not published. The first preview (04-17-03) is kept for comparison.

---

# Round 3 — user feedback (27 Nov 2026)

Feedback: lips, head, clapping, jumping and standing don't move like real; the title and end text should not be in a box; the lyric says balloons float but nothing floats; the river is cut and starts from nowhere; flawless movement and lip-sync expected.

| Feedback | Cause | Fix |
|---|---|---|
| Lip-sync not real | The mouth was a dark oval that only opened and closed with loudness, smaller than the painted smile, so it read as a hole in a fixed grin. | `FaceRig.js`: real lip-sync. Each lyric line is split into sung syllables; each gets a mouth shape (ah, eh, ee, oh, oo, lips closed for m/b/p, teeth on lip for f/v, pursed for w), timed to the loudness peaks of the vocals and smoothed. The mouth is drawn each frame with lips, upper teeth and tongue, and **replaces** the painted smile while singing (a skin patch hides the painted one). |
| Head and body movement robotic | Every keyframe eased to a full stop (`smoothstep` per segment), so moves went stop-start; between moves only the idle clip played. | `MoveMaker.js`: moves flow through their keyframes on a smooth spline (Catmull-Rom). `SceneEngine.js`: a new life layer on every rigged character: breathing, looking around, and while singing, head bobs on loud syllables, nods with the phrase, a different head tilt per line and a small body sway. Mango's head looks around and his ears flick. The layer steps back while a big move plays. |
| Title/end text in a box | — | `captions.js`: no box. Big bubbly letters in rainbow colours with a white outline, a dark edge and a shine; letters pop in one by one, float in a gentle wave, hop away at the end, with sparkles around. |
| Balloons don't float | **Bug**: the `rise` motion means "come up into place from below", so the balloons started underground and stopped at ground level. | New `float` motion (floats up and away, with sway and bobbing), added to the engine, the Stage 4 controls, the server and Claude's instructions. Shots 6 and 10 now lift the balloons off exactly when "Up float balloons" is sung; shot 6 widened to show it. Other balloon shots stay tethered. |
| River cut | The river ran under the hill rings, so it appeared to start from the middle of a hillside. | `Landscape.js`: the hills open a valley for the river, so it flows all the way to the horizon; no trees in the valley. |

Backup of all shots before this round: `docs/project-05/backup-scene-before-round3.json`.
Meshy credits this round: 0.

## Round 3 preview — VERIFIED (27 Nov 2026)
- File: `storage/media/exports/episode-16/2026-11-27T14-49-38-1080p/mira-and-mango-up-and-down-1080p.mp4` (103.7 MB).
- H.264 1920×1080, 30 fps, 212.37 s · AAC 212.36 s · −15.7 LUFS (identical to the Suno song).
- Frames checked from the MP4: boxless rainbow title (0:02.5), singing mouth in close-up (0:28), balloons lifting off on "Up float balloons" (0:44.5), river through the valley to the horizon (1:26, 2:37.5), boxless end text (3:27).
- Status stays **Awaiting User Review**. Not approved, not published.

---

# Round 4 — user feedback (27 Nov 2026)

Feedback: mouth looks messed up; ankles, legs and hands don't bend; sometimes walking on the spot; characters not landing on the floor properly; balloons hide under the floor; the dog's head looks like it rotates 360°. Asked for a deep review before rendering.

| Problem | Root cause (found by measuring, not guessing) | Fix |
|---|---|---|
| Dog head spins | **Bug:** the animation mixer only rewrites a bone when its animated value changes. The "look at Mira" head turn (and the new life layer) added a rotation on top every frame; while a move with no head track played (tail wag), nothing reset the head, so the turn piled up (measured: +51° per frame at the same moment). | Every extra head/neck/shoulder turn is now recorded and undone before the next frame (`_poseBody`), so the same moment always gives the same pose (verified: 53°, 53°, 53° on repeated renders). |
| Life layer invisible | **Bug:** it turned the bones of the hidden analysis copy of the skeleton (`rig.map`), not the character on screen. | Uses the character's own bones. |
| Mouth messy | The drawn mouth was a flat sticker floating in front of a curved face; teeth showed as a single tooth; shapes jumped. | The mouth is now **painted into Mira's skin texture** every frame, triangle by triangle (612 face triangles mapped to the texture, which Meshy cuts into many pieces), so it bends with the face and is lit like the cheeks. Calmer shapes, ~0.1 s smoothing, a proper band of upper teeth, wider opening while singing. |
| Walking on the spot | Paths used an ease-out curve (fast start, slow stop) while the walk cycle stepped at a constant rate. | Speed-up / steady / slow-down profile shared by the position and the walk cycle: the cycle advances with the distance covered. |
| Not landing on the floor | Poses and the walk clip don't know where the floor is. | Ground contact: the lower foot is kept on the floor (sinking always corrected, small floats pulled down, real jumps left alone). |
| Stiff ankles and hands | Feet were always kept flat; hands never moved. | In the air the toes point down; crouching puts weight on the balls of the feet; wrists follow the forearms. (Mira's rig has **no finger bones**, so fingers cannot bend.) |
| Balloons under the floor | **Bug:** the float motion's rocking was written in degrees but the engine uses radians: the bunch rocked ~100° and swung into the ground. Also they stood on the grass behind flowers. | Rocking in radians (a few degrees); balloons hover 0.5 m above the grass in every shot with a gentle bob, and float away on "Up float balloons". |

Shots backup before round 3: `docs/project-05/backup-scene-before-round3.json`. Meshy credits this round: 0.

## Round 5 — "the mouth looks strange while talking" (27 Nov 2026)
Looked at full 1080p frames instead of small crops. Causes and fixes:
- The singing mouth was about twice as wide as Mira's painted smile, with pointed corners and a thick red outline, so it grew suddenly into a "grin". → Redesigned: about the painted smile's width, a nearly flat top, a deep round bottom (a "D"), no hard outline, dark inside, pink tongue, soft band of upper teeth.
- Red "horns" stayed visible while singing. A green test patch showed that the painted smile is **carved into the model** (a groove) and reaches further out and higher than the cover. → Triangles of the groove walls are now repainted too (they face up/down, not forward); triangles seen edge-on get a flat colour instead of being skipped; the cover was enlarged (still below the nose); the singing mouth starts just below the groove.
- Speed: painting took ~150 ms a frame. → The face triangles are grouped into 18 small patches, the unchanging skin cover is drawn once, and the patch canvases stay in CPU memory (`willReadFrequently`), so uploading is a straight copy. Singing frames: ~25–33 ms (quiet ~13 ms).
- To free memory for rendering, background apps were closed at the user's request: Edge (background startup boost), WhatsApp, Copilot, Lenovo Vantage helper. VS Code left open.

## Round 5 preview — VERIFIED (27 Nov 2026)
- File: `storage/media/exports/episode-16/2026-11-27T16-18-00-1080p/mira-and-mango-up-and-down-1080p.mp4` (108.1 MB, over GitHub's 100 MB limit: not pushed).
- H.264 1920×1080, 30 fps, 212.37 s · AAC 212.36 s · −15.7 LUFS (identical to the song).
- Checked from the MP4: boxless title and end text; singing mouth (round, tongue, painted smile hidden) at 0:27.6–0:28.2; balloons hovering; Mango's head normal during the tail wag (1:03.8); river and cottages in the meadow.
- The stuck export (job 74's predecessor, job 73) was cleared by restarting the server, which marks unfinished jobs as interrupted.
- Status: Awaiting User Review. Not approved, not published.
