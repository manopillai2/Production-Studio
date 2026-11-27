# Project 06 — "Mira and Mango: Playground Party!" — Execution log

Project number **6** · database id **17** · `http://localhost:5175/#/project/17/export`

## The brief (user, 27 Nov 2026)
Duplicate Project 05: same lyrics, same characters (Mira, Mango), same music. New and much more colourful places and props, made with Meshy: three places, three or four props. The screen should be detailed and colourful everywhere ("not random trees here and there"). A completely new, higher-quality direction: Mira and Mango play on real playground equipment (a seesaw…), expressive, attractive for kids. Cinematic and realistic. Apply all learnings. Close unneeded apps so the machine works only on this project.

## Steps
1. **Machine:** closed Edge (1.7 GB), WhatsApp, Copilot, Lenovo helper and leftover test browsers before heavy work (free RAM 1.3 → 2.5–3 GB). VS Code left open.
2. **Duplicate** (`duplicate.mjs`): new episode 17 with the approved lyrics (48 lines), the Suno song (file copied), the measured line timing, and the Mira and Mango cards (same My World versions, so the same rigs and walk/run clips). Nothing else copied.
3. **New assets in Meshy** (`assets.mjs`): cards, then Claude-written prompts (World Style), then preview images (checked), then 3D from the previews.
   - Places: **Rainbow Playground** (rainbow soft-play floor, candy fence, lamps, benches, flower boxes), **Lollipop Candy Garden** (lollipop trees, rainbow rope edge, mint lawn, a stream), **Mushroom Fairy Glade** (giant spotted mushrooms, ferns, toadstools).
   - Props: **Rainbow Beach Ball**, **Rainbow Hot-Air Balloon** (sun face), **Candy Ice-Cream Cart**, **Giant Rainbow Pinwheel**.
   - The ice-cream cart came with a cloud and leaves copied from the preview background (5 flat pieces) → removed with `tools/remove-islands.mjs` (keep the main piece; original kept in `originals/`). The tool got a `--near` mode and a `BOXES=1` report to tell floating bits from attached parts.
   - All approved and saved to My World (items 85–91).
4. **Engine — playground equipment with real moving parts** (`client/src/engine/Playground.js`): seesaw (tilting plank, seats, handles), swing set (two swings on 1.65 m chains, ~2.6 s period), slide (ladder, platform, roof, wavy chute), merry-go-round (spinning striped disc, rails, canopy), plus a **kite** (fluttering bow tail, string to Mira's hand, can swoop) and **pink balloons** (bob, then float away). Meshy makes one solid piece, so these are built in the engine.
5. **Riding:** shots carry `setting.equipment`; an actor with `ride: {equip, seat}` is placed on the seat every frame and its hips are put exactly on the seat. New moves: `sit`, `seesawRide` (push at the bottom, "wheee" at the top), `swingRide` (tuck going back, stretch going forward, hands on the chains), `merryRide` (hold, then wave), `slideRide` (arms up), `dogSit` (Mango; his rig's rear chain is lower leg → hock, so the hocks were added to the bone map). A ride that covers the whole shot starts seated (no stand-to-sit blend at the cut).
6. **Landscape "rich" detail** (new option `detail: rich`, wired through World Style, Stage 2, Stage 4, server and Claude's prompts): rainbow flower beds in curved bands, bunting between striped poles (fluttering), candy-coloured blossom trees, patchwork hills, a rainbow arc, drifting hot-air balloons, butterflies — on top of houses, river, wind and birds.
7. **Cinematic camera:** new `crane` move (high and wide, sweeping down), a side angle `yaw` for every move, an adjustable `orbit` amount, low hero angles (`height` negative), push-ins; a soft vignette on every frame.
8. **Direction** (`direction.mjs`, 38 shots, same song timing as Project 05, split further for more cuts): intro crane into the playground; walking past flower beds; the merry-go-round on "zooming past"; the seesaw on "up and down"; close-ups for "yes and no, hello, goodbye"; jumps with a bouncing beach ball; Mango's close-up; bow and play-bow; **balloons float up on "Up float balloons"**; swings on "high and low"; the slide; a reverse-angle ball game; the candy garden (crane, balloons, seesaw, ice-cream cart, pinwheel dance); **the kite flies on "Red kite flying high" and swoops on "Swooping low"**; the merry-go-round; nod/shake two-shot; the mushroom glade at sunset (crane, hot-air balloon, swings, golden close-up, dance party, gentle swing and seesaw at dusk, a walk, a ball game); the finale back in the playground at sunset (merry-go-round, slide, seesaw hero shot, thank-you, end card with balloons floating away).
9. **Review rounds** (contact sheets of every shot + Shot Doctor): fixed the slide shots (camera blocked by the seesaw → slide moved back, camera front-right), reverse-angle shots (characters had their backs to the camera; a slide leg in the foreground), balloons that had already left the picture (later, slower lift), the kite out of the picture (lower, bigger, wider low angle), pinwheels out of the picture, the glade camera among the mushroom stalks (glade scaled 1.35, gentler angles), long still shots (push-ins).
10. **Checks:** determinism — the same moment rendered twice (also after other moments) gives identical rider positions and head angles; full-resolution frames of the seesaw, swings and merry-go-round.

## Meshy credits
7 previews (~21) + 7 models from previews (~210) ≈ **231 credits**. Balance before: 2,406. No subscriptions or other paid services.

## Known limitations
- Mango's sitting pose reads a bit low and flat from the side on the seesaw and merry-go-round.
- No depth of field (background blur) yet; the vignette and camera work carry the cinematic feel.
- The end card shows over the last ~26 s of instrumental outro (as in Project 05).
- Fingers can't bend (no finger bones in Meshy's rig).

## First preview — VERIFIED (27 Nov 2026)
`storage/media/exports/episode-17/2026-11-27T17-07-04-1080p/` — 1920×1080, 30 fps, 212.37 s, −15.7 LUFS (identical to the song), 160 MB.

---

# Round 2 — user feedback (27 Nov 2026)
Feedback: on the merry-go-round, seesaw and slide, Mira's legs go through the equipment. Why only walking? Add more movement. No new Meshy calls for Project 06.

**Cause of the legs problem:** every ride used one generic sitting pose (thighs forward, shins hanging straight down). It only fits a swing; on the seesaw the shins hung through the plank, on the merry-go-round through the disc, on the slide through the chute.

| Ride | Before | Now |
|---|---|---|
| Seesaw | sitting along the plank, shins through it | **straddling** the plank: thighs spread, a leg each side, knees bend to push off at the bottom, stretch at the top |
| Merry-go-round | sitting sideways on the disc | **at the rim, facing out**, legs dangling and swinging over the edge, hands on the edge, then a wave |
| Slide | knees bent into the chute; appeared at the top | **climbs the ladder** (hand-over-hand, opposite foot), sits on the deck with legs out over the chute, slides with **legs straight along the chute** |

**Cause of "only walking":** characters only travelled with the walk/run clip; every other move was done standing still. New moves: **skip** (step-hop gait, arms swinging), **climb**, **kickBall**, **twirl** (arms out), and for Mango **rollOver** (onto his back and over), **jumpCatch** (a leap), plus zoomies (running circles). Direction changes: a running chase on "Now we're running fast" then the merry-go-round on "zooming past"; climbs before both slides (the slide shot was too short for climb + slide → extended into the next line); a kick-and-leap ball game from a reverse angle (moved left so the slide's leg isn't in the foreground); Mango's zoomies; skipping into the candy garden and through the glade; twirls by the cart, the pinwheels and in the dance party; roll-overs; a twirl and a jump in the thank-you. The kite shots were re-framed (camera inside the garden, kite lower) so the whole kite is seen.

Checked with close-up cameras placed next to each rider (legs on the seesaw, merry-go-round, ladder, slide deck and chute) and a full contact sheet; Shot Doctor only notes Mango facing away at times on the spinning merry-go-round. Meshy credits this round: **0**.

Also this round: all 15 landscapes ever made (6 projects) were saved to My World as copies (new kind "Landscape", settings .json + picture), with Stage 2 highlighting any landscape not saved or changed since saving.

## Round 2 preview — VERIFIED (27 Nov 2026)
`storage/media/exports/episode-17/2026-11-27T17-38-44-1080p/` — 1920×1080, 30 fps, 212.37 s, −15.7 LUFS (identical to the song), 159 MB. Frames checked: chase, merry-go-round at the rim, seesaw astride, ladder climb + slide, ball games, skipping, roll-over, kite, glade, finale. Status: Awaiting User Review.

---

# Round 3 — user feedback (27 Nov 2026)
Feedback: too many props; children can't follow the characters. Limit props but keep it colourful and vibrant. Mira's feet go through the seesaw and the merry-go-round. A completely new, more cinematic direction with the existing assets (no new Meshy calls), and nothing may overlap or go through anything. Asked to research how children's videos should choose props (count, colour, brightness) so nothing confuses young viewers.

## What the research says (and the rule taken from it)
| Finding | Source | Rule in this direction |
|---|---|---|
| Kindergartners in a heavily decorated room were off-task more (38.6% vs 28.4%) and learned less (42% vs 55%) than in a sparse room. | Fisher, Godwin & Seltman 2014, *Psychological Science* — [CMU news](https://www.cmu.edu/news/stories/archives/2014/may/may27_decoratedclassrooms.html) | Background stays calm: no decoration for its own sake. |
| 3½-year-olds learned words from storybooks with one picture at a time, not with two competing pictures. | Flack & Horst 2017 — [York St John repository](https://ray.yorksj.ac.uk/id/eprint/15519/) | One focus per shot: the action the lyric names. |
| Infants and toddlers keep track of about three objects at once and fail at four. | Feigenson & Halberda 2008 and Feigenson & Carey — [PMC2464616](https://pmc.ncbi.nlm.nih.gov/articles/PMC2464616) | At most three things to follow: Mira, Mango and one object. |
| Cuts and movement reliably pull young children's eyes; very young children are driven by salient features (motion, sound). | Huston & Wright, Anderson — [PMC3305831](https://pmc.ncbi.nlm.nih.gov/articles/PMC3305831), [Encyclopedia.com overview](https://encyclopedia.com/media/encyclopedias-almanacs-transcripts-and-maps/childrens-attention-television) | Only the subject moves a lot; no fluttering bunting, butterflies, drifting balloons or birds in the background. |
| Motion and brightness in extra screen elements distract children from their task. | [PMC3921552](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3921552/) | The brightest, sharpest, most saturated thing is the character: background blur and a softer background. |
| Children aged 4–7 prefer bright colours (higher brightness, within a range of saturation). | Frontiers in Psychology 2023 — [article](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2023.1205213/pdf) | Bright day and golden light; colour comes in big calm areas (rainbow floor, patchwork hills, blossom trees), not many small objects. The brown, dim mushroom glade is dropped. |
| Important elements should stand out from the rest of the screen through colour, line weight or style. | Sesame Workshop best practices — [PDF](https://joanganzcooneycenter.org/wp-content/uploads/2020/02/SesameWorkshop-2012.pdf) | Characters are separated by rim light and depth of field. |
| Background TV disrupts preschoolers' focus whatever its content. | [ScienceDirect 2021](https://www.sciencedirect.com/science/article/abs/pii/S0193397321000435) | Supports a calm background too. |

Caveats: most studies are about classrooms, books, toys or background TV, not animation directly, and some are small; they agree on the direction (less competing detail, one focus), not on exact numbers.

## Engine changes
- **Clearance checker** (`client/src/engine/Clearance.js`, `engine.clearanceAt(t)`, `tools/testing/clearance.mjs`): measures ~1,400 real skin points per character (skinned, so poses count) against exact shapes of the equipment (boxes, rods, balls, rings, the slide chute), props and the other character (inside test), the scenery model (voxel grid above the floor) and the ground. Hands may hold thin bars, chains and rims. Reports the depth in cm, per shot.
- **Limb solver** (runs every frame for riders): if a leg or arm would go into the equipment or the floor, it swings it outward, raises the knee or bends the knee/elbow until clear (small fixed search, same result every render). A four-legged rider keeps its sitting pose and is lifted so paws, legs and tail are on top of the seat; his tail goes up (a happy pup). **Bug found on the way:** the solver first moved the hidden analysis copy of the skeleton (`rig.map`), as the life layer once did; it now uses the character's own bones.
- **Equipment redesign** (measured, not guessed): the seesaw plank and seat are narrow (26–27 cm) so a child straddles them, with the bumper at the very end; a wide seat and no handle on a dog's end (`wide_seat`, `no_handle`); the merry-go-round seat is at the rim (knees past the edge) and a dog sits further in (`ride.back`); the slide tower is wider and taller (Mira's hair hit the posts, her shoulders the roof), the chute ends low with a flat run-out, and the rider **steps off onto the grass** after sliding (before, she stood up inside the chute's end).
- **Background blur (depth of field)**: the subject sharp, the background soft; strength by shot size (close-up strongest) or per shot (`camera.dof`: off / auto / 0–2; Stage 4 → "Background blur").
- **Landscape detail "focus"**: patchwork hills, blossom trees and three calm flower bands far back; no bunting, sky balloons, butterflies or rainbow. Project look: no houses, no birds, calm wind, few clouds.

## Ride test (before → after, worst depth)
| Ride | Before | After |
|---|---|---|
| Seesaw: Mira's shins | 6 cm into the bumper, 5 cm into the plank | clear |
| Seesaw: Mango | head 3 cm into the handle post, legs 5 cm into the seat | clear (no handle on his end, wide seat) |
| Merry-go-round: Mira's legs | through the rim | clear |
| Slide: Mira | toes 27 cm through the chute, shoulders 18 cm into the roof; stood inside the chute end | ≤ 3 cm brief touches |

## The new direction (52 shots, `direction.mjs`; round 2 kept as `direction-v2.mjs`)
- **Two places:** the Rainbow Playground is home (morning, day, and golden sunset for "Wave goodbye to the setting sun" and the finale). The Lollipop Candy Garden is used for chorus 3, the kite verse and chorus 4. The Mushroom Glade is not used: its brown, dim look worked against "vibrant".
- **Props used only when the lyric names them:** balloons on "Up float balloons" (three times, smaller so they stay in the picture), the kite in verse 3, and the beach ball in the second verse 2 and one instrumental. The ice-cream cart, pinwheels and hot-air balloon are not used (no lyric for them).
- **The chorus is the same every time:**
  - "Slow and fast, up and down" → seesaw;
  - "High and low, spin around" → swing (merry-go-round in choruses 3 and 6);
  - "Yes and no, hello, goodbye" → nod, shake, wave;
  - "Come on, copy" → Mira invites the viewer, Mango copies.
  Each chorus changes the camera side, height and light.
- **Cinematic camera, aimed at the action:**
  - a crane into the playground (the only shot with all the equipment);
  - a low hero angle on the seesaw, three-quarter angles on the swings (side-on, Mango hid Mira), and an orbit on the merry-go-round;
  - close-ups with strong blur for "yes and no";
  - follow shots for walking, running and skipping, with Mango on the far side so he never blocks Mira;
  - a tilt-up for jumps, balloons and the kite;
  - push-ins on the slow chorus.
- **An arm's length between the characters** (marks 1.0 m apart), so gestures never reach into each other.

## Checks
- **Clearance:** 52/52 shots clear, sampled every 0.2 s (about 1,060 moments, about 2,800 skin points each). Fixed along the way:
  - intro marks on uneven ground at the edge;
  - the ball starting inside Mira and ending inside Mango;
  - Mango's rear legs sinking when the seesaw tilts (the seat test now follows the seat's tilt);
  - Mango sinking into the ground when leaping or rolling (four-legged characters had no ground contact at all; now paws, hocks and a skin check keep him on the floor);
  - Mira's palm in the swing seat (the rig has no finger bones, so the palm is estimated past the wrist);
  - Mira's hand reaching into Mango (marks moved apart).
- **Contact sheets** checked twice. Fixed: Mango blocking Mira in the walk; a back-of-head shot in the bow; backs to the camera in "wave goodbye"; tiny characters in the run and in "balloons up and away"; balloons leaving the frame too early.
- **Speed:** the inside test first raycast the moving (skinned) mesh, which re-skins every vertex for every ray (minutes per shot). The posed mesh is now baked once per check, so it takes milliseconds.
- **Machine:** Edge (started again) and Microsoft Teams (background) were closed at the user's request; VS Code stays open because Claude Code runs inside it.

Meshy credits this round: **0**.
