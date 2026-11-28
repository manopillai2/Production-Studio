// Project 07 "My Little Home": the complete direction (storyboard → shots), timed to the user's song.
// Rules (My World kids-first + LEARNINGS):
//  - One learning object per shot, the one being sung, FULLY in frame (camera.include); at most three things to follow.
//  - The same pattern for all six objects, so toddlers know what comes next:
//      Mommy introduces ("This is a…": an open-hand present toward it, the object "wakes up": TV on, fan spins, door opens)
//      → the child acknowledges ("Oh, a…!": a little surprised hop) → repeats (a point on EVERY repeated word)
//      → the picture reinforces (the "together" line ACTS it: sit, sing, sleep, spin, shiver, sip).
//  - Objects on side walls are faced in profile and filmed from the front at an angle (no backs to the camera);
//    the sofa and bed on the back wall are used facing the camera. Characters an arm's length apart.
//  - Calm pacing: a cut per line (none faster than ~1.5 s), child's-eye-level cameras, gentle push-ins on longer shots,
//    an establishing shot per room, a 22 s instrumental used for the walk to the kitchen.
//  - Actions start on the measured WORD times (music/timing.json) and beats (music/beats.json, 89 bpm).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const B = 'http://localhost:5175', EP = 18;
const call = async (m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${u}: ${j.error}`); return j; };
const T = JSON.parse(fs.readFileSync(path.join(DIR, 'music/timing.json'), 'utf8'));
const BEAT = JSON.parse(fs.readFileSync(path.join(DIR, 'music/beats.json'), 'utf8')).period; // 0.673 s
const L = T.lines; const st = (i) => L[i].start, en = (i) => L[i].end;
/** Song time of word n of line i (measured by whisper; falls back to an even spread over the line). */
const wt = (i, n) => L[i].words[n]?.start ?? st(i) + ((en(i) - st(i)) * n) / L[i].words.length;

// ---------- cast ----------
const CARD = { mommy: 68, leo: 69, sofa: 70, bed: 71, teddy: 72, plant: 73, fruit: 74 };
const MOMMY = 1.08, LEO = 0.633; // engine normalises characters to 1.5 m: Mommy 1.62 m, Leo 0.95 m
const yawTo = (from, to) => +Math.atan2(to[0] - from[0], to[2] - from[2]).toFixed(3);
const mommy = (pos, more = {}) => ({ card_id: CARD.mommy, pos, scale: MOMMY, ...more });
const leo = (pos, more = {}) => ({ card_id: CARD.leo, pos, scale: LEO, ...more });
const prop = (card, pos, scale, ry = 0) => ({ card_id: card, pos, scale, rot: [0, ry, 0] });
const A = (move, at, extra = {}) => ({ move, at: +Math.max(0, at).toFixed(2), ...extra });
const hold = (move, seconds, extra = {}) => ({ move, at: 0, seconds, hold: true, ...extra });

// ---------- the three rooms (one home: same floor, trim, window and light logic) ----------
const ROOM = (style) => ({ type: 'room', style, pos: [0, 0, 0] });
// living room: sofa under the window (back wall), TV on the right wall facing the room
const SOFA = [-0.6, 0, -3.25], SEAT_Y = 0.42;
const TV = (on) => ({ type: 'tv', pos: [3.85, 0, -1.2], rot_y: -Math.PI / 2, ...(on != null ? { on: { at: on } } : {}) });
const TV_SCREEN = [3.82, 0.95, -1.2];
const SEATS_SOFA = { type: 'seats', pos: SOFA, seats: { a: { pos: [-0.42, SEAT_Y, 0.02] }, b: { pos: [0.4, SEAT_Y, 0.06] } } };
const livingProps = (plant = true) => [prop(CARD.sofa, SOFA, 1.9), ...(plant ? [prop(CARD.plant, [-2.25, 0, -3.35], 0.89, 0.3)] : [])];
// bedroom: bed head against the back wall, a bedside table, the fan on the right facing the room
const BED = [-1.6, 0, -3.0], MATTRESS_Y = 0.42;
const FAN = (on) => ({ type: 'fan', pos: [2.7, 0, -1.7], rot_y: -1.07, height: 1.15, ...(on != null ? { on: { at: on } } : {}) });
const FAN_HEAD = [2.7, 1.15, -1.7];
const NIGHT = { type: 'nightstand', pos: [-0.5, 0, -3.5], lit: true };
const bedProps = () => [prop(CARD.bed, BED, 1.64), prop(CARD.teddy, [-0.95, 0, -2.35], 0.39, -0.5)];
const LIE = { type: 'seats', pos: BED, seats: { lie: { pos: [0, MATTRESS_Y + 0.06, 0.12], rot: [-Math.PI / 2, 0, 0] } } };
// kitchen: worktop along the back wall, fridge on the right wall (hinge at the back: it opens away from the camera)
const FRIDGE = (open) => ({ type: 'fridge', pos: [3.8, 0, -1.6], rot_y: -Math.PI / 2, hinge: 'left', ...(open ? { open } : {}) });
const FRIDGE_C = [3.6, 1.0, -1.6];
const kitchenProps = () => [prop(CARD.fruit, [-2.6, 0.9, -3.5], 0.4), prop(CARD.plant, [-3.5, 0.9, -3.52], 0.5, 0.4)];
const CUP = (hold) => ({ type: 'cup', pos: [0.45, 0.9, -3.42], size: 1.25, ...(hold ? { hold } : {}) });

// ---------- look and light ----------
const INDOOR = { detail: 'focus', houses: 'few', dressing: 'none', trees: 'some', birds: 'none', wind: 'calm', clouds: 'few', river: 'none', hills: 'rolling' };
await call('PUT', `/api/episodes/${EP}/look`, { ...INDOOR, sky: 'storybook' });
const morning = { preset: 'morning', look: INDOOR }, day = { preset: 'day', look: INDOOR }, evening = { preset: 'sunset', look: INDOOR };

const shots = [];
const shot = (title, lf, lt, so, eo, equipment, actors, camera, lighting) => shots.push({ title, line_from: lf, line_to: lt, start_override: +so.toFixed(2), end_override: +eo.toFixed(2), setting: { scale: 1, equipment }, actors, camera, lighting });
const rel = (t, s0) => +(t - s0).toFixed(2);

// ======================= LIVING ROOM =======================
const M_L = [0.9, 0, -1.4], K_L = [0.05, 0, -0.9];
{ const s0 = 0; // Intro: the warm living room; Leo toddles in to Mommy
  shot('Intro · morning in the living room, Leo runs to Mommy', 0, 0, s0, st(0), [ROOM('living'), TV()], [
    ...livingProps(),
    mommy(M_L, { rot: [0, -0.5, 0], actions: [A('wave', 3.6, { seconds: 1.8 })] }),
    leo([-3.2, 0, 0.2], { motion: { type: 'path', to: K_L, start: 0.6 }, turn_to: 2 }), // actors: 0 sofa, 1 plant, 2 Mommy, 3 Leo
  ], { preset: 'crane', size: 'wide', transition: 'cut', dof: 'off' }, morning); }
{ const s0 = st(0); // "Mommy, Mommy, what is this?" — he looks up at her, tugs, then points at the sofa
  shot('Mommy, Mommy, what is this? (Leo asks, points at the sofa)', 0, 0, s0, st(1), [ROOM('living'), TV()], [
    ...livingProps(false),
    mommy(M_L, { rot: [0, yawTo(M_L, K_L), 0], look_at: 2 }),
    leo(K_L, { rot: [0, yawTo(K_L, M_L), 0], actions: [A('greet', rel(wt(0, 0), s0), { seconds: 1.6 }), A('point', rel(wt(0, 2), s0) - 0.1, { points: 2, seconds: 2.2, height: 'low', hand: 'right' })] }),
  ], { preset: 'group', size: 'full', yaw: -0.25, height: -0.4, include: [[-0.6, 0.9, -3.25]] }, morning); }
{ const s0 = st(1); // "Tell me, tell me, what is this?" — two little hops on "tell me", a head tilt
  shot('Tell me, tell me, what is this? (Leo bounces, Mommy smiles)', 1, 1, s0, st(2), [ROOM('living'), TV()], [
    ...livingProps(false),
    mommy(M_L, { rot: [0, yawTo(M_L, K_L), 0], look_at: 2, actions: [A('nod', rel(wt(1, 4), s0), { nods: 2, amount: 12, seconds: 1.4 })] }),
    leo(K_L, { rot: [0, yawTo(K_L, M_L), 0], look_at: 1, actions: [A('hop', rel(wt(1, 0), s0) - 0.1, { height: 0.06, seconds: 0.55, repeats: 1 }), A('hop', rel(wt(1, 2), s0) - 0.1, { height: 0.06, seconds: 0.55 }), A('headTilt', rel(wt(1, 4), s0), { seconds: 1.6 })] }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.35, height: -0.6, target: 2 }, morning); }

// ---- Learning 1: SOFA ----
const M_S = [0.75, 0, -1.9], K_S = [-1.65, 0, -1.55];
{ const s0 = st(2); // Mommy presents the sofa with an open hand
  shot('This is a sofa, soft and wide! (Mommy presents)', 2, 2, s0, st(3), [ROOM('living'), TV()], [
    ...livingProps(),
    mommy(M_S, { rot: [0, -0.55, 0], actions: [A('present', rel(wt(2, 0), s0), { hand: 'right', seconds: Math.max(2.5, en(2) - st(2)) })] }),
    leo(K_S, { rot: [0, 0.5, 0], look_at: 2 }),
  ], { preset: 'group', size: 'wide', yaw: 0, height: -0.3, include: [[-1.5, 0.9, -3.7], [0.3, 0.9, -3.7]] }, morning); }
{ const s0 = st(3); // "Oh, a sofa! Sofa, sofa!" — surprised hop on "Oh", a point on every "sofa"
  const pts = [2, 3, 4].map((n) => wt(3, n));
  shot('Oh, a sofa! Sofa, sofa! (Leo points on every "sofa")', 3, 3, s0, st(4), [ROOM('living'), TV()], [
    ...livingProps(false),
    leo(K_S, { rot: [0, 0.55, 0], actions: [A('hop', rel(wt(3, 0), s0) - 0.12, { height: 0.07, seconds: 0.5 }), A('point', rel(pts[0], s0) - 0.2, { points: 3, height: 'low', hand: 'left', seconds: Math.max(1.4, pts[2] - pts[0] + 0.7) })] }),
  ], { preset: 'group', size: 'full', yaw: -0.45, height: -0.5, include: [[-1.45, 0.9, -3.7], [0.25, 0.9, -3.7]] }, morning); }
{ const s0 = st(4); // "Sit, sit, sit by my side!" — side by side on the sofa, Leo pats the seat on each "sit", then they lean and sway
  const sits = [0, 1, 2].map((n) => wt(4, n));
  shot('Sit, sit, sit by my side! (together on the sofa)', 4, 4, s0, st(5), [ROOM('living'), TV(), SEATS_SOFA], [
    ...livingProps(),
    mommy([SOFA[0] - 0.42, 0, SOFA[2]], { ride: { equip: 2, seat: 'a', lift: 0.02 }, look_at: 3, actions: [hold('sitRelax', 30), A('sway', rel(wt(4, 3), s0), { base: 'sit', beats: 4, seconds: 4 * BEAT })] }),
    leo([SOFA[0] + 0.4, 0, SOFA[2]], { ride: { equip: 2, seat: 'b', lift: 0.02 }, look_at: 2, actions: [hold('sitRelax', 30, { short: 'yes' }), A('pat', rel(sits[0], s0) - 0.15, { base: 'sitShort', hand: 'left', pats: 3, reach: 0.15, seconds: Math.max(1.4, sits[2] - sits[0] + 0.6) }), A('sway', rel(wt(4, 3), s0), { base: 'sitShort', beats: 4, seconds: 4 * BEAT })] }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.1, height: -0.2 }, morning); }

// ---- Learning 2: TV ----
const M_T = [2.15, 0, -2.25], K_T = [1.55, 0, -0.55];
{ const s0 = st(5); // Mommy presents the TV; it switches on as she names it
  shot('This is a TV, look and see! (the TV switches on)', 5, 5, s0, st(6), [ROOM('living'), TV(rel(wt(5, 3), s0) - 0.1)], [
    mommy(M_T, { rot: [0, 0.9, 0], actions: [A('present', rel(wt(5, 0), s0), { hand: 'left', seconds: Math.max(2.5, en(5) - st(5)) })] }),
    leo(K_T, { rot: [0, yawTo(K_T, TV_SCREEN), 0] }),
  ], { preset: 'group', size: 'full', yaw: -0.6, height: -0.2, include: [[3.85, 1.35, -1.95], [3.85, 0, -0.45]] }, day); }
{ const s0 = st(6); // "Oh, a TV! TV, TV!" — hop, then a point on every "TV"
  const pts = [2, 3, 4].map((n) => wt(6, n));
  shot('Oh, a TV! TV, TV! (Leo points on every "TV")', 6, 6, s0, st(7), [ROOM('living'), TV(-10)], [
    leo(K_T, { rot: [0, yawTo(K_T, TV_SCREEN), 0], actions: [A('hop', rel(wt(6, 0), s0) - 0.12, { height: 0.07, seconds: 0.5 }), A('point', rel(pts[0], s0) - 0.2, { points: 3, height: 'level', hand: 'right', seconds: Math.max(1.4, pts[2] - pts[0] + 0.7) })] }),
  ], { preset: 'group', size: 'full', yaw: -0.85, height: -0.5, include: [[3.85, 1.35, -1.95], [3.85, 0, -0.45]] }, day); }
{ const s0 = st(7); // "Sing a little song with me!" — the TV star sings; they sway together on the beat, facing us
  shot('Sing a little song with me! (sway together, the TV star sings)', 7, 7, s0, st(8), [ROOM('living'), TV(-10)], [
    ...livingProps(false),
    mommy([1.6, 0, -1.55], { rot: [0, -0.35, 0], actions: [A('sway', 0.2, { beats: 6, seconds: 6 * BEAT, arms: 'low' })] }),
    leo([0.75, 0, -1.0], { rot: [0, -0.15, 0], actions: [A('sway', 0.2, { beats: 6, seconds: 6 * BEAT, arms: 'up' })] }),
  ], { preset: 'group', size: 'full', yaw: -0.4, height: -0.3, include: [[3.85, 1.35, -1.95]] }, day); }

// ======================= BEDROOM (warm evening light) =======================
// ---- Learning 3: BED ----
const M_B = [0.1, 0, -2.2], K_B = [-0.75, 0, -1.6];
{ const s0 = st(8);
  shot('This is a bed, soft and sweet! (bedroom; Mommy presents)', 8, 8, s0, st(9), [ROOM('bedroom'), FAN(), NIGHT], [
    ...bedProps(),
    mommy(M_B, { rot: [0, -0.7, 0], actions: [A('present', rel(wt(8, 0), s0), { hand: 'right', seconds: Math.max(2.5, en(8) - st(8)) })] }),
    leo(K_B, { rot: [0, -0.9, 0], look_at: 2 }),
  ], { preset: 'dolly-in', size: 'wide', yaw: 0.2, height: -0.2, include: [[-2.1, 0.9, -3.75], [-1.1, 0.5, -2.25]], transition: 'dissolve' }, evening); }
{ const s0 = st(9); // "Oh, a bed! Bed, bed!" — he pats the soft bed on every "bed"
  const pts = [2, 3, 4].map((n) => wt(9, n));
  shot('Oh, a bed! Bed, bed! (Leo pats the bed on every "bed")', 9, 9, s0, st(10), [ROOM('bedroom'), FAN(), NIGHT], [
    ...bedProps(),
    leo([-0.85, 0, -2.6], { rot: [0, -Math.PI / 2, 0], actions: [A('hop', rel(wt(9, 0), s0) - 0.12, { height: 0.06, seconds: 0.5 }), A('pat', rel(pts[0], s0) - 0.25, { hand: 'right', pats: 3, reach: 0.55, seconds: Math.max(1.4, pts[2] - pts[0] + 0.7) })] }),
  ], { preset: 'group', size: 'full', yaw: -0.35, height: -0.3, include: [[-2.1, 0.9, -3.75], [-1.1, 0.4, -2.25]] }, evening); }
{ const s0 = st(10); // "Rest your head and go to sleep!" — Leo lies down, Mommy tucks the quilt up to his chin
  shot('Rest your head and go to sleep! (tucked in)', 10, 10, s0, st(11), [ROOM('bedroom'), FAN(), NIGHT, LIE,
    { type: 'blanket', pos: [BED[0], MATTRESS_Y + 0.02, BED[2] + 0.42], w: 0.95, l: 0.95, color: '#B79CFF', cover: { at: 0.6, dur: 2.0 } }], [
    ...bedProps(),
    leo([BED[0], 0, BED[2]], { ride: { equip: 3, seat: 'lie', lift: 0.08 }, actions: [hold('lie', 30)] }),
    mommy([-0.6, 0, -2.4], { rot: [0, -1.35, 0], look_at: 2, actions: [A('tuck', 0.4, { seconds: 2.6 }), A('nod', 3.4, { nods: 1, amount: 10, seconds: 1.2 })] }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.25, height: 0.6, include: [[-2.1, 0.9, -3.75]] }, evening); }

// ---- Learning 4: FAN ----
const M_F = [1.5, 0, -2.45], K_F = [1.0, 0, -0.9];
{ const s0 = st(11); // Mommy switches the fan on as she names it; the coloured blades spin up
  shot('This is a fan, round and round! (the fan starts to spin)', 11, 11, s0, st(12), [ROOM('bedroom'), FAN(rel(wt(11, 3), s0) - 0.2), NIGHT], [
    mommy(M_F, { rot: [0, 1.15, 0], actions: [A('point', rel(wt(11, 2), s0) - 0.6, { points: 1, height: 'low', hand: 'left', seconds: 1.4 }), A('present', rel(wt(11, 4), s0), { hand: 'left', seconds: 2.4 })] }),
    leo(K_F, { rot: [0, yawTo(K_F, FAN_HEAD), 0] }),
  ], { preset: 'group', size: 'full', yaw: -0.5, height: -0.3, include: [[2.7, 1.55, -1.7], [2.9, 0, -1.4]] }, evening); }
{ const s0 = st(12); // "Oh, a fan! Fan, fan!" — a point on every "fan"
  const pts = [2, 3, 4].map((n) => wt(12, n));
  shot('Oh, a fan! Fan, fan! (Leo points on every "fan")', 12, 12, s0, st(13), [ROOM('bedroom'), FAN(-10), NIGHT], [
    leo(K_F, { rot: [0, yawTo(K_F, FAN_HEAD), 0], actions: [A('hop', rel(wt(12, 0), s0) - 0.12, { height: 0.07, seconds: 0.5 }), A('point', rel(pts[0], s0) - 0.2, { points: 3, height: 'high', hand: 'right', seconds: Math.max(1.4, pts[2] - pts[0] + 0.7) })] }),
  ], { preset: 'group', size: 'full', yaw: -0.75, height: -0.6, include: [[2.7, 1.55, -1.7], [2.9, 0, -1.4]] }, evening); }
{ const s0 = st(13); // "Round and round and round it goes!" — both turn round in the breeze, as the blades do
  shot('Round and round and round it goes! (both twirl with the fan)', 13, 13, s0, 70.5, [ROOM('bedroom'), FAN(-10), NIGHT], [
    mommy([0.9, 0, -1.9], { rot: [0, -0.2, 0], actions: [A('twirl', rel(wt(13, 0), s0) + 0.1, { seconds: 2.6 }), A('sway', 3.2, { beats: 4, seconds: 4 * BEAT })] }),
    leo([0.1, 0, -1.15], { rot: [0, -0.1, 0], actions: [A('twirl', rel(wt(13, 0), s0), { seconds: 2.4 }), A('twirl', rel(wt(13, 4), s0) + 0.2, { seconds: 2.2 })] }),
  ], { preset: 'orbit', size: 'full', amount: 0.3, height: -0.2, include: [[2.7, 1.55, -1.7]] }, evening); }

// ======================= INSTRUMENTAL: to the kitchen (68.9 → 91.5) =======================
{ const s0 = 70.5; // they walk out together, in profile (never their backs to us)
  shot('Instrumental · off to the kitchen (walk past the bed)', 13, 13, s0, 77.5, [ROOM('bedroom'), FAN(-10), NIGHT], [
    ...bedProps(),
    mommy([1.6, 0, -1.0], { motion: { type: 'path', to: [-3.0, 0, -1.0], start: 0.3 } }),
    leo([2.3, 0, -0.4], { motion: { type: 'path', to: [-2.3, 0, -0.4], start: 0 }, actions: [A('skip', 0.2, { seconds: 0.7, repeats: 8 })] }),
  ], { preset: 'follow', size: 'full', target: 3, yaw: 0, height: -0.3 }, evening); }
{ const s0 = 77.5; // the bright kitchen: they come in through the door
  shot('Instrumental · into the sunny kitchen (establishing)', 13, 13, s0, 85.0, [ROOM('kitchen'), FRIDGE(), CUP()], [
    ...kitchenProps(),
    mommy([-3.5, 0, -1.0], { motion: { type: 'path', to: [1.3, 0, -1.5], start: 0.4 } }),
    leo([-3.9, 0, -0.4], { motion: { type: 'path', to: [0.6, 0, -0.6], start: 0.9 } }),
  ], { preset: 'crane', size: 'wide', transition: 'dip-white', dof: 'off', include: [[3.8, 1.8, -1.6]] }, day); }
{ const s0 = 85.0; // Leo looks up at the big fridge, happy hops on the beat; Mommy steps up beside it
  const b0 = Math.ceil((s0 + 0.6 - 0.455) / BEAT) * BEAT + 0.455;
  shot('Instrumental · Leo looks up at the big fridge', 13, 13, s0, st(14), [ROOM('kitchen'), FRIDGE(), CUP()], [
    mommy([1.3, 0, -1.5], { motion: { type: 'path', to: [2.6, 0, -2.3], start: 0.2 }, turn_to: 1 }),
    leo([1.4, 0, -0.5], { rot: [0, yawTo([1.4, 0, -0.5], FRIDGE_C), 0], actions: [A('lookUp', 0.3, { seconds: 2.0 }), A('hop', rel(b0, s0) + 2 * BEAT, { height: 0.06, seconds: BEAT, repeats: 3 })] }),
  ], { preset: 'tilt-up', size: 'full', yaw: -0.55, height: -1.0, include: [[3.8, 1.85, -1.6], [3.8, 0, -1.15]] }, day); }

// ======================= KITCHEN =======================
// ---- Learning 5: FRIDGE ----
const M_R = [2.6, 0, -2.35], K_R = [2.1, 0, -0.95];
const DOOR = (at, close) => ({ at, dur: 0.9, ...(close != null ? { close } : {}) });
{ const s0 = st(14);
  const op = rel(wt(14, 3), s0) - 0.5; // the door opens as she says "fridge"
  shot('This is a fridge, nice and cold! (the door opens on a cool light)', 14, 14, s0, st(15), [ROOM('kitchen'), FRIDGE(DOOR(op)), CUP()], [
    mommy(M_R, { rot: [0, 1.25, 0], actions: [A('greet', op - 0.4, { seconds: 1.3 }), A('present', op + 1.0, { hand: 'left', seconds: 2.6 })] }),
    leo(K_R, { rot: [0, yawTo(K_R, FRIDGE_C), 0] }),
  ], { preset: 'group', size: 'full', yaw: -0.55, height: -0.3, include: [[3.8, 1.85, -1.95], [3.8, 0, -1.25], [2.85, 1.2, -2.0]] }, day); }
{ const s0 = st(15);
  const pts = [2, 3, 4].map((n) => wt(15, n));
  shot('Oh, a fridge! Fridge, fridge! (Leo points into the cold)', 15, 15, s0, st(16), [ROOM('kitchen'), FRIDGE(DOOR(-10)), CUP()], [
    leo(K_R, { rot: [0, yawTo(K_R, FRIDGE_C), 0], actions: [A('hop', rel(wt(15, 0), s0) - 0.12, { height: 0.07, seconds: 0.5 }), A('point', rel(pts[0], s0) - 0.2, { points: 3, height: 'level', hand: 'right', seconds: Math.max(1.4, pts[2] - pts[0] + 0.7) })] }),
  ], { preset: 'group', size: 'full', yaw: -0.8, height: -0.5, include: [[3.8, 1.85, -1.95], [3.8, 0, -1.25], [2.85, 1.2, -2.0]] }, day); }
{ const s0 = st(16); // "Cold, cold, cold inside!" — a happy brrr shiver on the three "cold"s; Mommy laughs and closes the door at the end
  const close = rel(st(17), s0) - 1.0;
  shot('Cold, cold, cold inside! (brrr!)', 16, 16, s0, st(17), [ROOM('kitchen'), FRIDGE(DOOR(-10, close)), CUP()], [
    mommy(M_R, { rot: [0, 0.3, 0], look_at: 1, actions: [A('nod', rel(wt(16, 2), s0), { nods: 2, amount: 10, seconds: 1.2 }), A('shiver', rel(wt(16, 0), s0) + 0.3, { seconds: 1.6, shakes: 6 })] }),
    leo(K_R, { rot: [0, 0.35, 0], actions: [A('shiver', rel(wt(16, 0), s0) - 0.15, { seconds: Math.max(2.4, wt(16, 3) - wt(16, 0) + 0.6), shakes: 8 }), A('cheer', rel(wt(16, 3), s0) + 0.7, { height: 0.04, seconds: 1.1, repeats: 1 })] }),
  ], { preset: 'dolly-in', size: 'full', yaw: -0.4, height: -0.3, include: [[3.8, 1.85, -1.95]] }, day); }

// ---- Learning 6: CUP ----
const M_C = [1.05, 0, -1.6], K_C = [1.85, 0, -1.25];
{ const s0 = st(17); // Mommy kneels with the cup and holds it out; on "take a sip" Leo takes it
  const give = rel(wt(17, 4), s0);
  shot('This is a cup, take a sip! (Mommy offers the cup)', 17, 17, s0, st(18), [ROOM('kitchen'), FRIDGE(), CUP([{ actor: 0, hand: 'right', from: 0, to: give }, { actor: 1, hand: 'right', from: give, to: 99 }])], [
    mommy(M_C, { rot: [0, yawTo(M_C, K_C), 0], look_at: 1, actions: [A('kneel', 0, { down: 1.0, seconds: 30, hold: true }), A('holdCup', 0.2, { base: 'kneel', hand: 'right', lift: 'yes', seconds: give - 0.2 })] }),
    leo(K_C, { rot: [0, yawTo(K_C, M_C), 0], look_at: 0, actions: [A('holdCup', give, { hand: 'right', seconds: 30, hold: true })] }),
  ], { preset: 'group', size: 'full', yaw: 0.0, height: -0.6 }, day); }
{ const s0 = st(18); // "Oh, a cup! Cup, cup!" — he lifts it to show us on every "cup"
  const c = [2, 3, 4].map((n) => wt(18, n));
  shot('Oh, a cup! Cup, cup! (Leo shows the cup)', 18, 18, s0, st(19), [ROOM('kitchen'), FRIDGE(), CUP([{ actor: 0, hand: 'right', from: 0, to: 99 }])], [
    leo([1.6, 0, -1.0], { rot: [0, -0.2, 0], actions: [A('holdCup', 0, { hand: 'right', seconds: 30, hold: true }), ...c.map((t, k) => A('holdCup', rel(t, s0) - 0.25, { hand: 'right', lift: 'yes', seconds: Math.max(0.7, (c[k + 1] ?? t + 0.9) - t) }))] }),
  ], { preset: 'group', size: 'medium', yaw: 0.15, height: -0.3, target: 0 }, day); }
{ const s0 = st(19); // "Sip, sip, sip, sip, sip!" — one sip on each "sip"; Mommy claps along
  const sips = [0, 1, 2, 3, 4].map((n) => wt(19, n));
  shot('Sip, sip, sip, sip, sip! (a sip on every "sip")', 19, 19, s0, st(20), [ROOM('kitchen'), FRIDGE(), CUP([{ actor: 1, hand: 'right', from: 0, to: 99 }])], [
    mommy([0.75, 0, -1.7], { rot: [0, 0.6, 0], look_at: 1, actions: [A('clap', rel(sips[0], s0), { claps: 5, seconds: sips[4] - sips[0] + 0.5 })] }),
    leo([1.6, 0, -1.0], { rot: [0, -0.35, 0], actions: [A('holdCup', 0, { hand: 'right', seconds: 30, hold: true }), ...sips.map((t, k) => A('sip', rel(t, s0) - 0.3, { hand: 'right', sips: 1, seconds: Math.max(0.55, Math.min(0.85, (sips[k + 1] ?? t + 0.85) - t)) })), A('cheer', rel(en(19), s0) + 0.2, { height: 0.05, seconds: 1.1 })] }),
  ], { preset: 'dolly-in', size: 'full', yaw: -0.1, height: -0.3 }, day); }

// ======================= ENDING CHORUS =======================
{ const s0 = st(20); // "Mommy, Mommy, now I know!" — he runs into a hug (Mommy kneels to meet him)
  shot('Mommy, Mommy, now I know! (a big hug)', 20, 20, s0, st(21), [ROOM('kitchen'), FRIDGE(), CUP()], [
    mommy([1.2, 0, -1.6], { rot: [0, 0.9, 0], actions: [A('kneel', 0, { down: 0.9, seconds: 30, hold: true }), A('hug', rel(wt(20, 3), s0) - 0.3, { base: 'kneel', seconds: 2.6 })] }),
    leo([2.6, 0, -0.6], { motion: { type: 'path', to: [1.75, 0, -1.25], start: 0.2, end: 1.6 }, turn_to: 0, actions: [A('hug', rel(wt(20, 3), s0) - 0.2, { seconds: 2.4 })] }),
  ], { preset: 'group', size: 'full', yaw: 0.2, height: -0.5 }, day); }
// the recap: every object as he names it (one shot per pair, so cuts stay ~1.5 s or longer)
{ const s0 = st(21), cut = wt(21, 2) - 0.15;
  shot('Recap · Sofa, TV… (living room)', 21, 21, s0, cut, [ROOM('living'), TV(-10)], [
    ...livingProps(),
    leo([1.0, 0, -1.2], { rot: [0, -0.6, 0], actions: [A('point', rel(wt(21, 0), s0) - 0.15, { points: 1, height: 'low', hand: 'right', seconds: 0.8 }), A('point', rel(wt(21, 1), s0) - 0.1, { points: 1, height: 'level', hand: 'left', seconds: 0.8 })] }),
  ], { preset: 'wide', size: 'wide', yaw: 0.0, height: 0.2, include: [[-1.45, 0.9, -3.7], [3.85, 1.35, -1.95], [3.85, 0, -0.45]], transition: 'cut' }, day);
  shot('Recap · …bed and fan (bedroom)', 21, 21, cut, st(22), [ROOM('bedroom'), FAN(-10), NIGHT], [
    ...bedProps(),
    leo([0.5, 0, -1.4], { rot: [0, -0.3, 0], actions: [A('point', rel(wt(21, 2), cut) - 0.1, { points: 1, height: 'low', hand: 'right', seconds: 0.8 }), A('point', rel(wt(21, 4), cut) - 0.1, { points: 1, height: 'high', hand: 'left', seconds: 0.9 })] }),
  ], { preset: 'wide', size: 'wide', yaw: 0.0, height: 0.2, include: [[-2.1, 0.9, -3.75], [2.7, 1.55, -1.7]], transition: 'cut' }, evening); }
{ const s0 = st(22); // "Fridge and cup — yes, I can!" — in the kitchen with his cup; a proud cheer on "yes, I can"
  shot('Recap · Fridge and cup — yes, I can! (kitchen, a proud cheer)', 22, 22, s0, st(23), [ROOM('kitchen'), FRIDGE(), CUP([{ actor: 0, hand: 'right', from: 0, to: 99 }])], [
    leo([2.0, 0, -1.0], { rot: [0, 0.2, 0], actions: [A('holdCup', 0, { hand: 'right', seconds: 30, hold: true }), A('holdCup', rel(wt(22, 2), s0) - 0.2, { hand: 'right', lift: 'yes', seconds: 1.0 }), A('jump', rel(wt(22, 3), s0) - 0.2, { height: 0.12, seconds: 1.1 })] }),
  ], { preset: 'group', size: 'full', yaw: -0.5, height: -0.5, include: [[3.8, 1.85, -1.95], [3.8, 0, -1.25]], transition: 'cut' }, day); }
{ const s0 = st(23); // "Learn and play, every day" — home in the golden living room, dancing together on the beat
  shot('Learn and play, every day (dance together, golden light)', 23, 23, s0, st(24), [ROOM('living'), TV(-10)], [
    ...livingProps(),
    mommy([0.55, 0, -1.35], { rot: [0, -0.25, 0], look_at: 3, actions: [A('sway', 0.1, { beats: 4, seconds: 4 * BEAT, arms: 'low' }), A('dance', 0.1 + 4 * BEAT, { seconds: 4 * BEAT })] }),
    leo([-0.35, 0, -0.85], { rot: [0, 0.2, 0], look_at: 2, actions: [A('sway', 0.1, { beats: 4, seconds: 4 * BEAT, arms: 'up' }), A('dance', 0.1 + 4 * BEAT, { seconds: 4 * BEAT })] }),
  ], { preset: 'orbit', size: 'full', amount: 0.25, height: -0.3, transition: 'dissolve' }, evening); }
{ const s0 = st(24); // "Hip, hip, hip, hooray!" — a hop on each "hip", a big cheer on "hooray"
  const hips = [0, 1, 2].map((n) => wt(24, n));
  shot('Hip, hip, hip, hooray! (hops, then the big cheer)', 24, 24, s0, 143.6, [ROOM('living'), TV(-10)], [
    ...livingProps(false),
    mommy([0.55, 0, -1.35], { rot: [0, -0.25, 0], actions: [...hips.map((t) => A('hop', rel(t, s0) - 0.15, { height: 0.05, seconds: 0.5 })), A('cheer', rel(wt(24, 3), s0) - 0.2, { height: 0.08, seconds: 1.3, repeats: 2 })] }),
    leo([-0.35, 0, -0.85], { rot: [0, 0.2, 0], actions: [...hips.map((t) => A('hop', rel(t, s0) - 0.15, { height: 0.08, seconds: 0.5 })), A('jump', rel(wt(24, 3), s0) - 0.3, { height: 0.22, seconds: 1.2 }), A('cheer', rel(wt(24, 3), s0) + 1.0, { height: 0.06, seconds: 1.2 })] }),
  ], { preset: 'tilt-up', size: 'full', height: -1.0, yaw: 0.1 }, evening); }

// ======================= OUTRO (143.6 → 164.6) =======================
{ const s0 = 143.6; // cuddled up on the sofa, they wave goodbye to the viewer
  shot('Outro · cosy on the sofa, waving goodbye', 24, 24, s0, 153.5, [ROOM('living'), TV(-10), SEATS_SOFA], [
    ...livingProps(),
    mommy([SOFA[0] - 0.42, 0, SOFA[2]], { ride: { equip: 2, seat: 'a', lift: 0.02 }, actions: [hold('sitRelax', 30), A('wave', 3.0, { base: 'sit', hand: 'right', waves: 3, seconds: 2.6 })] }),
    leo([SOFA[0] + 0.4, 0, SOFA[2]], { ride: { equip: 2, seat: 'b', lift: 0.02 }, actions: [hold('sitRelax', 30, { short: 'yes' }), A('wave', 2.6, { base: 'sitShort', hand: 'left', waves: 4, seconds: 2.8 }), A('wave', 6.4, { base: 'sitShort', hand: 'left', waves: 3, seconds: 2.4 })] }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.05, height: -0.2 }, evening); }
{ const s0 = 153.5; // the whole warm living room: the camera rises slowly; the end card
  shot('Outro · the warm living room (end card)', 24, 24, s0, 164.64, [ROOM('living'), TV(-10), SEATS_SOFA], [
    ...livingProps(),
    mommy([SOFA[0] - 0.42, 0, SOFA[2]], { ride: { equip: 2, seat: 'a', lift: 0.02 }, look_at: 3, actions: [hold('sitRelax', 30)] }),
    leo([SOFA[0] + 0.4, 0, SOFA[2]], { ride: { equip: 2, seat: 'b', lift: 0.02 }, look_at: 2, actions: [hold('sitRelax', 30, { short: 'yes' })] }),
  ], { preset: 'crane', size: 'wide', height: 0.4, transition: 'dissolve', dof: 'off', include: [[3.85, 1.35, -1.95]] }, evening); }

// ---------- write the shots (replace all) ----------
if (process.argv[2] === '--dry') { console.log(JSON.stringify(shots.map((s) => [s.title, s.start_override, s.end_override]), null, 0)); process.exit(0); }
const scene = await call('GET', `/api/episodes/${EP}/scene`);
fs.writeFileSync(path.join(DIR, 'backup-scene.json'), JSON.stringify(scene.shots || [], null, 1));
for (const s of scene.shots || []) await call('DELETE', `/api/scene-shots/${s.id}`);
for (const s of shots) { const c = await call('POST', `/api/episodes/${EP}/scene-shots`, { title: s.title }); await call('PUT', `/api/scene-shots/${c.id}`, s); }
console.log(`${shots.length} shots written`);
