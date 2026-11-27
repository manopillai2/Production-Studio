# Rhymes Studio — Learnings

What we learned building the studio and producing Project 05 ("Mira and Mango: Up and Down!", episode 16) end to end.
Written for the next project and for anyone (person or AI) working on this code. Each entry says **what happened**, **why**, and **what to do now**.

Contents
1. Making a good nursery-rhyme video (creative lessons)
2. World Style, references and Claude
3. Characters and Meshy 3D models
4. Faces: eyes and singing mouths
5. Body animation and gestures
6. Landscape, scenery and the "alive" world
7. Camera, framing and Shot Doctor
8. Music, lyrics and timing
9. Export and verification
10. Engineering lessons (bugs, tooling, Windows quirks)
11. Costs and limits
12. Checklist for the next project
13. Round 3: making movement and singing feel real
14. Known limitations and ideas for later

---

## 1. Making a good nursery-rhyme video (creative lessons)

- **"Scenery" vs "landscape".** *Scenery* is the stage the characters stand on: a Stage 2 location card and its 3D model. *Landscape* is everything around it out to the horizon: sky, clouds, hills, trees, river, houses and birds. A small scenery model with no landscape looks like a green disc floating in blue. Always design both.
- **The world must feel alive.** The first review said it plainly: the world felt static. Viewers notice:
  - **moving water**, such as a river that flows;
  - **things moving in the wind**, such as trees, flowers and grass;
  - **life in the background**, such as birds;
  - **colour around the play area**, such as colourful houses and flowers.

  These are now landscape options (section 6). Turn them on by default for outdoor songs.
- **Colour.** Rhymes channels use saturated pastels with bright accents: rainbow props, pastel walls with bright red, blue and purple roofs, and pink or orange skies at sunset. If an asset looks dull next to the characters, regenerate it more colourful rather than trying to fix it with lighting.
- **Never reuse a previous project's props or sceneries unless the user asks.** The user wants each video to look new. Characters can be reused when the user says so (Mira and Mango were). Check Stage 2 for cards matched from My World by name: a "Sunny Meadow" card silently reused an old model.
- **Repetition reads as "copy-paste".** If the same gesture, framing or close-up repeats in every chorus, viewers notice. Vary the following:
  - the shot size (wide → full → medium → close-up);
  - the camera move;
  - who is featured;
  - the gesture's energy and the number of waves (the engine now varies these automatically; see section 5).
- **Actions must be big enough to see.** A wave in an extreme-wide shot is invisible, and the user reported that "waving is not working". The wave was working, but the character was tiny. Put gesture lines in **full or medium shots**.
- **Title card and end card belong in the upper third**, so they never cover the characters.
- **Shot length.** A still camera longer than about 8 seconds feels slow. Add a slow push-in (dolly-in) or a pan; Shot Doctor flags these.

## 2. World Style, references and Claude

- **World Style is compulsory input to every Claude call**: direction, characters, props, sceneries and landscapes. `worldFor(reference)` in `server/src/index.js` builds it.
- **The reference chooser** asks on every Claude call what to use:
  - *My World*: the description only;
  - *My World + characters*: also sends existing character images;
  - *Something new*: the description pasted in the box.

  Use "Something new" when the user wants a fresh look for one item.
- **Inspiration screenshots** (World Style → Inspiration) are reference only, about 80% of the ideas. The prompt tells Claude never to copy them.
- **Claude output size.** A 36-shot animation plan was longer than a 16k output limit and got cut off. Fix: `claudeJSON` now **streams** (`client.beta.messages.stream(...).finalMessage()`) with `max_tokens: 64000` and throws a clear error when `stop_reason === 'max_tokens'`. Always stream long calls.
- **Model and fallbacks.** The default is `claude-opus-5-5` (overridable with `CLAUDE_MODEL`), with server-side fallbacks and `effort: 'medium'`.
- **When you add an engine feature, add it to Claude's prompts too.** Claude can only choose options it knows about. New landscape keys (river, houses, wind, birds) had to be added to `designLandscape`, `worldLandscape` and the shot-director landscape list in `providers.js`.
- **Every look key lives in several places.** Keep them in sync when adding one:
  - `client/src/engine/Landscape.js`: `LOOK_DEFAULTS` and `LOOK_OPTIONS`;
  - `server/src/studio.js`: `LOOK_KEYS`;
  - `server/src/index.js`: `WORLD_LOOK`;
  - `StageAnimate.jsx`: Look panel and per-shot panel;
  - `LandscapeSection.jsx`: `FIELDS`;
  - `WorldStyle.jsx`: WorldLookPanel;
  - `providers.js`: prompts.

## 3. Characters and Meshy 3D models

- **Pipeline:**
  1. Claude drafts the prompt from World Style and the card.
  2. Meshy makes a **preview image** (about 3 credits). Look at it before paying for 3D.
  3. **Image-to-3D** (about 30 credits).
  4. **Rig** (about 5 credits), with walking and running clips. Choose biped or **quadruped** (dogs, cats) for the rig.
- **Prompt composition (`meshyPrompt`).** Two bugs taught us:
  - Scenery and prop prompts received the *character* part of World Style ("big eyes, fur, cheeks…"), and Meshy then added faces to flowers. Character words are now filtered out for non-characters.
  - Prompts were cut mid-sentence, and the cut removed "No animals, no creatures". The prompt is now fitted by whole sentences, and sentences starting with No, Never, Without or Only are always kept.
- **Stray islands.** Image-to-3D sometimes keeps a piece of the background, such as a floating slab behind Mira. Use `node tools/remove-islands.mjs in.glb out.glb 0.1`, which removes detached pieces smaller than 10% of the largest. It works on rigged GLBs. Check its output: balloons legitimately have 2 pieces (the balloons and the bow).
- **Details the user dislikes, such as Mango's long tail, need a regeneration, not a fix.** Put the wanted detail in the description ("a short fluffy pom-pom tail") and make a new version. Saving to My World then creates a new version of the same item, so other projects keep the old one.
- **Look check** (Stage 3 → Look check) asks Claude whether the model matches the card. Run it before approving, because name and model mismatches happen (project 15 had a "bear" that is a bunny). Fixing such a mismatch is the user's decision.
- **Approval rules.** An approved card can't be deleted; un-approve first. Removing reused cards: un-approve, delete, then point every shot's `setting.card_id` / `actors[].card_id` at the new card (`docs/project-05/round2-approve.mjs`).
- **Scale.** A new scenery model may be a different size from the one it replaces. Tune `setting.scale` per shot (the Rainbow Flower Meadow needed 0.75).

## 4. Faces: eyes and singing mouths

`client/src/engine/FaceRig.js` finds the face on the character's texture and draws blinking eyelids and a singing mouth attached to the head bone.

- **The bug: the mouth was drawn on Mira's stomach.** Two causes:
  1. Two unequal texture blobs, such as a button and an eye, were accepted as an "eye pair".
  2. The mouth search had no lower limit, so it found a dark spot on the overalls.

  Fixes:
  - Eyes must be about the same size (`min/max size ≥ 0.4`), 0.15–0.75 head-lengths apart and level.
  - The mouth must be in a **zone between the eyes and the chin** (`chin = max(eyeY − 0.9·sep, headY − 0.55·L)`), close to the face centre line.
  - A **sanity check** returns `null` (no overlay) when the result is more than 1.1 head-lengths from the head or below it. **No mouth is better than a mouth in the wrong place.**
- **Disproved hypothesis.** We first thought the head was turned in the rest pose. Measuring the yaw from the `headfront` bone gave 0. Measure before fixing. Yaw handling stays in for models that do turn.
- **How to verify.** Render close-ups and medium shots with `tools/testing/shots.mjs` and look at them. The debug info in the browser console reports the eye and mouth positions and `found: "texture"`.
- **Still open.** In some close-ups the mouth overlay shows a small dark mark at its right corner.

## 5. Body animation and gestures

- **Engine.** `MoveMaker.js` makes procedural moves (wave, clap, jump, nod, bow, spin…). `SceneEngine._body` mixes them per character with the rig's walk and run clips.
- **"Waving doesn't work / copy-paste".** We measured that the wave did work (the right hand rose above the head). The perception came from three things:
  1. tiny characters in wide shots;
  2. **identical performances** every time;
  3. the misplaced mouth.
- **Fix: per-performance variation**, seeded per character and shot so the preview and the export are identical:
  - `energy` 0.86–1.14 scales the rotations and offsets of the move;
  - tempo ±7%;
  - waves 2–4 times.

  It is implemented in `SceneEngine.js` (`params.energy`, `params.waves`, `params.seconds`) and `MoveMaker.js` (energy applied after `sampleKeys`).
- **Rule.** Anything random must come from a **deterministic seed**, never `Math.random()`, or the MP4 export will differ from the preview.

## 6. Landscape, scenery and the "alive" world

`client/src/engine/Landscape.js` builds it, layered **World Style → project → place → shot**. Options:

| Key | Values | What it does |
|---|---|---|
| sky | auto, clear, soft, storybook | sky colours |
| clouds | none, few, some, many | drifting clouds |
| hills | none, low, rolling, tall | three hazy hill rings |
| trees | none, few, some, many | trees on the hills, **swaying** |
| dressing | none, light, lush | flowers, bushes and tufts near the set, **swaying** |
| river | none, behind, winding | river behind the play area, **flowing water**, sandy banks |
| houses | none, few, some, many | colourful cottages, windows glow at night |
| wind | calm, breezy, windy | how much plants sway |
| birds | none, few, some | birds circling and flapping (not at night) |

Implementation lessons:
- **Animate in `update(t)` only, as a pure function of t.** The engine calls `land.update(t)` every frame, so scrubbing, preview and export agree.
- **Flowing water.** A tileable canvas texture (turquoise bands, ripple lines, sparkles) is scrolled by `texture.offset.x = −t·0.09`. Its cost is close to zero.
- **Sway.** Rewrite the instance matrices of the InstancedMesh each frame with a small rotation from the base. Each instance has its own phase so neighbours aren't in step, and a slow "gust" factor varies the amplitude.
- **New features use their own random sequence** (`r2`), so adding a river or houses doesn't move every existing tree and flower.
- **Keep-clear zones.** Dressing, trees and houses must avoid:
  - where characters stand or travel (`keepClear`);
  - the river;
  - the camera side of the set.
- **Houses go in the back half of the circle**, beyond the river, facing the action, so they appear behind the characters.
- **Show new elements on purpose.** A river behind the set is invisible from a low medium shot. Use one or two **extreme-wide or high establishing shots** per place (shots 13 and 24 in Project 05).
- **Verifying motion.** Difference two frames one second apart (`ffmpeg blend=difference` + `signalstats`) and compare regions. The water area changed about twice as much as the trees area. Stills alone can't prove that something moves.

## 7. Camera, framing and Shot Doctor

- **Shot sizes**: extreme-wide, wide, full, medium, close-up. `frameFor` computes the camera from the subject's bounding box.
- **Quadrupeds** are long and low. Medium and close-up shots must frame the body differently (`F.quad`) and use a minimum frame size, or the camera ends up inside the dog's head.
- **Shot Doctor** (`SceneEngine.analyse()`) flags:
  - out-of-frame or cut-off actors;
  - long still shots;
  - the same framing twice in a row.

  Lessons:
  - **Know the main subject**: the camera target, else the first character, else the first traveller, else the first actor. Don't flag intentional crops of other actors in single-subject or close-up shots.
  - An automatic fix must **never move the main subject**. One fix put a bear behind a rainbow; it was restored from a JSON backup.
  - Back up the shots (`GET /api/episodes/:id/scene` → JSON) before batch edits.
- **`face_travel: false`** keeps a rider or vehicle character facing the viewer while moving.

## 8. Music, lyrics and timing

- **Use the user's own song when given.** Project 05 used `Downloads/Slow and Fast.mp3` (Suno). The synthesized placeholder song (`make-song.mjs`) was dropped.
- **Lyric timing from a real recording:**
  1. faster-whisper `small.en` on the CPU with word timestamps, in an **isolated venv** (`docs/project-05/music/transcribe.py`).
  2. **Needleman–Wunsch alignment** of the recognised words to the known lyric lines (`align.mjs`). Whisper mishears words in sung audio, and alignment tolerates that: 48/48 lines were aligned.
  3. Instrumental gaps (intro and breaks) get their own shots (`add-instrumental-shots.mjs`).
- **Check the sync on frames**, not by trust: grab frames in the middle of several lines and compare the karaoke line with the line sung.

## 9. Export and verification

- The browser renders every frame with the same engine as the preview. The server encodes with FFmpeg (H.264 + AAC), so **preview = export**.
- **Headless rendering speed (on this laptop):**
  - software WebGL (swiftshader): about 1 frame/s, which is too slow;
  - **GPU flags** `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`: about 126 fps raw and about 31 fps through the full export path. A 3:32 1080p export takes about 6.5 minutes.
- **Keep the driving browser open until the export finishes.** Closing it aborts the job. Wait inside a page `eval` until the button stops saying "Exporting…".
- **Verification checklist** used for each preview:
  1. `ffprobe`: 1920×1080, 30 fps, video and audio durations equal (212.37 s).
  2. Audio identical to the source: waveform correlation 1.000 at 0 ms, or equal loudness (−15.7 LUFS both).
  3. Frames at about six times across the video: the right assets, captions in sync, title and end cards placed well.
  4. Only then set the status to **Awaiting User Review**. Never approve or publish without the user.
- **4K** isn't offered in the UI (the server supports it). On an integrated GPU it would also need about 10 GB of temporary JPEGs.

## 10. Engineering lessons (bugs, tooling, Windows quirks)

- **Mixed CRLF/LF files** (FaceRig.js, StageAnimate.jsx…) made exact-text patches fail. Normalise `\r\n` → `\n`, patch, then restore.
- **Bash heredocs and backticks mangle JS and Markdown.** Write scripts as files with an editor tool and run them with node.
- **URL-encoded paths.** `new URL(import.meta.url).pathname` produced a `Production%20Studio` folder. Use `fileURLToPath(import.meta.url)`.
- **Express route regex** `:id(\\d+)` lost its backslash when written through a shell. Check the route after writing it.
- **Non-ASCII through the shell** (an en dash) arrived as U+FFFD. Send text with node `fetch` instead of curl from bash.
- **A server restart is needed** after changing `server/src` (option whitelists such as `LOOK_KEYS`). Values sent before the restart were silently dropped, so re-apply them after restarting.
- **The test harness** is in `tools/testing/` (no dependencies; Chrome over CDP):
  - `flow.mjs <outDir> <route> <steps…>`: steps are `click:Text`, `wait:ms`, `built`, `eval:js`, `save:file|js`, `vshot:name`, `shot:name` and `scroll:Text`.
  - `shots.mjs <episodeId> <outDir> 0.5`: a screenshot in the middle of every shot. The env vars `ONLY=0,4,12`, `TIMES=84.5,85.5` and `GPU=1` narrow it down.
  - `pages.mjs <outDir> <routes…>`: full-page screenshots.
- Debug hooks: `window.__sceneEngine.renderAt(t)` and `window.__scenePlayer.seek(t)`.
- **A diagnostic script can break the thing it measures.** A check script killed the browser and aborted an export that was actually working.

## 11. Costs and limits

- **Meshy:**
  - round 1: Mira, Mango, garden, meadow, kite and balloons previews, generations and rigs;
  - round 2: about 137 credits (4 previews ≈ 12, 4 generations ≈ 120, Mango quadruped rig ≈ 5).

  Preview first, and generate 3D only for approved previews.
- **Claude:** the studio doesn't record token usage yet, so costs can only be estimated.
- **Project 05 limits respected:** 2 characters, 2 sceneries, 2 props, 2 landscapes, 3:32 duration. No new subscriptions or paid computing were used.

## 12. Checklist for the next project

1. **World Style**: is the description current? Add inspiration screenshots if wanted.
2. **Stage 1–2**: approve the lyrics. Check that no scenery or prop card was auto-matched from an old project unless that's wanted.
3. **Stage 2 Landscape**: use Claude or set it by hand. Outdoor songs get wind breezy, birds few, houses and flowers, and a river where the story allows.
4. **Stage 3**:
   - preview images before 3D;
   - `remove-islands` when needed;
   - look check;
   - quadruped rig for animals.
5. **Music**: use the user's song when given; align the lyrics with whisper + alignment; add instrumental shots.
6. **Stage 4**:
   - Generate Preview and work through Shot Doctor;
   - one establishing shot per place;
   - gestures in full or medium shots;
   - vary the chorus shots.
7. **Look at frames**: faces (mouth on the face), the river and houses visible, captions in sync.
8. **Export 1080p** with GPU and run the checks in section 9.
9. **Log everything** in `docs/project-XX/EXECUTION-LOG.md`, then set the status to Awaiting User Review.

## 13. Round 3 lessons: making movement and singing feel real

- **Lip-sync = shapes, not just opening.** A mouth that only opens with loudness looks like a puppet. Real lip-sync needs:
  - **visemes**: ah, eh, ee, oh, oo, lips closed for m/b/p, teeth on the lip for f/v, pursed lips for w;
  - **syllable timing**: syllables from the lyric text, snapped to the loudness peaks of the vocals;
  - **smoothing**: the lips move slightly before the sound.

  See `syllables()`, `syllablePlan()` and `mouthShape()` in `FaceRig.js`.
- **The drawn mouth must replace the painted one.** A drawn mouth smaller than the painted smile reads as a hole in a fixed grin. While singing, cover the painted mouth with a soft skin-coloured patch and draw the full-size mouth (lips, teeth, tongue). The face finder anchors on the **bottom** of the painted mouth; the smile line sits about 0.3 mouth-widths above it.
- **Don't stop at every keyframe.** Easing each segment (smoothstep) makes the speed zero at every key, so moves look robotic. Interpolate through the keys with a spline (Catmull-Rom, tangents scaled to 0.85 to avoid overshoot) and keep zero speed only at the first and last key, where the move blends with the idle.
- **Characters need a life layer on top of every clip.** It covers breathing, looking around, and, while singing, head bobs on loud syllables, a head tilt per line and a small body sway. Apply it after the mixer as a rotation in the character's frame, compute everything from song time (deterministic), and scale it down while a big move plays.
- **Check that the motion type means what the lyric says.** `rise` = comes up into place from below (a sun). `float` = floats up and away (balloons). Claude's prompt now spells out the difference. Time the lift-off to the lyric line (delay = line start − shot start).
- **Landscape pieces must not intersect.** The river ran under the hill rings and seemed to start in the middle of a hill. When one feature crosses another, carve space for it: the hills now open a valley along the river.
- **Titles look better as styled letters than as a box**: rainbow letter fills, a white outline and a dark edge, a staggered pop-in and a gentle wave.
- **Verify motion with frame sequences** (e.g. 6 frames 0.15 s apart, cropped on the mouth), not single stills. Several crops were needed before the mouth was framed correctly.

### Round 4 lessons (deep review)

- **The three.js mixer skips bones whose animated value didn't change.** Anything you add on top of an animation (a look-at turn, breathing, head bobs) must be recorded and undone before the next `mixer.update`. Otherwise it piles up every frame whenever the clip holds still or the bone has no active track, and you get Mango's head spinning round. Test it: render the same moment 3 times; the pose must be identical.
- **`rig.map` bones belong to the analysis copy of the skeleton.** Pose the character's own bones (look them up by name in `body.obj`).
- **Units.** `motionAt` rotations are radians. A "6" meant as degrees rocked the balloons 340°.
- **Walk cycle and position must share one speed curve.** An eased path with a constant-speed walk clip gives sliding at the start and walking on the spot at the end.
- **Paint mouths into the texture, not on a floating plane.** Overlays on curved, textured faces float, cut through and light differently. Map each face triangle (3D position → mouth-plane coordinates; UV → texture pixels) and draw the mouth canvas into a copy of that texture region, then upload only that region with `renderer.copyTextureToTexture`. Meshy UVs are cut into many small pieces, so a regular grid can't be used: work per triangle.
- **Measure before fixing.** Each "it looks wrong" in this round had a different measurable cause, found by printing bone angles in the running app and rendering the same time twice.
- **Rig limits to tell the user about:** Meshy biped rigs have no finger bones (hands can't curl); quadruped rigs have a jaw bone (usable for barking later).

### Round 5 lessons (the singing mouth)

- **Judge faces at full resolution.** 1080p crops showed problems that 780-px thumbnails hid: a mouth twice the width of the painted smile, pointed corners and a thick outline.
- **Match the character's own design.** The singing mouth should be about the painted smile's width: a cute "D" shape (nearly flat top, round bottom), dark inside, pink tongue, a soft band of upper teeth and no hard outline. A sudden bigger mouth reads as a strange grin.
- **Use a colour test patch to find what's what.** Painting the cover bright green, then painting every mouth triangle green, proved the remaining red "horns" were the painted smile reaching beyond the cover.
- **Meshy carves painted features into the mesh.** The smile is a groove. Its walls face up or down and are seen edge-on from the front, so:
  - include those triangles (don't filter by "facing the camera" only);
  - give triangles that project to slivers a flat colour instead of skipping them;
  - start the drawn mouth just below the groove.
- **Upload only small patches, from CPU canvases.** The face triangles are scattered over the texture. Group them into connected 32-px cells, so you upload 18 small patches instead of one 1900×1900 rectangle. Draw the never-changing skin cover once. Create the canvases with `getContext('2d', { willReadFrequently: true })` so `copyTextureToTexture` doesn't stall reading a GPU canvas. The result: ~150 ms → ~25–33 ms per singing frame.
- **Profile before optimising.** Timing each step showed drawing took 2.4 ms and uploading took 87 ms.
- **Memory on an 8 GB laptop.** Background apps (Edge startup boost, WhatsApp, Copilot) and Claude Code's low-memory reaper can stop long exports. Close them before exporting. An export stopped half-way leaves its job "running", which blocks the next export.

### Project 06 lessons (playground, rich landscapes, cinematic direction)

- **Moving equipment must be built in the engine.** Meshy makes one solid piece, so a Meshy seesaw would tip over base and all. Build seesaws, swings, slides and merry-go-rounds procedurally, with named seat points. Riders are placed on the seat every frame, and their hips are then moved exactly onto it (`_rideAt`, `_seatHips`). Turn ground contact off while riding.
- **Riding poses must match the equipment's rhythm.** The seesaw push happens at the bottom and the swing tuck going back. Use the equipment's period as the move's `seconds`. A ride covering the whole shot must start already seated (`hold` + `at: 0` means no fade-in), or a stand-to-sit blend shows at the cut.
- **Check each rig's bone chain.** Mango's rear leg is lower leg → hock → foot, with no upper leg, so add the hock to the bone map before posing him.
- **"Colourful and detailed" means arranged, not scattered.** Use flower beds in colour bands, bunting along poles, blossom trees in candy colours, patchwork hills, a rainbow, balloons and butterflies. They fill the frame with order and colour.
- **What the lyric names must be in the picture** (round 3 lesson), even when the props change. The lyric still sings of a red kite and pink balloons, so build them for this project (engine kite with a fluttering tail, pink balloon bunch) and time them to the line.
- **A cinematic grammar for rhymes:**
  - an establishing crane per place;
  - low hero angles on rides;
  - side angles for swings and slides (the motion is along the camera's view otherwise);
  - close-ups while singing;
  - orbits on the merry-go-round;
  - push-ins on long shots;
  - a sunset palette for the ending;
  - a subtle vignette.
- **Camera blockers.** Big set pieces (giant mushrooms, lollipop trees, equipment) can sit between the camera and the actors. Check every shot on a contact sheet, then fix it by moving equipment (keeping the same layout across a place's shots), scaling the setting up, or choosing another side angle.
- **Reverse angles need the actors turned too** (`rot`), or Shot Doctor reports backs to the camera.
- **Preview-image backgrounds become geometry.** The cart preview's cloud and leaves came out as flat pieces. `tools/remove-islands.mjs` with `BOXES=1` shows each piece's box: flat (thin z) pieces beside the object are background bits.
- **Scripted exports: watch the right job.** The browser export creates a job of type `render`, not `export`. Wait on that job id reaching `done`; never wait on button text (a stuck job disables the button, which looked like "finished").
- **Duplicating a project** (no app feature yet): copy the episode, the approved lyrics, the song file, the timing (remap `lyrics_id`/`audio_id`) and the character cards (their My World versions carry the rigs and clips). See `docs/project-06/duplicate.mjs`.

### Project 06 round 2 lessons (riding poses, more movement)

- **One sitting pose doesn't fit every ride.** Check where the legs go for each piece of equipment:
  - seesaw: astride (a leg each side of the plank);
  - merry-go-round: at the rim facing out, legs over the edge;
  - slide: legs straight along the chute;
  - swing: legs free.

  Verify with a camera placed right next to the rider's hips (a custom close-up in the running app), not just the shot camera.
- **Show how a child gets onto equipment:** a ladder climb before the slide (`ride.climb`). Make the shot long enough for climb + sit + slide, about 3.5 s.
- **"Only walking" means locomotion variety is missing.** Use run chases, skipping, climbing, kicking a ball, twirls, and for animals roll-overs, leaps and zoomies. A move played while the actor travels a path replaces the walk clip, so `skip` + `path` gives a skipping journey.
- **Circle runs:** pick the start angle so the run ends towards the camera. Keep the speed believable for the running animation: 0.5 lap in 2.5 s, not 0.85.
- **Camera inside the place, not outside its ring.** A wide camera standing outside a diorama's rim gets the edge pieces (lollipops, rocks) in the foreground. Use `size: full` with `distance` instead.

### Project 06 round 3 lessons (made for young viewers to follow; nothing goes through anything)
- **Design for following, not for filling.** Research on young children points one way: decorated rooms cut attention and learning (Fisher et al. 2014); one picture at a time beats two (Flack & Horst 2017); toddlers track about three objects (Feigenson); motion and brightness pull the eye (Huston & Wright). So:
  - one clear action per shot, the one being sung;
  - at most three things to follow: the two characters and the one object they use;
  - only the equipment in use is in the shot, centre stage;
  - no decoration that moves (bunting, butterflies, sky balloons, birds);
  - colour in big calm areas, not many small objects.
  Sources are in `docs/project-06/EXECUTION-LOG.md` (round 3).
- **The character must be the most salient thing on screen.** Background blur (depth of field), a rim light and a calmer, hazier background do this. Landscape `detail: focus` keeps the colour without the clutter.
- **Repeat the chorus action, vary the angle.** Use the same action for the same words every time: seesaw = up and down, swing = high and low, merry-go-round = spin around, then nod, shake and wave. Change the camera side, height and time of day.
- **Measure overlaps; don't eyeball them.** `tools/testing/clearance.mjs <episode> <outDir>` measures skin points against equipment, props, the other character, the scenery and the ground, for every shot. Run it before every export. `tools/testing/peek.mjs` renders any moment from any camera, for a close look at the contact.
- **Riders need a limb solver, and the equipment needs to fit the body.**
  - Poses can't know the equipment, so after posing, legs and arms are pushed out of it (swing out, knee up, bend).
  - Four-legged riders keep their pose and are lifted onto the seat.
  - Equipment proportions matter as much: a seat wider than a child's hips can't be straddled, so the seesaw seat is narrow and the dog's seat is wide. A tower must be taller and wider than the character and her hair.
  - A slide must end low, and the child must step off.
- **The same trap twice:** `rig.map` bones belong to a hidden analysis copy of the skeleton. Anything that moves a character's bones after posing must use `body.obj.getObjectByName(name)` (see `liveMap`).
- **The server and the built client don't hot-reload.** Port 5175 serves `client/dist`, so rebuild with `npx vite build`. Server changes, such as a new allowed look value, need a server restart. Until then, the old code silently drops the new value.

## 14. Known limitations and ideas for later

- Faces: no expressions on cue (blinks and singing mouths only). Lip-sync is spelling-based (no phoneme dictionary). Faint traces of the carved smile can show at the mouth corners. Four-legged characters (Mango) keep their painted mouth (his rig has a jaw bone that could be used).
- Hands: Meshy biped rigs have no finger bones.
- A stuck export job can only be cleared by restarting the server (no cancel button yet).
- No hand contact: Mira can't hold the kite string or balloon ribbons. Props have no part animation.
- Repeated chorus close-ups are still framed similarly. Shot Doctor could flag "same shot as the last chorus".
- Shot Doctor idea: "action too small to see" when a gesture plays while the character covers less than 25% of the frame height.
- No water reflections or particles (leaves, sparkles). (Depth of field was added in Project 06 round 3.)
- No "duplicate project" button yet (Project 06 used a script).
- 4K export is missing from the UI.
- Claude token usage isn't tracked.
