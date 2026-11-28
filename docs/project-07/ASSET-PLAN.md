# Project 07 — "My Little Home" — Asset plan and Meshy estimate (awaiting approval)

Written 27 Nov 2026, before any Meshy call. Sources: My World (`docs/world-style/world-style-2026-11-27.txt`), `docs/LEARNINGS.md`, Project 05/06 execution logs, and the real credit history in the database (jobs 50–88).

## Measured Meshy prices (from Projects 05/06, not guesses)
| Step | Credits per call |
|---|---:|
| Preview image (text-to-image) | 3 |
| 3D model from preview (image-to-3D, textured, remeshed) | 30 |
| Rig + walk/run clips (finger bones free) | 5 |
| Status polling / balance check | 0 |

Last known balance: about 2,175 credits (2,406 before Project 06 − 231 spent). It hasn't been checked live, because a balance check is also a Meshy call.

## Key decisions
- **Characters: 2 new ones (Mommy and the child), designed together as one family.** Mira could be reused as the child to save 38 credits, but a new mother and child pair matches better.
- **Rooms are built in the engine, not with Meshy.** A Meshy scenery is one solid diorama. For indoor rooms we need: removable walls on the camera side, real window light, one architecture shared by all three rooms, and an empty floor in the middle. Engine rooms give all of these.
- **Anything that moves or opens is built in the engine** (learning: "Meshy props are one solid piece"):
  - the fan spins;
  - the TV screen plays;
  - the fridge door opens with a light inside;
  - the cup is held in the hand.
- **Meshy only where soft, organic surfaces matter:** the characters, the sofa, the bed and three small decorations.
- **No reuse of earlier props or sceneries** (learning §1). The older "Cozy Starlight Bedroom" is excluded, because the brief only allows Projects 05/06 as references.

## Inventory
| # | Asset | Category | Method | Why | Meshy calls | Credits |
|---|---|---|---|---|---:|---:|
| 1 | Mommy | Character | Meshy preview → 3D → rig | Needs an organic face, hair, clothes and finger bones | 3 | 38 |
| 2 | Child | Character | Meshy preview → 3D → rig | Same | 3 | 38 |
| 3 | Living room | Environment | Engine room builder | Removable walls, window light, consistent architecture | 0 | 0 |
| 4 | Bedroom | Environment | Engine room builder | Same | 0 | 0 |
| 5 | Kitchen | Environment | Engine room builder (counters and cabinets built in) | Same | 0 | 0 |
| 6 | Sofa | Primary prop | Meshy preview → 3D | Soft fabric and cushions look premium; a seat-height setting is added for contact | 2 | 33 |
| 7 | Television | Primary prop | Engine | The screen must play ("sing a little song with me") | 0 | 0 |
| 8 | Bed | Primary prop | Meshy preview → 3D | Soft bedding, pillow and blanket; a mattress-height setting is added for lying down | 2 | 33 |
| 9 | Fan | Primary prop | Engine (standing fan at child height) | The blades must spin "round and round" | 0 | 0 |
| 10 | Refrigerator | Primary prop | Engine | The door opens to show "cold inside" | 0 | 0 |
| 11 | Cup | Primary prop | Engine | Held in the hand and sipped | 0 | 0 |
| 12 | TV stand | Supporting | Engine | Puts the screen at the child's eye level | 0 | 0 |
| 13 | Bedside table | Supporting | Engine | Room context | 0 | 0 |
| 14 | Bedside lamp | Supporting | Engine | Warm bedtime light source | 0 | 0 |
| 15 | Fridge contents (milk, juice, apples, ice) | Supporting | Engine | Shows "cold inside" | 0 | 0 |
| 16 | Kitchen counter where the cup waits | Supporting | Part of the kitchen room | Somewhere to set the cup down | 0 | 0 |
| 17 | Rug (one design, recoloured per room) | Decorative | Engine | Colour in big calm areas | 0 | 0 |
| 18 | Window with curtains | Decorative | Engine | Sunlight and depth | 0 | 0 |
| 19 | Framed wall art | Decorative | Engine | Wall colour without clutter | 0 | 0 |
| 20 | Wall shelf with books | Decorative | Engine | Lived-in feel | 0 | 0 |
| 21 | Teddy bear plush (on the bed) | Decorative | Meshy preview → 3D | Soft plush is hard to build procedurally | 2 | 33 |
| 22 | Potted plant (reused in all rooms) | Decorative | Meshy preview → 3D | Organic leaves | 2 | 33 |
| 23 | Fruit bowl (kitchen) | Decorative | Meshy preview → 3D | Organic food shapes | 2 | 33 |

**Confirmed: 16 billable Meshy calls, 241 credits.**

## Contingency (estimated)
| Risk | Calls | Credits |
|---|---:|---:|
| Up to 6 extra preview images (rejected designs) | 6 | 18 |
| 1 character remade (3D + rig) | 2 | 35 |
| 1 prop remade (3D) | 1 | 30 |
| **Contingency total** | **9** | **83** |

**Ceiling requested: 25 billable calls, 324 credits.** About $6.50 if the plan is Meshy Pro ($20 for 1,000 credits); the user should confirm their plan.

## New engine capabilities needed (local, no cost)
- Room builder: walls, floor, window light and colour scheme per room, with the camera-side wall hidden.
- Engine props: TV with a playing screen, spinning fan, opening fridge, cup.
- Holding: the cup attached to a hand bone, with fingers curled (new characters get finger bones).
- Poses: sitting on the sofa, lying down with the head on the pillow, Mommy kneeling to the child's height, pointing at an object, sipping.
- Contact settings for the Meshy sofa and bed (seat and mattress surfaces), checked with `clearance.mjs`.
