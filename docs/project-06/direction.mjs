// Project 06 — "Mira and Mango: Playground Party!" — Round 3 direction: made for young viewers to FOLLOW.
// Same song, lyric timing and characters. Rules (research summary in EXECUTION-LOG.md, round 3):
//  1. One clear action per shot, the one the lyric is singing about at that moment.
//  2. At most three things to follow: Mira, Mango and the ONE object they use. Only the equipment in use is in the
//     shot, centre stage on the open floor; no extra props "for decoration".
//  3. Calm, bright background: landscape detail "focus" (colour bands, no bunting, sky balloons, butterflies, birds or
//     houses), calm wind, and background blur so the characters are the sharpest, brightest thing on screen.
//  4. Big characters: medium and full shots at a child's eye level; close-ups while singing; wide only to show a place.
//  5. The same chorus action every time (seesaw = up and down, swing = high and low, merry-go-round = spin around,
//     nod / shake / wave = yes, no, hello, goodbye, "copy me" to the viewer), from new angles: children enjoy
//     knowing what comes next.
//  6. Two places only (the Rainbow Playground is home; the Lollipop Candy Garden for the kite), and golden sunset light
//     for "Wave goodbye to the setting sun" and the finale.
// Every shot is checked with tools/testing/clearance.mjs: nothing may go through anything.
// Round 5 (user screenshots): actions are timed to the WORDS (W below); the seesaw is at the top on "up" and the bottom
// on "down"; the named object is fully in frame (balloons, kite in FRONT of the children, string to the hand); "wave
// hello" in a medium shot; the ball only where it is played with, with real physics.
import { call, cards, replaceShots, CARD, EP } from './shotlib.mjs';
await cards();
const scene = await call('GET', `/api/episodes/${EP}/scene`);
const L = scene.timing.lines; const st = (i) => L[i].start, en = (i) => L[i].end;
// When word n of line i is sung (seconds, relative to `from` = the shot's start): syllables spread over the sung part
// of the line (the last note is held, so 88% of it).
const syl = (w) => Math.max(1, (w.toLowerCase().replace(/[^a-z]/g, '').match(/[aeiouy]+/g) || []).length);
const W = (i, n, from = st(i)) => { const ws = L[i].text.split(/\s+/).filter(Boolean); const c = ws.map(syl); const tot = c.reduce((a, b) => a + b, 0);
  const before = c.slice(0, n).reduce((a, b) => a + b, 0); return +Math.max(0, st(i) + (en(i) - st(i)) * 0.88 * (before / tot) - from).toFixed(2); };

// ---------- look: colourful but calm ----------
const CALM = { detail: 'focus', houses: 'none', dressing: 'light', trees: 'some', birds: 'none', wind: 'calm', clouds: 'few', river: 'none' };
await call('PUT', `/api/episodes/${EP}/look`, { ...CALM, sky: 'storybook' });
const day = { preset: 'day', look: CALM }, morning = { preset: 'morning', look: CALM }, sunset = { preset: 'sunset', look: CALM };

// ---------- places: the equipment in use sits centre stage ----------
const SEESAW = { type: 'seesaw', pos: [0, 0, 0.4], rot_y: 0, period: 2.4, amplitude: 14, no_handle: 'b', wide_seat: 'b' };
const SWING = { type: 'swing', pos: [0, 0, 0], rot_y: 0, period: 2.6, amplitude: 28 };
const MERRY = { type: 'merry-go-round', pos: [0, 0, 0.3], speed: 0.42 };
const SLIDE = { type: 'slide', pos: [0, 0, -1.4], rot_y: 0 };
const pg = (...equipment) => ({ card_id: CARD.playground, scale: 1, equipment });
const cg = (...equipment) => ({ card_id: CARD.candy, scale: 1, equipment });
const ALL = [ // the one establishing shot shows everything the children will play on
  { ...SEESAW, pos: [-0.5, 0, 0.9] }, { ...SWING, pos: [-3.0, 0, -3.2], rot_y: 0.35 }, { ...SLIDE, pos: [3.8, 0, -3.2], rot_y: -0.05 }, { ...MERRY, pos: [-3.9, 0, 0.6] },
];

// ---------- actors ----------
const MIRA = 0.75, MANGO = 0.38;
const mira = (pos, more = {}) => ({ card_id: CARD.mira, pos, scale: MIRA, ...more });
const mango = (pos, more = {}) => ({ card_id: CARD.mango, pos, scale: MANGO, look_at: 0, ...more });
const ball = (pos, more = {}) => ({ card_id: CARD.ball, pos, scale: 0.45, ...more });
const hold = (move, seconds, extra = {}) => ({ move, at: 0, seconds, hold: true, ...extra });
const A = (move, at, extra = {}) => ({ move, at, ...extra });
// riders (equipment index 0 in every ride shot)
// The seesaw cycle (plank + Mira's pose) is shifted so Mira is at the TOP on "up" and at the BOTTOM on "down".
const seesawOff = (i, P = 2.4) => { const tUp = W(i, 4); return +((((0.75 * P - tUp) % P) + P) % P).toFixed(3); };
const seesawAt = (i, P = 2.4, extra = {}) => (place) => place({ ...SEESAW, period: P, phase: seesawOff(i, P), ...extra });
const onSeesaw = (period = 2.4, off = 0) => [
  mira([-1.3, 0, 0.4], { ride: { equip: 0, seat: 'a' }, actions: [hold('seesawRide', period, { repeats: 10, offset: off })] }),
  mango([1.3, 0, 0.4], { ride: { equip: 0, seat: 'b', lift: 0.02 }, actions: [hold('dogSit', 30)] }),
];
const onSwing = (period = 2.6) => [
  mira([-0.62, 0, 0], { ride: { equip: 0, seat: 'a' }, actions: [hold('swingRide', period, { repeats: 8 })] }),
  mango([0.62, 0, 0], { ride: { equip: 0, seat: 'b', lift: 0.02 }, actions: [hold('dogSit', 30)] }),
];
const onMerry = () => [
  mira([0.8, 0, 0.3], { ride: { equip: 0, seat: 'a' }, actions: [hold('merryRide', 4, { repeats: 4 })] }),
  mango([-0.8, 0, 0.3], { ride: { equip: 0, seat: 'b', lift: 0.02, back: 0.3 }, actions: [hold('dogSit', 30)] }),
];
const slideRun = (climbAt = 0) => mira([0, 0, -1.4], { ride: { equip: 0, seat: 'top', climb: { at: climbAt, dur: 1.8 }, at: climbAt + 2.3, dur: 1.4, off_after: 0.4 },
  actions: [A('climb', climbAt, { seconds: 0.6, repeats: 3 }), A('slideRide', climbAt + 1.55, { seconds: 2.9 }), A('cheer', climbAt + 4.9)] });
// standing marks, centre stage (two-shots)
const M0 = [-0.42, 0, 1.3], D0 = [0.6, 0, 1.6]; // an arm's length apart: gestures never reach into each other
// "Yes and no, hello, goodbye": nod on "yes", shake on "no", wave from "hello" through "goodbye".
const yesNoMira = (i, hand) => [A('nod', W(i, 0), { seconds: Math.max(0.5, W(i, 2) - W(i, 0) - 0.05) }), A('shake', W(i, 2), { seconds: Math.max(0.5, W(i, 3) - W(i, 2) - 0.05) }), A('wave', W(i, 3), { seconds: Math.max(1.2, en(i) - st(i) - W(i, 3) + 0.2), ...(hand ? { hand } : {}) })];
const yesNoMango = (i) => [A('nod', W(i, 0), { seconds: Math.max(0.5, W(i, 2) - W(i, 0)) }), A('pawRaise', W(i, 3))];
// "Come on, copy, give it a try!": reach out on "come on", clap on "copy", cheer on "give it a try".
const copyMira = (i, after = []) => [A('greet', W(i, 0), { seconds: 1.2 }), A('clap', W(i, 2), { seconds: 1.1 }), A('cheer', W(i, 3)), ...after];

const shot = (title, lf, lt, setting, actors, camera, lighting = day, so = null, eo = null) => ({ title, line_from: lf, line_to: lt, setting, actors, camera, lighting, start_override: so, end_override: eo });

const shots = [
  // ===== Intro: one establishing shot of the whole playground =====
  shot('Intro · crane down into the Rainbow Playground', 0, 0, pg(...ALL), [
    mira([-3.6, 0, 2.8], { motion: { type: 'path', to: [-1.2, 0, 2.6], start: 4.0 }, actions: [A('wave', 9.0)] }),
    mango([-4.2, 0, 3.1], { motion: { type: 'path', to: [-0.4, 0, 2.9], start: 4.3 }, actions: [A('excitedHop', 10.0)] }),
  ], { preset: 'crane', size: 'wide', transition: 'cut', dof: 'off' }, morning, 0, st(0)),

  // ===== Verse 1 =====
  shot('Walking slowly… past the flowers (follow, child\'s eye level)', 0, 1, pg(), [
    mira([-2.2, 0, 1.6], { motion: { type: 'path', to: [0.6, 0, 1.4] }, actions: [A('look', 3.0)] }),
    mango([-1.5, 0, 0.75], { motion: { type: 'path', to: [1.4, 0, 0.65] }, actions: [A('sniff', 2.4)] }), // the far side: never between the camera and Mira
  ], { preset: 'follow', size: 'full', target: 0, yaw: 0.5, height: -0.3 }, morning, st(0), null),
  shot('Now we\'re running, fast, fast, fast! (pan)', 2, 2, pg(), [
    mira([-2.6, 0, 1.4], { motion: { type: 'path', to: [2.4, 0, 1.2] } }),
    mango([-2.0, 0, 0.7], { motion: { type: 'path', to: [2.9, 0, 0.5] }, look_at: undefined }), // just ahead: Mira chases him
  ], { preset: 'follow', size: 'full', target: 0, yaw: 0.8, height: -0.2 }, day),
  shot('Round the garden, zooming past! (merry-go-round, orbit)', 3, 3, pg(MERRY), onMerry(),
    { preset: 'orbit', size: 'full', amount: 0.55, height: 0.1, target: 0 }, day),

  // ===== Chorus 1 =====
  shot('Chorus 1 · seesaw: slow and fast, up and down (side-on)', 4, 4, seesawAt(4)(pg), onSeesaw(2.4, seesawOff(4)),
    { preset: 'group', size: 'full', yaw: 0, height: -0.3 }, day),
  shot('Chorus 1 · swing: high and low (three-quarter)', 5, 5, pg(SWING), onSwing(),
    { preset: 'group', size: 'full', yaw: 0.65, height: -0.1 }, day),
  shot('Chorus 1 · close-up: yes and no, hello, goodbye', 6, 6, pg(), [
    mira(M0, { actions: yesNoMira(6) }), mango(D0),
  ], { preset: 'group', size: 'medium', target: 0, yaw: 0.15 }, day),
  shot('Chorus 1 · come on, copy, give it a try! (to the viewer)', 7, 7, pg(), [
    mira(M0, { actions: copyMira(7, [A('dance', 4.0, { seconds: 3.2 })]) }),
    mango(D0, { actions: [A('pawRaise', W(7, 2)), A('excitedHop', W(7, 3)), A('spin', 4.6)] }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.1, height: -0.2 }, day, st(7), st(8)),

  // ===== Verse 2 =====
  shot('Mira jumps up, up, up, up! (low angle)', 8, 8, pg(), [
    mira(M0, { actions: [2, 3, 4, 5].map((n) => A('jump', Math.max(0, W(8, n) - 0.28), { seconds: 0.55, height: 0.3, crouch: 0.6 })) }), mango(D0, { actions: [A('excitedHop', W(8, 5))] }),
  ], { preset: 'tilt-up', size: 'full', height: -1.2, target: 0, yaw: -0.15 }, day),
  shot('Mango wags, a happy pup! (close-up)', 9, 9, pg(), [
    mira(M0), mango(D0, { actions: [A('tailWag', W(9, 1), { seconds: Math.max(1, W(9, 4) - W(9, 1)) }), A('excitedHop', W(9, 4))] }),
  ], { preset: 'closeup', size: 'closeup', target: 1, yaw: -0.25 }, day),
  shot('Now bow down, down to the ground (profile two-shot)', 10, 10, pg(), [
    mira([-0.55, 0, 1.4], { rot: [0, 1.57, 0], actions: [A('bow', Math.max(0, W(10, 1) - 0.2), { seconds: 2.0 })] }),
    mango([0.55, 0, 1.4], { rot: [0, -1.57, 0], look_at: undefined, actions: [A('playBow', W(10, 2))] }),
  ], { preset: 'group', size: 'full', yaw: 0.25, height: -0.2 }, day),
  shot('Up float balloons, pink and round! (the whole bunch in the picture)', 11, 11, pg({ type: 'balloons', pos: [0.15, 0, 1.75], scale: 0.7, lift: W(11, 1), rise: 1.6 }), [
    mira([-0.55, 0, 1.4], { actions: [A('lookUp', W(11, 0), { seconds: 1.6 }), A('cheer', W(11, 3))] }), mango([0.75, 0, 1.6], { actions: [A('headTilt', W(11, 1))] }),
  ], { preset: 'group', size: 'wide', height: -0.5, yaw: 0.1 }, day),

  // ===== Chorus 2 =====
  shot('Chorus 2 · seesaw: up and down (low hero angle)', 12, 12, seesawAt(12)(pg), onSeesaw(2.4, seesawOff(12)),
    { preset: 'group', size: 'full', yaw: 0.55, height: -0.9 }, day),
  shot('Chorus 2 · swing: high and low (towards us)', 13, 13, pg(SWING), onSwing(),
    { preset: 'group', size: 'full', yaw: 0.2, height: -0.2 }, day),
  shot('Chorus 2 · yes and no, hello, goodbye (two-shot)', 14, 14, pg(), [
    mira(M0, { actions: yesNoMira(14) }), mango(D0, { actions: yesNoMango(14) }),
  ], { preset: 'group', size: 'medium', yaw: -0.2 }, day),
  shot('Chorus 2 · come on, give it a try! Up the ladder and down the slide', 15, 15, pg(SLIDE), [
    slideRun(0.2), mango([0.9, 0, 2.4], { actions: [A('excitedHop', 4.3), A('tailWag', 5.8)] }),
  ], { preset: 'group', size: 'wide', yaw: 1.15, height: 0.1 }, day, st(15), st(16)),

  // ===== Verse 2 again: the beach ball =====
  shot('Mira jumps up, up, up, up! (the other side)', 16, 16, pg(), [
    mira(M0, { actions: [2, 3, 4, 5].map((n) => A('jump', Math.max(0, W(16, n) - 0.28), { seconds: 0.55, height: 0.3, crouch: 0.6 })) }), mango(D0, { actions: [A('excitedHop', W(16, 5))] }),
  ], { preset: 'group', size: 'full', yaw: -0.45, height: -0.5 }, day),
  shot('Mango wags, a happy pup! (two-shot)', 17, 17, pg(), [
    mira(M0, { actions: [A('clap', W(17, 3), { seconds: 1.0 })] }), mango(D0, { actions: [A('tailWag', W(17, 1), { seconds: Math.max(1, W(17, 4) - W(17, 1)) }), A('excitedHop', W(17, 4))] }),
  ], { preset: 'group', size: 'medium', target: 1, yaw: 0.4, height: -0.3 }, day),
  shot('Now bow down, down to the ground (face to face)', 18, 18, pg(), [
    mira([-0.5, 0, 1.4], { rot: [0, 1.57, 0], actions: [A('bow', Math.max(0, W(18, 1) - 0.2), { seconds: 2.0 })] }),
    mango([0.5, 0, 1.4], { rot: [0, -1.57, 0], look_at: undefined, actions: [A('playBow', W(18, 2))] }),
  ], { preset: 'group', size: 'medium', yaw: 0.05, height: -0.2 }, day),
  shot('Up float balloons… up and away! (wide, the bunch in the picture)', 19, 19, pg({ type: 'balloons', pos: [0.1, 0, 1.6], scale: 0.7, lift: W(19, 1), rise: 3.0 }), [
    mira([-0.55, 0, 1.4], { actions: [A('lookUp', W(19, 0), { seconds: 3.0 }), A('wave', W(19, 1) + 2.6)] }), mango([0.75, 0, 1.6], { actions: [A('excitedHop', W(19, 2))] }),
  ], { preset: 'tilt-up', size: 'wide', height: -0.5, yaw: -0.1 }, day, st(19), st(20)),

  // ===== Chorus 3: the Candy Garden =====
  shot('Chorus 3 · Candy Garden · seesaw (crane down)', 20, 20, seesawAt(20)(cg), onSeesaw(2.4, seesawOff(20)),
    { preset: 'crane', size: 'full', transition: 'iris', yaw: 0.3 }, day),
  shot('Chorus 3 · merry-go-round: spin around! (orbit)', 21, 21, cg(MERRY), onMerry(),
    { preset: 'orbit', size: 'full', amount: 0.6, height: -0.2, target: 0 }, day),
  shot('Chorus 3 · close-up: yes and no, hello, goodbye (candy bokeh)', 22, 22, cg(), [
    mira(M0, { actions: yesNoMira(22, 'left') }), mango(D0, { actions: yesNoMango(22) }),
  ], { preset: 'group', size: 'medium', target: 0, yaw: -0.2 }, day),
  shot('Chorus 3 · come on, copy! Twirl, and Mango spins', 23, 23, cg(), [
    mira(M0, { actions: copyMira(23, [A('twirl', 3.6)]) }), mango(D0, { actions: [A('pawRaise', W(23, 2)), A('spin', W(23, 3))] }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.25, height: -0.3 }, day, st(23), st(24)),

  // ===== Verse 3: the kite =====
  // Mira (in profile, facing left) holds the string up; the kite flies in FRONT of her, up on the left.
  shot('Red kite flying high, so high! (profile, the kite ahead of her)', 24, 24, cg({ type: 'kite', pos: [-2.2, 2.3, 1.15], anchor: [2.25, -1.52, 0.35], size: 1.4 }), [
    mira([0.3, 0, 1.6], { rot: [0, -1.57, 0], actions: [hold('holdKite', 12, { tugs: 3 })] }), mango([0.95, 0, 1.25], { rot: [0, -1.57, 0], look_at: undefined, actions: [A('headTilt', W(24, 3))] }),
  ], { preset: 'group', size: 'wide', height: -0.5, yaw: 0.15 }, day),
  shot('Dancing in the big blue sky (low, the kite dances)', 25, 25, cg({ type: 'kite', pos: [-2.2, 2.3, 1.15], anchor: [2.25, -1.52, 0.35], size: 1.4 }), [
    mira([0.3, 0, 1.6], { rot: [0, -1.57, 0], actions: [hold('holdKite', 12, { tugs: 5 })] }), mango([0.95, 0, 1.25], { rot: [0, -1.57, 0], look_at: undefined, actions: [A('excitedHop', W(25, 1))] }),
  ], { preset: 'group', size: 'wide', height: -0.9, yaw: -0.2, dof: 'off' }, day),
  shot('Swooping low, low, low it goes!', 26, 26, cg({ ...{ type: 'kite', pos: [-2.2, 2.3, 1.15], anchor: [2.25, -1.52, 0.35], size: 1.4 }, swoop: { at: W(26, 0), dur: Math.max(1.6, W(26, 4) - W(26, 0)), drop: 1.1 } }), [
    mira([0.3, 0, 1.6], { rot: [0, -1.57, 0], actions: [hold('holdKite', 12, { tugs: 2 })] }), mango([0.95, 0, 1.25], { rot: [0, -1.57, 0], look_at: undefined, actions: [A('excitedHop', W(26, 3))] }),
  ], { preset: 'group', size: 'wide', yaw: 0.3, height: -0.2 }, day),
  shot('Mango sniffs low with his nose (close-up)', 27, 27, cg(), [
    mira([-0.4, 0, 2.2]), mango([0.6, 0, 2.6], { actions: [A('sniff', W(27, 1), { seconds: Math.max(1.2, en(27) - st(27) - W(27, 1)) })] }),
  ], { preset: 'closeup', size: 'closeup', target: 1, yaw: 0.3 }, day),

  // ===== Chorus 4: Candy Garden =====
  shot('Chorus 4 · seesaw: up and down (low, the other side)', 28, 28, seesawAt(28)(cg), onSeesaw(2.4, seesawOff(28)),
    { preset: 'group', size: 'full', yaw: -0.55, height: -0.8 }, day),
  shot('Chorus 4 · swing: high and low (three-quarter, the other side)', 29, 29, cg(SWING), onSwing(),
    { preset: 'group', size: 'full', yaw: -0.65, height: -0.1 }, day),
  shot('Chorus 4 · yes and no, hello, goodbye (two-shot)', 30, 30, cg(), [
    mira(M0, { actions: yesNoMira(30) }), mango(D0, { actions: yesNoMango(30) }),
  ], { preset: 'group', size: 'medium', yaw: 0.3 }, day),
  shot('Chorus 4 · come on, copy! Hop, hop, hop', 31, 31, cg(), [
    mira(M0, { actions: copyMira(31) }), mango(D0, { actions: [A('pawRaise', W(31, 2)), A('excitedHop', W(31, 3))] }),
  ], { preset: 'group', size: 'full', yaw: -0.15, height: -0.4 }, day),

  // ===== Verse 4: back home, golden sunset =====
  shot('Yes, yes, yes, we nod our heads (sunset)', 32, 32, pg(), [
    mira(M0, { actions: [A('nod', W(32, 0), { nods: 3, seconds: Math.max(1, W(32, 3) - W(32, 0)) })] }), mango(D0, { actions: [A('nod', W(32, 1), { nods: 2, seconds: Math.max(0.8, W(32, 3) - W(32, 1)) })] }),
  ], { preset: 'group', size: 'medium', yaw: 0.25, transition: 'iris' }, sunset),
  shot('No, no, no, we shake instead!', 33, 33, pg(), [
    mira(M0, { actions: [A('shake', W(33, 0), { seconds: Math.max(1, W(33, 3) - W(33, 0)) })] }), mango(D0, { actions: [A('shake', W(33, 1), { seconds: Math.max(0.8, W(33, 3) - W(33, 1)) })] }),
  ], { preset: 'group', size: 'medium', yaw: -0.35 }, sunset),
  shot('Wave hello, the day was fun! (medium: the waving hand in the picture)', 34, 34, pg(), [
    mira(M0, { actions: [A('wave', W(34, 0), { seconds: Math.max(1.6, en(34) - st(34) - W(34, 0)) })] }), mango(D0, { actions: [A('pawRaise', W(34, 1))] }),
  ], { preset: 'group', size: 'medium', target: 0, yaw: 0.1 }, sunset),
  shot('Wave goodbye to the setting sun! (profile, sun behind)', 35, 35, pg(), [
    mira([-0.4, 0, 1.4], { rot: [0, 0.7, 0], actions: [A('wave', W(35, 0), { seconds: 2.4 }), A('wave', 3.0, { seconds: 1.6, hand: 'left' })] }),
    mango([0.35, 0, 1.0], { rot: [0, 0.7, 0], look_at: undefined, actions: [A('pawRaise', 0.6), A('tailWag', 2.8)] }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.2, height: -0.3 }, sunset, st(35), st(36)),

  // ===== Chorus 5: sunset =====
  shot('Chorus 5 · seesaw at sunset (hero angle)', 36, 36, seesawAt(36)(pg), onSeesaw(2.4, seesawOff(36)),
    { preset: 'group', size: 'full', yaw: 0.35, height: -1.0 }, sunset),
  shot('Chorus 5 · swing at sunset (three-quarter)', 37, 37, pg(SWING), onSwing(),
    { preset: 'group', size: 'full', yaw: 0.55, height: -0.2 }, sunset),
  shot('Chorus 5 · close-up: yes and no, hello, goodbye', 38, 38, pg(), [
    mira(M0, { actions: yesNoMira(38) }), mango(D0, { actions: yesNoMango(38) }),
  ], { preset: 'group', size: 'medium', target: 0, yaw: -0.15 }, sunset),
  shot('Chorus 5 · come on, copy! Clap and cheer', 39, 39, pg(), [
    mira(M0, { actions: copyMira(39) }), mango(D0, { actions: [A('pawRaise', W(39, 2)), A('excitedHop', W(39, 3))] }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.2, height: -0.2 }, sunset, st(39), en(39) + 0.6),
  shot('Instrumental · ball game at sunset (orbit)', 39, 39, pg(), [
    mira([-0.6, 0, 1.2], { actions: [A('kickBall', 0.5), A('cheer', 2.3), A('dance', 3.6, { seconds: 3.0 }), A('twirl', 6.8)] }),
    mango([0.9, 0, 1.6], { actions: [A('jumpCatch', 1.25), A('rollOver', 3.8), A('excitedHop', 6.8)] }),
    ball([-0.3, 0, 1.75], { motion: { type: 'bounce', to: [0.55, 0, 2.3], hops: 3, height: 0.45, start: 0.72 } }), // kicked at 0.72 s: real arcs, lower each bounce, then rolls
  ], { preset: 'orbit', size: 'full', amount: 0.6, height: -0.2 }, sunset, en(39) + 0.6, st(40)),

  // ===== Slow chorus: gentle =====
  shot('Slow chorus · a gentle swing (push in)', 40, 41, pg({ ...SWING, period: 3.4, amplitude: 18 }), onSwing(3.4),
    { preset: 'dolly-in', size: 'wide', yaw: 0.4, height: -0.1, transition: 'dissolve' }, sunset),
  shot('Slow chorus · close-up: hello, goodbye', 42, 42, pg(), [
    mira(M0, { actions: yesNoMira(42) }), mango(D0, { actions: yesNoMango(42) }),
  ], { preset: 'group', size: 'medium', target: 0, yaw: 0.2 }, sunset),
  shot('Slow chorus · a soft seesaw (push in)', 43, 43, seesawAt(43, 3.4, { amplitude: 10 })(pg), onSeesaw(3.4, seesawOff(43, 3.4)),
    { preset: 'dolly-in', size: 'full', yaw: -0.3, height: -0.6 }, sunset, st(43), en(43)),
  shot('Instrumental · up the ladder, down the slide', 43, 43, pg(SLIDE), [
    slideRun(0.3), mango([0.9, 0, 2.4], { actions: [A('excitedHop', 4.4), A('tailWag', 6.0)] }),
  ], { preset: 'group', size: 'wide', yaw: -1.15, height: 0.1 }, sunset, en(43), 161.0),
  shot('Instrumental · skipping together', 43, 43, pg(), [
    mira([-2.3, 0, 1.6], { motion: { type: 'path', to: [1.2, 0, 1.2] }, actions: [A('skip', 0.1, { seconds: 0.62, repeats: 9 })] }),
    mango([-1.7, 0, 0.5], { motion: { type: 'path', to: [2.4, 0, 0.2] } }), // a little ahead, on the far side
  ], { preset: 'follow', size: 'full', target: 0, yaw: 0.6, height: -0.3 }, sunset, 161.0, st(44)),

  // ===== Final chorus =====
  shot('Final chorus · seesaw: up and down (front, low)', 44, 44, seesawAt(44)(pg), onSeesaw(2.4, seesawOff(44)),
    { preset: 'group', size: 'full', yaw: 0.15, height: -0.7, transition: 'dissolve' }, sunset),
  shot('Final chorus · merry-go-round: spin around!', 45, 45, pg({ ...MERRY, speed: 0.5 }), onMerry(),
    { preset: 'orbit', size: 'full', amount: 0.8, height: -0.3, target: 0 }, sunset),
  shot('Final chorus · yes and no, hello, goodbye (two-shot)', 46, 46, pg(), [
    mira(M0, { actions: yesNoMira(46) }), mango(D0, { actions: yesNoMango(46) }),
  ], { preset: 'group', size: 'medium', yaw: 0.25 }, sunset),
  shot('Final chorus · come on, copy, give it a try! Jump together', 47, 47, pg(), [
    mira(M0, { actions: [A('greet', W(47, 0), { seconds: 1.2 }), A('clap', W(47, 2), { seconds: 1.0 }), A('jump', W(47, 3), { repeats: 2, seconds: 1.4, height: 0.32 }), A('cheer', W(47, 3) + 1.6)] }),
    mango(D0, { actions: [A('pawRaise', W(47, 2)), A('excitedHop', W(47, 3)), A('jumpCatch', W(47, 3) + 1.6)] }),
  ], { preset: 'group', size: 'full', yaw: -0.2, height: -0.5 }, sunset, st(47), en(47) + 0.3),

  // ===== Outro =====
  shot('Outro · thank you for playing! (push in)', 47, 47, pg(), [
    mira(M0, { actions: [A('wave', 0.4, { seconds: 2.4 }), A('bow', 3.6), A('twirl', 6.0), A('jump', 8.6), A('wave', 10.2, { hand: 'left' })] }),
    mango(D0, { actions: [A('pawRaise', 1.0), A('playBow', 3.9), A('rollOver', 6.3), A('jumpCatch', 8.8), A('tailWag', 10.4)] }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.2 }, sunset, en(47) + 0.3, 199.0),
  shot('End card · balloons float away into the sunset', 47, 47, pg({ type: 'balloons', pos: [0.02, 0, 2.0], scale: 0.7, lift: 3.0, rise: 7 }), [
    mira(M0, { actions: [A('wave', 0.6, { seconds: 3.0 }), A('lookUp', 4.2, { seconds: 3 })] }), mango(D0, { actions: [A('tailWag', 1.0, { seconds: 3 })] }),
  ], { preset: 'tilt-up', size: 'wide', height: -0.3 }, sunset, 199.0, null),
];
const res = await replaceShots(shots);
console.log(`${res.length} shots written`);
