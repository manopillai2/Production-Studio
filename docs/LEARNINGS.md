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

- **Editing JS through scripts:** an apostrophe inside a single-quoted JS string ("ball's") breaks the file, and shell heredocs can turn `
` into real line breaks inside JS strings. After every scripted edit, run `node --check` or import the module (and build the client) before committing.

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
10. **Kids-first direction** (Project 06):
    - one action per shot, timed to the word;
    - at most three things to follow, and only the props the lyric needs;
    - the named object fully in frame;
    - gestures in medium or full shots;
    - characters face what they play with;
    - an arm's length apart;
    - landscape detail `focus`.

    These rules are also in the World Style and the Claude director prompt.
11. **Before export:**
    - `tools/testing/clearance.mjs` (nothing through anything);
    - a contact sheet (`shots.mjs`);
    - face close-ups AND medium shots (`peek.mjs` with `{face: 0}`);
    - blinks (`__forceBlink`).
12. **After export:** review the MP4 itself (frames from every shot at full size, singing and blink runs), the way the user does.
13. **Render** as a detached process (`Start-Process node export.mjs …`) with Edge, Teams and Phone Link closed.
14. **New characters:** separated fingers in the preview image (Meshy adds finger bones), a small painted closed mouth, and arms and legs clear of the body.
15. **Update LEARNINGS.md the moment** a cause is found or a fix is verified, and commit it with the code.

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
- **Long renders on this laptop (7.6 GB):** run `export.mjs` as its own Windows process (`Start-Process node …` with its output going to a log file) and watch progress from the server's frame folder. As a background task of Claude Code, it gets stopped when memory runs low. Close Edge, Teams and Phone Link first.
- **The server and the built client don't hot-reload.** Port 5175 serves `client/dist`, so rebuild with `npx vite build`. Server changes, such as a new allowed look value, need a server restart. Until then, the old code silently drops the new value.

- **Meshy rigging options (checked against the API docs, 27 Nov 2026).**
  - `include_fingers: true` adds finger bones to two-legged characters at no extra cost. The studio now asks for it for every NEW two-legged character, and retries without it when the hands can't take fingers (mitten hands). Existing characters are never re-rigged automatically.
  - Meshy has no face, eye or jaw bones and no blend shapes, so expressions must be painted by the studio (FaceRig).
  - Four-legged rigs can't have fingers.

### Singing mouth, round 6 (27 Nov 2026): a mouth layer instead of painting into the texture
- **Why the painted singing mouth looked bad:** it was painted into the skin texture triangle by triangle. Meshy cuts that texture into many small, scattered pieces around the mouth (about 600 triangles), so the edges came out ragged and torn, and the low texture resolution made them jagged. It also sat on the chin, below the carved smile groove, and looked nothing like her own smile.
- **The mouth layer (`FaceRig.mouthLayer`):**
  - a COPY of the character's own face triangles around the mouth;
  - the same material, uvs and bone weights (a SkinnedMesh bound to the same skeleton), so where nothing is drawn it is pixel-identical to the face, and it moves exactly with the skin;
  - a second set of uvs laid flat across the mouth carries a sharp canvas picture (cover + mouth), blended into the material's colour and glow in the shader.
- **What didn't work (and why):**
  - a DecalGeometry sticker on its own material: Meshy skin is a MeshPhysicalMaterial driven by metalness, roughness and emissive maps, so a plain material rendered as dark metal ("brown moustache");
  - attaching it rigidly to the head bone: the chin skin bends with the neck, so the edges tore.
- **Traps on the way:**
  - The carved smile groove is deeper than expected: include deep triangles.
  - Copy only triangles that lie WHOLLY inside the mouth area. One that reaches outside smears the picture across it and lets the skin texture show through (a red wedge at the corners).
  - The geometry's `position` is in the BIND pose. To move a vertex to a measured (posed) place, invert that vertex's own skinning with `applyBoneTransform`.
  - `computeVertexNormals()` reuses a shared normal attribute: clone it first, or the whole face goes black.
- **How to debug a face:**
  - paint the cover bright green (`globalThis.__mouthCover = '#00ff00'`);
  - hide the real face (colorWrite off) or turn the layer's skin texture blue, to tell "layer" from "model";
  - render close-ups with `peek.mjs` using `{face: 0}`.
- **The cover's skin colour** is sampled from a ring around the mouth (the forehead's colour was wrong). The cover stays below the nose and fades out before the layer's edge.
- **The same layer for blinking:** the old eyelid was a separate small dome with its own colour and material. It showed as an orange patch with a black bar over part of the eye. Now each eye gets a copy of the skin around it, with the closing lid drawn on it: skin sampled around the eyes, a curved lid edge, and a soft curved lash line when closed. The lid starts at the top of the eye, so the eyebrows stay visible. Test any lid position with `globalThis.__forceBlink = 0..1`.
- **Check the finished video's frames, not only the preview.** The round 4 render looked right in the singing close-ups, but frame-by-frame extraction of another close-up caught the broken blink.
- **Mouth design:** her own smile opening. The top edge sits on the painted smile line with the corners slightly raised, the corners are rounded, the bottom is round, and there's a tongue and a soft band of teeth. Closed, it is the smile line itself.

### Project 06 round 5 (28 Nov 2026): the user's screenshot review
The user reviewed the round 4 video and saved screenshots in `screenshots/`. Each problem, its cause, and what we learned:

| Problem the user saw | Real cause (found by testing, not guessing) | Lesson / fix | Status |
|---|---|---|---|
| Swing and seesaw legs "completely broken", "very artificial" | The automatic **limb solver** pushed legs out of the equipment by twisting them (knees jammed up, legs bunched). A render with the solver switched off (`globalThis.__noLegSolver = true`) showed natural legs. | **Don't fix a pose by searching for any angle that clears the equipment; fit the equipment to the body.** The solver is now off for rides (opt-in `ride.solve`), and the clearance check verifies the result. | Fixed and seen in close-ups |
| Legs through the swing seat | The seat (32 cm) was deeper than a small child's thigh, so the shins hung through its front edge. | Size equipment to the character: a shallow seat (19 cm), the child sitting at its back, knees at the front edge. Tuck less on the back-swing. | Fixed; small 3–4 cm grazes left to check |
| Mira's shins rubbing the seesaw | Thighs not spread enough for the plank. | Straddle wider (47°). | Small grazes left to check |
| Puppy floating above his seat / sitting off it | Two lifts stacked (the solver's "settle" plus the "sit on top" rule), and a nudge (`back: -0.1`) moved him off the seat. Bone positions understated his chubby legs. | **Seat a character from real skin points against the equipment's exact shapes**, in both directions: lift if sinking, lower if hovering, to a few mm of contact. Avoid nudges that move a rider off the seat. | Fixed and seen; seesaw nudge removal in progress |
| Puppy blurry in most shots | Background blur focused on ONE distance (Mira's), so Mango was out of focus a step nearer or farther. | **Blur needs a focus band covering every character in the action** (nearest to farthest plus their depth). Only what's beyond them blurs. | Built; render check pending |
| Thin black line above Mira's mouth | The mouth drawing had a dark outline; with the white teeth under it, the top edge read as a separate line. | Draw the teeth flush under the lip; no dark outline. | Built; check pending |
| Mouth "completely broken" in medium shots | Smoothing for small sizes (mipmaps) was off, so a mouth a few pixels wide broke up into jagged bits. It had been switched off to stop a smear in close-ups, which flattening the groove later fixed properly. | **A texture fix for close-ups must also be checked in medium and wide shots.** Mipmaps are back on. | Built; check pending |
| Ball bouncing "very artificial" | The bounce moved along \|sin\| arcs spread over the WHOLE shot, ignoring when it was kicked: a slow, weightless ball floating at chest height. | Real physics: rest until kicked, gravity arcs, each bounce about 55% as high, squash on landing, spin while travelling, roll to a stop. **Moving props need real physics; children notice floaty motion.** | Built; render check pending |
| Elbows not moving; standing legs robotic | Poses left elbows locked straight (raised arms) and knees locked while standing and gesturing. | Every pose: elbows never lock (at least 16° of bend); standing knees stay soft (~5–10°). Cheer bends the elbows. | Built; check pending |
| "Wave hello", but the hands hidden or coming from behind the ears | The close-up cropped the hands, and the wave raised the arm up and *back*, behind the head. | **A gesture the lyric names must be framed so it's visible** (a medium shot for waves). The wave hand comes up in FRONT, beside the face, with the elbow bent. | Pose built; shot change in progress |
| Kite behind the children | They faced the camera with the kite behind them; the string didn't reach a hand. | Characters face what they play with: profile or three-quarter view toward the kite, the kite in front of them, the string to the raised hand (new `holdKite` move). | In progress |
| Balloons not fully in the picture | The shot was framed on the characters; the balloon bunch was above the frame. | **The object the lyric names must be fully in frame** while it is sung about. | In progress |
| Actions not matching the words | Actions were placed by eye, not on the words. | Time actions to the words: estimate each word's time from syllables across the sung line; jumps on each "up", nods on "yes", the seesaw at the top on "up" and the bottom on "down" (an action `offset` starts a repeating ride part-way into its cycle). | In progress |

| Jump height, crouch, nod count and kite tugs ignored | The engine passed only `seconds`, `repeats` and `hand` to the moves; every other per-action setting was silently dropped. Lengths were also randomly varied ±7%, which would make a ride drift out of step with its equipment. | Pass every setting the move defines; keep exact lengths for rides (`hold`) and `exact` actions. **When a setting "does nothing", check that it reaches the code that uses it.** | Fixed |

| Kite above the frame once raised; tail bows lying on the ground | The camera framed only the characters; the kite's 9-bow tail (~2.5 m) reached the ground. | The camera now fits the kite (and balloons with `frame: true`) into the picture. Kite tail length is a setting (`tail`). Low camera, kite in front of the child. | Fixed and seen |
| Ball sinking into the ground while rolling | Props have their origin at the bottom, so spinning about it swung the ball through the floor. | Roll about the centre: compensate the position for the spin. **Check where a model's origin is before rotating it.** | Fixed and seen |
| Preview never loaded after a small edit | A scripted edit added a `//` comment in the MIDDLE of a line, commenting out the code after it. The syntax check passed, but it failed at runtime. | Put comments on their own line in scripted edits; after any engine edit, render one frame (not just `node --check`). | Fixed |

| Last 2–4 cm seat contacts after the refit | The back of the knee resting on the swing seat's front edge; Mango's tail tip and hock resting on his seat. | A GENTLE solver (only a small outward leg swing, at most ~17°, found continuously) plus equipment sized to the body. Judged at normal shot size: it reads as resting ON the seat, not through it. **Contact is fine; passing through is not. Look at it as the viewer sees it.** | Checked in the shots |
| Two Claude sessions in one repo | A Project 07 session was editing the same engine files and restarting the same server, and one commit swept in the other's unfinished work. | Check `ListAgents` before restarting the server or rebuilding the client; message the peer with which files you're editing and when an export runs. | Coordinated |

General lessons from this round:
- **Review the finished video the way the user does:** full frames at normal size, every shot, against the lyric. Close-up checks alone missed the medium-shot mouth, the blur on Mango and the hidden wave.
- **An automatic "fixer" can create worse problems than the one it fixes.** Always compare with and without it before keeping it.
- **Close unneeded apps before heavy work, and keep them closed.** Edge, Teams and Phone Link restart on their own.

### Project 07 lessons (indoor home, Mommy and child)

- **Read the exact prompt that was sent before re-trying a bad preview.** Both character previews came back in a meadow full of plush creatures, with the wrong clothes. The prompt stored in the job (`jobs.params`) showed why:
  - the 800-character fitter kept the generic World Style summary (which said "Sculpted soft creatures") and dropped the card's clothing and "plain background" sentences;
  - the rig stance was then pasted over the end, in animal wording ("two hind legs… front paws").

  Now:
  - the card's own description, the stance sentence and a "plain background, nothing else" sentence always survive;
  - the summary only fills what's left;
  - "creature" wording is never sent;
  - humans get a human stance.

  Check with `POST /api/cards/:id/meshy-plan` (free) before paying for a preview.
- **Finger bones are per model.** With `include_fingers`, Meshy gave the child all five fingers (68 bones) but the mother only a thumb and middle finger (44 bones). Check the bone list (`glbinfo`) before planning hand grips; give a grip to the character with full fingers.
- **The song can be measured for its beat**, not only its words: `docs/project-07/music/beats.py` (onset envelope + autocorrelation) gave 89.1 bpm. Time bobs, claps and steps to `beats.json`.
- **Keep character card prompts at about 450 characters** when the character will be rigged. The stance and background sentences take about 310 of the 800.

### Project 06 round 6 (28 Nov 2026): "polite, soft, slow" for toddlers
| What the user saw | Cause | Lesson / fix | Status |
|---|---|---|---|
| "While spinning, the shots collapse… multiple shots moving at the same time" | Dissolves between short (~2.3 s) chorus shots showed two MOVING shots at once for 0.8 s, and the camera orbited while the merry-go-round spun, so everything on screen moved. | **For toddlers, change only one thing at a time:** clean cuts (a dissolve only for slow, calm moments; an iris for a change of place); when the subject spins, the camera stays still. The merry-go-round is slower (0.22 turns/s). | Checked in the finished video |
| Mira's hands, feet and head movements "very fast", hard to follow | Gestures squeezed several cycles into the word time (3 head shakes in ~0.6 s, 2–4 random waves); swing legs kicked and tucked hard; energy varied up to +14%. | **Calm tempo:** each wave, shake, nod and clap takes at least ~0.6–0.9 s, so a short action does FEWER movements; smaller amplitudes (shake 20°, wave forearm 17°); energy never above the designed move; swing hands steady on the chains with gentle legs; slower swings (3.2 s, slow chorus 3.8 s). **A gesture children are meant to copy must be slow enough to copy.** | Checked in the finished video |
| Ball "not colourful" | The Meshy ball's texture read orange-brown in sunset light. | A studio-built glossy rainbow beach ball in the playground palette (`procedural: 'beachball'`). **Key props children watch should use the world's brightest palette colours.** | Checked in the finished video |
| Swing legs still wrong in a later swing shot | The slow-chorus swing had its own, slower settings that the earlier fix didn't cover. | **After a fix, re-check EVERY shot of that kind, not just the ones in the screenshots.** | Checked in the finished video |
| **ROOT CAUSE: swing legs and hands "very fast"; Mira standing up through the swing seat in the slow chorus** | An action's `seconds` is the TOTAL length of all its repeats (the engine divides by `repeats`), but the direction passed the length of ONE cycle. So the swing pose ran 8 cycles in 3.8 s (8× too fast), the seesaw 10 bounces in 2.4 s, skipping 9 steps in 0.6 s and climbing 3 steps in 0.6 s. Then the ride pose simply ENDED after those seconds, and in the long slow-chorus swing she stood up inside the seat. | `seconds = period × repeats` for every repeating action (rides, skip, climb). **Check the units of every timing parameter against the code that reads it; a ride pose ending mid-shot is a sign of exactly this.** | Checked in the finished video |
| (From the Project 07 session) the mouth cover picked up T-shirt colour | The skin-sampling ring around the mouth reached the clothes on a small character. | Sample only beside and above the mouth, near the face's own skin colour (fixed in FaceRig by the Project 07 session). | Checked: Mira's mouth is clean |

### Project 07 round 1 (indoor home): staging, faces, rooms
| What we saw | Cause (measured) | Lesson / fix | Status |
|---|---|---|---|
| Leo had his back to the camera at the TV, fan and fridge | The objects stood against the BACK wall or flat on a side wall, so a child FACING them faced away from the camera. | **Staging rule for rooms:** things you sit or lie on (sofa, bed) go on the back wall and face the camera. Things you look at (TV, fan) stand near the FRONT of a side wall, angled toward the camera, with the characters DEEPER in the room turned three-quarters toward them. A fridge goes in a back corner with the characters beside it in profile; hinge it on the side away from them. | Restaged; checking |
| A yellow-green "moustache" around Leo's singing mouth | The mouth-cover skin colour was sampled in a ring reaching 7 cm below the mouth. On a toddler with a short chin, that hit his yellow T-shirt (cover = 250,213,91). Found by reading the cover canvas's pixels in the running app. | Sample only beside and above the mouth, near the face's own skin colour (`FaceRig.js`). **Read the actual drawn colour before guessing at shaders.** | Fixed; seen in close-ups |
| An olive patch on Mommy's singing face | The median skin near the carved smile includes Meshy's baked shadow, so the cover was darker and duller than her lit cheeks. A magenta test cover rendered bright, which proved the shading was fine and the colour was wrong. | Sample beyond the groove (1.15–1.65 mouth widths) and use the brighter half (50th–85th percentile). | Better; a slight tint remains in extreme close-ups in shade |
| The outdoor landscape seen above the room walls; tiny characters | `wide` and `crane` shots lift the camera above the 3.1 m walls of an open-top room. | Indoors, use `full` with `distance` for wide views, at child's eye level. No cranes over the walls. | Fixed in the direction |
| The camera needed to know about a TV that isn't an actor | Framing only measures actors; equipment is invisible to it. | `camera.include: [[x,y,z]…]` adds points the frame must hold: the object the lyric names. | Built |
| Wall decorations seen from behind | A room's walls are one-sided (invisible from outside), but a door or shelf on them is not. | The room hides a wall's decorations when the camera is outside that wall (`onCamera` hook, called every frame). | Built |
| `headTilt` silently skipped on a human | It's a four-legged move; the engine warns in the render log. | Read the render warnings; use `nod` or `look` on two-legged characters. | Fixed |
| A peek close-up crashed | `face: i` counts ALL actors in the shot, including props (the sofa was actor 0). | Count props when indexing actors (`look_at`, `turn_to`, `target`, `hold.actor`, peek `face`). | Noted |

### Working cost-efficiently (user rule, 28 Nov 2026; applies to every project)
- Sonnet by default, Haiku for routine self-contained helper jobs, **never Opus**. The user-wide rules are in `~/.claude/CLAUDE.md`.
- Search before reading; read only the needed ranges; keep command output short.
- Tile frames into one image; check changed shots first, then one full check before delivery.
- Fix every instance of a problem in one round, and verify in the preview before the ~17 min full render.
- Read this file and `docs/WORK-IN-PROGRESS.md` first on a new project. What cost the most so far was repeated fix-and-render rounds: root causes found late (timing units, the leg solver) and fixes checked on only some shots.

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
