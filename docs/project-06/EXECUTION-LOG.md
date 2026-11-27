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
