// Project 06 — "Mira and Mango: Playground Party!" — the full direction (38 shots), cinematic and playful.
// Same song and lyric timing as Project 05. Three places, each with a fixed layout (continuity between shots):
//   Rainbow Playground (day, and the finale at sunset): seesaw, swing set, slide, merry-go-round
//   Lollipop Candy Garden (day): seesaw, merry-go-round, ice-cream cart, two giant pinwheels, kite, pink balloons
//   Mushroom Fairy Glade (sunset → dusk): swing set, seesaw, beach ball, hot-air balloon in the sky
// Lessons applied (docs/LEARNINGS.md): what the lyric says is shown on that line (balloons float on "Up float balloons",
// the kite flies on "Red kite flying high"); gestures in full/medium shots; no two neighbouring shots framed the same;
// camera variety (crane, low hero angles, side angles, orbits, push-ins, close-ups while singing); walks share one speed
// curve; riders sit on real moving seats.
import { call, cards, replaceShots, CARD, EP } from './shotlib.mjs';
await cards();
const scene = await call('GET', `/api/episodes/${EP}/scene`);
const L = scene.timing.lines; const st = (i) => L[i].start, en = (i) => L[i].end;

// ---------- places (equipment layouts never move between shots of the same place) ----------
const PG = (extra = {}) => ({ card_id: CARD.playground, scale: 1, equipment: [
  { type: 'seesaw', pos: [-0.5, 0, 0.9], rot_y: 0, period: 2.4, amplitude: 15 },
  { type: 'swing', pos: [-3.0, 0, -3.2], rot_y: 0.35 },
  { type: 'slide', pos: [3.8, 0, -3.2], rot_y: -0.05 },
  { type: 'merry-go-round', pos: [-3.9, 0, 0.6], speed: 0.45 },
  ...(extra.more || [])], ...(extra.seesaw ? { equipment: undefined } : {}) });
const pgEq = (over = {}) => { const s = PG({ more: over.more }); Object.entries(over).forEach(([k, v]) => { if (k !== 'more') Object.assign(s.equipment[Number(k)], v); }); return s; };
const CG = (over = {}) => { const s = { card_id: CARD.candy, scale: 1, equipment: [
  { type: 'seesaw', pos: [-0.8, 0, -0.4], rot_y: 0.15, period: 2.3, amplitude: 15 },
  { type: 'merry-go-round', pos: [3.0, 0, -1.3], speed: 0.5 },
  ...(over.more || [])] }; Object.entries(over).forEach(([k, v]) => { if (k !== 'more') Object.assign(s.equipment[Number(k)], v); }); return s; };
const GL = (over = {}) => { const s = { card_id: CARD.glade, scale: 1.35, equipment: [
  { type: 'swing', pos: [-1.6, 0, -1.6], rot_y: 0.2, period: 2.8, amplitude: 26 },
  { type: 'seesaw', pos: [2.0, 0, 0.6], rot_y: -0.3, period: 3.4, amplitude: 10 },
  ...(over.more || [])] }; Object.entries(over).forEach(([k, v]) => { if (k !== 'more') Object.assign(s.equipment[Number(k)], v); }); return s; };

// ---------- actors ----------
const MIRA = 0.75, MANGO = 0.38;
const mira = (pos, more = {}) => ({ card_id: CARD.mira, pos, scale: MIRA, ...more });
const mango = (pos, more = {}) => ({ card_id: CARD.mango, pos, scale: MANGO, look_at: 0, ...more });
const prop = (card, pos, more = {}) => ({ card_id: card, pos, scale: 1, ...more });
const ride = (equip, seat, more = {}) => ({ ride: { equip, seat, ...more } });
const hold = (move, seconds, extra = {}) => ({ move, at: 0, seconds, hold: true, ...extra });
// seat positions (for framing; the engine places riders exactly)
const PGP = { seesawA: [-1.8, 0, 0.9], seesawB: [0.8, 0, 0.9], swingA: [-3.58, 0, -2.99], swingB: [-2.42, 0, -3.41], mgr: [-3.9, 0, 0.6], slideTop: [3.8, 0, -3.0], slideEnd: [3.64, 0, 0.05] };
const CGP = { seesawA: [-2.05, 0, -0.2], seesawB: [0.45, 0, -0.6], mgr: [3.0, 0, -1.3] };
const GLP = { swingA: [-2.2, 0, -1.48], swingB: [-1.0, 0, -1.72], seesawA: [0.76, 0, 0.98], seesawB: [3.24, 0, 0.22] };

const day = { preset: 'day' }, morning = { preset: 'morning' }, sunset = { preset: 'sunset' }, night = { preset: 'night' };
const shot = (title, lf, lt, setting, actors, camera, lighting = day, so = null, eo = null) => ({ title, line_from: lf, line_to: lt, setting, actors, camera, lighting, start_override: so, end_override: eo });

const shots = [
  // ===== Intro: the playground =====
  shot('Intro · crane down into the Rainbow Playground', 0, 0, PG(), [
    mira([-5.2, 0, 3.4], { motion: { type: 'path', to: [-2.4, 0, 2.6], start: 4.5 }, actions: [{ move: 'wave', at: 9.2 }] }),
    mango([-6.0, 0, 3.8], { motion: { type: 'path', to: [-1.6, 0, 3.1], start: 4.8 }, actions: [{ move: 'excitedHop', at: 10.4 }] }),
  ], { preset: 'crane', size: 'wide', transition: 'cut' }, morning, 0, st(0)),
  // ===== Verse 1 =====
  shot('Walking slowly past the flower beds', 0, 1, PG(), [
    mira([-2.4, 0, 2.6], { motion: { type: 'path', to: [-0.4, 0, 2.8] }, actions: [{ move: 'look', at: 3.2 }] }),
    mango([-1.6, 0, 3.1], { motion: { type: 'path', to: [0.4, 0, 3.3] }, actions: [{ move: 'sniff', at: 2.6 }] }),
  ], { preset: 'follow', size: 'full', target: 0, yaw: 0.55, height: -0.6 }, morning, st(0), null),
  shot('Zooming round on the merry-go-round', 2, 3, PG({}), [
    mira(PGP.mgr, ride(3, 'a', { lift: 0.05 }), ), mango(PGP.mgr, ride(3, 'b', { lift: 0.02 })),
  ].map((a, i) => ({ ...a, actions: [i === 0 ? hold('merryRide', 4, { repeats: 2 }) : hold('dogSit', 6)] })),
  { preset: 'orbit', size: 'full', amount: 0.6, height: 0.3, target: 0, transition: 'cut' }, day),
  // ===== Chorus 1 =====
  shot('Seesaw: slow and fast, up and down (low hero angle)', 4, 5, PG(), [
    mira(PGP.seesawA, { ...ride(0, 'a'), actions: [hold('seesawRide', 2.4, { repeats: 3 })] }),
    mango(PGP.seesawB, { ...ride(0, 'b', { lift: 0.02 }), actions: [hold('dogSit', 8)] }),
  ], { preset: 'group', size: 'full', height: -1.4, yaw: 0.15 }, day),
  shot('Close-up: yes and no, hello, goodbye', 6, 6, PG(), [
    mira([-0.6, 0, 2.4], { actions: [{ move: 'nod', at: 0.1, seconds: 1.0 }, { move: 'shake', at: 1.2, seconds: 1.0 }, { move: 'wave', at: 2.4, seconds: 2.0 }] }),
    mango([0.5, 0, 2.6]),
  ], { preset: 'closeup', size: 'closeup', target: 0, yaw: 0.25 }, day, null, st(7)),
  shot('Come on, copy! Mango copies Mira', 7, 7, PG(), [
    mira([-0.6, 0, 2.4], { actions: [{ move: 'clap', at: 0.2 }, { move: 'cheer', at: 2.6 }] }),
    mango([0.5, 0, 2.6], { actions: [{ move: 'nod', at: 0.6 }, { move: 'pawRaise', at: 2.2 }, { move: 'excitedHop', at: 3.6 }] }),
  ], { preset: 'group', size: 'medium', yaw: -0.4 }, day, st(7), null),
  // ===== Verse 2 =====
  shot('Mira jumps up, up, up! (low angle, beach ball bouncing)', 8, 8, PG(), [
    mira([-0.4, 0, 2.2], { actions: [{ move: 'jump', at: 0.1, repeats: 3, seconds: 3.3, height: 0.35 }] }),
    mango([0.9, 0, 2.6], { actions: [{ move: 'excitedHop', at: 0.5 }] }),
    prop(CARD.ball, [0.4, 0, 1.6], { scale: 0.45, motion: { type: 'bounce', to: [0.4, 0, 1.6], hops: 4, height: 0.7 } }),
  ], { preset: 'tilt-up', size: 'full', height: -1.6, target: 0 }, day, null, st(9)),
  shot('Close-up: Mango wags, a happy pup', 9, 9, PG(), [
    mira([-0.4, 0, 2.2]), mango([0.9, 0, 2.6], { actions: [{ move: 'tailWag', at: 0.1, seconds: 2.4 }, { move: 'excitedHop', at: 2.6 }] }),
  ], { preset: 'closeup', size: 'closeup', target: 1, yaw: -0.3 }, day, st(9), null),
  shot('Bow down to the ground (Mango does a play-bow)', 10, 10, PG(), [
    mira([-0.6, 0, 2.3], { actions: [{ move: 'bow', at: 0.2, seconds: 2.0 }] }),
    mango([0.6, 0, 2.6], { actions: [{ move: 'playBow', at: 0.4 }] }),
  ], { preset: 'group', size: 'full', yaw: 0.7, height: 0.2 }, day, null, st(11)),
  shot('Up float balloons, pink and round!', 11, 11, pgEq({ more: [{ type: 'balloons', pos: [0.1, 0, 1.9], lift: 1.4, rise: 3.2 }] }), [
    mira([-0.6, 0, 2.3], { actions: [{ move: 'lookUp', at: 0.3, seconds: 2.4 }, { move: 'cheer', at: 2.8 }] }),
    mango([0.8, 0, 2.7], { actions: [{ move: 'headTilt', at: 0.6 }] }),
  ], { preset: 'tilt-up', size: 'full', height: -0.8, yaw: -0.2 }, day, st(11), null),
  // ===== Chorus 2: swings =====
  shot('Swinging high and low (side-on)', 12, 13, PG(), [
    mira(PGP.swingA, { ...ride(1, 'a'), actions: [hold('swingRide', 2.6, { repeats: 3 })] }),
    mango(PGP.swingB, { ...ride(1, 'b', { lift: 0.02 }), actions: [hold('dogSit', 8)] }),
  ], { preset: 'group', size: 'full', yaw: 1.05, height: 0.2, transition: 'dissolve' }, day),
  shot('Wheee! Down the slide', 14, 14, PG(), [
    mira(PGP.slideTop, { ...ride(2, 'top', { at: 1.0, dur: 1.5 }), actions: [hold('slideRide', 8)] }),
    mango([4.7, 0, 0.7], { actions: [{ move: 'excitedHop', at: 2.6 }] }),
  ], { preset: 'group', size: 'full', yaw: -0.45, height: 0.5 }, day, null, st(15)),
  shot('Come on, copy, give it a try! (at the bottom of the slide)', 15, 15, PG(), [
    mira([3.0, 0, 0.9], { actions: [{ move: 'clap', at: 0.2 }, { move: 'cheer', at: 2.4 }, { move: 'wave', at: 4.6 }] }),
    mango([3.9, 0, 1.3], { actions: [{ move: 'pawRaise', at: 0.6 }, { move: 'spin', at: 2.8 }] }),
  ], { preset: 'dolly-in', size: 'full', yaw: -0.35, target: 0 }, day, st(15), null),
  // ===== Verse 2 again: ball play from a reverse angle =====
  shot('Mira jumps! (reverse angle, ball game)', 16, 16, PG(), [
    mira([0.6, 0, -0.6], { rot: [0, 2.25, 0], actions: [{ move: 'hop', at: 0.1, repeats: 4 }, { move: 'jump', at: 2.2 }] }),
    mango([1.8, 0, -1.0], { rot: [0, 2.15, 0], look_at: undefined, actions: [{ move: 'excitedHop', at: 0.4 }] }),
    prop(CARD.ball, [1.2, 0, -0.2], { scale: 0.45, motion: { type: 'bounce', to: [1.2, 0, -0.2], hops: 5, height: 0.5 } }),
  ], { preset: 'group', size: 'full', yaw: 2.25, height: -0.4 }, day, null, st(17)),
  shot('Mango chases the beach ball', 17, 17, PG(), [
    mira([0.6, 0, -0.6], { rot: [0, 2.25, 0], actions: [{ move: 'clap', at: 0.4 }] }),
    mango([1.8, 0, -1.0], { motion: { type: 'circle', center: [1.2, 0, -0.4], turns: 1 }, actions: [{ move: 'tailWag', at: 0.2 }] }),
    prop(CARD.ball, [1.2, 0, -0.4], { scale: 0.45, motion: { type: 'bounce', to: [1.2, 0, -0.4], hops: 3, height: 0.35 } }),
  ], { preset: 'group', size: 'full', yaw: 2.3, height: 0.4 }, day, st(17), null),
  // ===== Candy Garden =====
  shot('Candy Garden · crane down: bow to the lollipops', 18, 18, CG(), [
    mira([-0.4, 0, 2.2], { actions: [{ move: 'bow', at: 1.6, seconds: 1.8 }] }),
    mango([0.6, 0, 2.5], { actions: [{ move: 'playBow', at: 1.9 }] }),
    prop(CARD.cart, [2.8, 0, 1.2], { scale: 1.3, rot: [0, -0.6, 0] }),
    prop(CARD.pinwheel, [-3.2, 0, -2.6], { scale: 1.6, motion: { type: 'sway', amount: 0.05, speed: 0.6 } }),
    prop(CARD.pinwheel, [3.6, 0, -3.2], { scale: 1.4, motion: { type: 'sway', amount: 0.05, speed: 0.7 } }),
  ], { preset: 'crane', size: 'full', transition: 'iris' }, day, null, st(19)),
  shot('Up float the pink balloons between the lollipop trees', 19, 19, CG({ more: [{ type: 'balloons', pos: [0.1, 0, 1.6], lift: 1.5, rise: 3.4 }] }), [
    mira([-0.4, 0, 2.2], { actions: [{ move: 'lookUp', at: 0.4, seconds: 3 }, { move: 'wave', at: 3.8 }] }),
    mango([0.6, 0, 2.5], { actions: [{ move: 'excitedHop', at: 1.0 }] }),
    prop(CARD.cart, [2.8, 0, 1.2], { scale: 1.3, rot: [0, -0.6, 0] }),
  ], { preset: 'tilt-up', size: 'full', height: -1.0, yaw: 0.3 }, day, st(19), null),
  shot('Candy seesaw: up and down (orbit, low)', 20, 21, CG(), [
    mira(CGP.seesawA, { ...ride(0, 'a'), actions: [hold('seesawRide', 2.3, { repeats: 3 })] }),
    mango(CGP.seesawB, { ...ride(0, 'b', { lift: 0.02 }), actions: [hold('dogSit', 8)] }),
    prop(CARD.pinwheel, [-3.2, 0, -2.6], { scale: 1.6, motion: { type: 'sway', amount: 0.05, speed: 0.6 } }),
  ], { preset: 'orbit', size: 'full', amount: 0.5, height: -0.9 }, day),
  shot('Hello to the ice-cream cart!', 22, 22, CG(), [
    mira([1.6, 0, 1.8], { rot: [0, 0.5, 0], actions: [{ move: 'wave', at: 0.3, seconds: 2.2 }, { move: 'cheer', at: 2.8 }] }),
    mango([0.8, 0, 2.3], { actions: [{ move: 'pawRaise', at: 1.0 }] }),
    prop(CARD.cart, [2.8, 0, 1.2], { scale: 1.3, rot: [0, -0.6, 0] }),
  ], { preset: 'group', size: 'medium', yaw: -0.45 }, day, null, st(23)),
  shot('Come on, copy! Dance by the ice-cream cart', 23, 23, CG(), [
    mira([1.4, 0, 1.9], { actions: [{ move: 'dance', at: 0.2, seconds: 4.4 }] }),
    mango([0.5, 0, 2.3], { actions: [{ move: 'spin', at: 0.6 }, { move: 'excitedHop', at: 2.8 }] }),
    prop(CARD.cart, [2.8, 0, 1.2], { scale: 1.3, rot: [0, -0.6, 0] }),
  ], { preset: 'dolly-in', size: 'full', yaw: -0.2 }, day, st(23), null),
  // ===== Verse 3: the kite =====
  shot('Red kite flying high, so high (low angle, tilt up)', 24, 25, CG({ more: [{ type: 'kite', pos: [0.6, 2.8, -0.8], anchor: [-1.0, -1.8, 3.0], size: 1.4 }] }), [
    mira([-0.4, 0, 2.2], { actions: [{ move: 'lookUp', at: 0.2, seconds: 4.6 }] }),
    mango([0.6, 0, 2.6], { actions: [{ move: 'headTilt', at: 1.2 }] }),
  ], { preset: 'tilt-up', size: 'wide', height: -0.8, yaw: 0.1 }, day),
  shot('Swooping low… Mango sniffs low with his nose', 26, 27, CG({ more: [{ type: 'kite', pos: [0.6, 2.8, -0.8], anchor: [-1.0, -1.8, 3.0], size: 1.4, swoop: { at: 0.3, dur: 2.8, drop: 1.7 } }] }), [
    mira([-0.4, 0, 2.2], { actions: [{ move: 'lookUp', at: 0.3, seconds: 2.6 }, { move: 'cheer', at: 3.2 }] }),
    mango([0.6, 0, 2.6], { actions: [{ move: 'sniff', at: 2.4, seconds: 2.2 }] }),
  ], { preset: 'group', size: 'wide', yaw: 0.35, height: 0.6 }, day),
  // ===== Chorus 4 =====
  shot('Merry-go-round in the candy garden: spin around!', 28, 29, CG(), [
    mira(CGP.mgr, { ...ride(1, 'a', { lift: 0.05 }), actions: [hold('merryRide', 4, { repeats: 2 })] }),
    mango(CGP.mgr, { ...ride(1, 'c', { lift: 0.02 }), actions: [hold('dogSit', 8)] }),
  ], { preset: 'orbit', size: 'full', amount: 0.7, height: 0.6, target: 0 }, day),
  shot('Pinwheel party: dance and spin', 30, 31, CG(), [
    mira([-1.2, 0, 1.4], { actions: [{ move: 'spin', at: 0.2 }, { move: 'dance', at: 1.6, seconds: 3.2 }] }),
    mango([-0.2, 0, 1.8], { actions: [{ move: 'excitedHop', at: 0.4 }, { move: 'spin', at: 2.4 }] }),
    prop(CARD.pinwheel, [-2.4, 0, 0.2], { scale: 1.8, motion: { type: 'sway', amount: 0.06, speed: 0.9 } }),
    prop(CARD.pinwheel, [0.9, 0, 0.4], { scale: 1.5, motion: { type: 'sway', amount: 0.06, speed: 1.1 } }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.2, height: -0.3 }, day),
  // ===== Verse 4 =====
  shot('Yes, yes, yes / No, no, no (two-shot)', 32, 33, CG(), [
    mira([-0.5, 0, 2.0], { actions: [{ move: 'nod', at: 0.2, seconds: 2.0 }, { move: 'shake', at: 2.5, seconds: 2.0 }] }),
    mango([0.5, 0, 2.3], { actions: [{ move: 'nod', at: 0.5, seconds: 1.8 }, { move: 'shake', at: 2.7, seconds: 1.8 }] }),
  ], { preset: 'group', size: 'medium', yaw: 0.2 }, day),
  // ===== Mushroom Glade at sunset =====
  shot('Glade at sunset · wave hello, wave goodbye (crane, hot-air balloon)', 34, 35, GL(), [
    mira([-0.4, 0, 2.0], { actions: [{ move: 'wave', at: 1.6, seconds: 2.2 }, { move: 'wave', at: 4.4, seconds: 2.2, hand: 'left' }] }),
    mango([0.6, 0, 2.3], { actions: [{ move: 'pawRaise', at: 2.2 }, { move: 'tailWag', at: 4.6 }] }),
    prop(CARD.balloon, [-3.5, 6.5, -6], { scale: 2.4, motion: { type: 'drift', dx: 3, bob: 0.3 } }),
  ], { preset: 'crane', size: 'full', transition: 'iris' }, sunset),
  shot('Sunset swings (side-on)', 36, 37, GL(), [
    mira(GLP.swingA, { ...ride(0, 'a'), actions: [hold('swingRide', 2.8, { repeats: 2 })] }),
    mango(GLP.swingB, { ...ride(0, 'b', { lift: 0.02 }), actions: [hold('dogSit', 8)] }),
  ], { preset: 'group', size: 'full', yaw: 0.45, height: 0.4 }, sunset),
  shot('Close-up in the golden light: hello, goodbye', 38, 39, GL(), [
    mira([-0.3, 0, 2.4], { actions: [{ move: 'wave', at: 0.4, seconds: 2.0 }, { move: 'nod', at: 3.2 }] }),
    mango([0.6, 0, 2.7]),
  ], { preset: 'closeup', size: 'closeup', target: 0, yaw: -0.3 }, sunset),
  shot('Instrumental · dance party under the mushrooms (orbit)', 39, 39, GL(), [
    mira([-0.6, 0, 1.6], { actions: [{ move: 'dance', at: 0.3, seconds: 3.6 }, { move: 'spin', at: 4.4 }, { move: 'cheer', at: 6.2 }] }),
    mango([0.6, 0, 1.9], { actions: [{ move: 'excitedHop', at: 0.8 }, { move: 'spin', at: 3.4 }, { move: 'playBow', at: 5.8 }] }),
    prop(CARD.ball, [0, 0, 2.6], { scale: 0.4, motion: { type: 'bounce', to: [0, 0, 2.6], hops: 8, height: 0.6 } }),
  ], { preset: 'orbit', size: 'full', amount: 0.8, height: 0.2 }, sunset, en(39), null),
  // ===== Slow choruses (dusk) =====
  shot('Slow chorus · gentle swing at dusk (push in)', 40, 41, GL({ 0: { period: 3.4, amplitude: 16 } }), [
    mira(GLP.swingA, { ...ride(0, 'a'), actions: [hold('swingRide', 3.4, { repeats: 3 })] }),
    mango(GLP.swingB, { ...ride(0, 'b', { lift: 0.02 }), actions: [hold('dogSit', 12)] }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.35, transition: 'dissolve' }, sunset),
  shot('Slow chorus · a soft seesaw goodbye', 42, 43, GL(), [
    mira(GLP.seesawA, { ...ride(1, 'a'), actions: [hold('seesawRide', 3.4, { repeats: 4 })] }),
    mango(GLP.seesawB, { ...ride(1, 'b', { lift: 0.02 }), actions: [hold('dogSit', 12)] }),
  ], { preset: 'dolly-in', size: 'full', height: -1.0, yaw: -0.25 }, sunset),
  shot('Instrumental · a walk through the glade', 43, 43, GL(), [
    mira([-3.0, 0, 2.6], { motion: { type: 'path', to: [0.6, 0, 1.8] }, actions: [{ move: 'look', at: 4.2 }] }),
    mango([-3.8, 0, 3.0], { motion: { type: 'path', to: [1.4, 0, 2.2] } }),
    prop(CARD.balloon, [-2.5, 7, -7], { scale: 2.4, motion: { type: 'drift', dx: 4, bob: 0.3 } }),
  ], { preset: 'pan', size: 'wide', amount: 1.2, height: 0.2 }, sunset, st(43) > 154 ? null : 154.0, 161.0),
  shot('Instrumental · ball game', 43, 43, GL(), [
    mira([0.4, 0, 1.8], { actions: [{ move: 'clap', at: 0.6 }, { move: 'jump', at: 3.2 }, { move: 'cheer', at: 5.0 }] }),
    mango([1.6, 0, 2.2], { actions: [{ move: 'excitedHop', at: 1.2 }, { move: 'spin', at: 3.6 }] }),
    prop(CARD.ball, [0.4, 0, 1.8], { scale: 0.4, motion: { type: 'bounce', to: [1.6, 0, 2.2], hops: 5, height: 0.9 } }),
  ], { preset: 'group', size: 'full', yaw: 0.45, height: -0.5 }, sunset, 161.0, null),
  // ===== Finale: back to the playground at sunset =====
  shot('Finale · merry-go-round, spin around! (low orbit)', 44, 45, pgEq({ 3: { speed: 0.6 } }), [
    mira(PGP.mgr, { ...ride(3, 'a', { lift: 0.05 }), actions: [hold('merryRide', 4, { repeats: 2 })] }),
    mango(PGP.mgr, { ...ride(3, 'b', { lift: 0.02 }), actions: [hold('dogSit', 9)] }),
  ], { preset: 'orbit', size: 'full', amount: 0.9, height: -0.6, target: 0, transition: 'iris' }, sunset),
  shot('Finale · wheee down the slide', 46, 46, PG(), [
    mira(PGP.slideTop, { ...ride(2, 'top', { at: 0.8, dur: 1.5 }), actions: [hold('slideRide', 8)] }),
    mango([4.7, 0, 0.7], { actions: [{ move: 'excitedHop', at: 2.3 }] }),
  ], { preset: 'group', size: 'full', yaw: -0.5, height: 0.6 }, sunset, null, st(47)),
  shot('Finale · seesaw hero shot', 47, 47, PG(), [
    mira(PGP.seesawA, { ...ride(0, 'a'), actions: [hold('seesawRide', 2.4, { repeats: 4 })] }),
    mango(PGP.seesawB, { ...ride(0, 'b', { lift: 0.02 }), actions: [hold('dogSit', 12)] }),
  ], { preset: 'group', size: 'full', height: -1.5, yaw: -0.2 }, sunset, st(47), en(47) + 0.3),
  shot('Outro · thank you for playing! (push in)', 47, 47, PG(), [
    mira([-0.4, 0, 2.4], { actions: [{ move: 'wave', at: 0.4, seconds: 2.4 }, { move: 'bow', at: 3.6 }, { move: 'cheer', at: 6.4 }, { move: 'wave', at: 9.0, hand: 'left' }] }),
    mango([0.6, 0, 2.7], { actions: [{ move: 'pawRaise', at: 1.0 }, { move: 'playBow', at: 3.9 }, { move: 'excitedHop', at: 6.6 }, { move: 'tailWag', at: 9.2 }] }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.25 }, sunset, en(47) + 0.3, 199.0),
  shot('End card · the playground at sunset, balloons float away', 47, 47, pgEq({ more: [{ type: 'balloons', pos: [0.2, 0, 2.0], lift: 2.0, rise: 7 }] }), [
    mira([-0.4, 0, 2.4], { actions: [{ move: 'wave', at: 0.6, seconds: 3.0 }, { move: 'lookUp', at: 4.2, seconds: 3 }] }),
    mango([0.6, 0, 2.7], { actions: [{ move: 'tailWag', at: 1.0, seconds: 3 }] }),
  ], { preset: 'wide', size: 'extreme-wide', height: 0.6, yaw: 0.1 }, sunset, 199.0, null),
];
const res = await replaceShots(shots);
console.log(`${res.length} shots written`);
