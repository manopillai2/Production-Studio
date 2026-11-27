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
13. Known limitations and ideas for later

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

## 13. Known limitations and ideas for later

- Faces: no expressions on cue (only blinks and singing mouths). A small dark mark sometimes shows at the mouth corner.
- No hand contact: Mira can't hold the kite string or balloon ribbons. Props have no part animation.
- Repeated chorus close-ups are still framed similarly. Shot Doctor could flag "same shot as the last chorus".
- Shot Doctor idea: "action too small to see" when a gesture plays while the character covers less than 25% of the frame height.
- No depth of field, water reflections or particles (leaves, sparkles).
- 4K export is missing from the UI.
- Claude token usage isn't tracked.
