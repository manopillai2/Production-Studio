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
import { call, cards, replaceShots, CARD, EP } from './shotlib.mjs';
await cards();
const scene = await call('GET', `/api/episodes/${EP}/scene`);
const L = scene.timing.lines; const st = (i) => L[i].start, en = (i) => L[i].end;

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
const onSeesaw = (period = 2.4) => [
  mira([-1.3, 0, 0.4], { ride: { equip: 0, seat: 'a' }, actions: [hold('seesawRide', period, { repeats: 8 })] }),
  mango([1.3, 0, 0.4], { ride: { equip: 0, seat: 'b', lift: 0.02, back: -0.1 }, actions: [hold('dogSit', 30)] }),
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
  shot('Chorus 1 · seesaw: slow and fast, up and down (side-on)', 4, 4, pg(SEESAW), onSeesaw(),
    { preset: 'group', size: 'full', yaw: 0, height: -0.3 }, day),
  shot('Chorus 1 · swing: high and low (three-quarter)', 5, 5, pg(SWING), onSwing(),
    { preset: 'group', size: 'full', yaw: 0.65, height: -0.1 }, day),
  shot('Chorus 1 · close-up: yes and no, hello, goodbye', 6, 6, pg(), [
    mira(M0, { actions: [A('nod', 0.05, { seconds: 0.8 }), A('shake', 0.9, { seconds: 0.8 }), A('wave', 1.75, { seconds: 1.2 })] }), mango(D0),
  ], { preset: 'closeup', size: 'closeup', target: 0, yaw: 0.15 }, day),
  shot('Chorus 1 · come on, copy, give it a try! (to the viewer)', 7, 7, pg(), [
    mira(M0, { actions: [A('clap', 0.2), A('greet', 2.0), A('dance', 3.8, { seconds: 3.2 })] }),
    mango(D0, { actions: [A('pawRaise', 1.0), A('excitedHop', 2.6), A('spin', 4.6)] }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.1, height: -0.2 }, day, st(7), st(8)),

  // ===== Verse 2 =====
  shot('Mira jumps up, up, up, up! (low angle)', 8, 8, pg(), [
    mira(M0, { actions: [A('jump', 0.1, { repeats: 4, seconds: 2.5, height: 0.35 })] }), mango(D0, { actions: [A('excitedHop', 1.4)] }),
  ], { preset: 'tilt-up', size: 'full', height: -1.2, target: 0, yaw: -0.15 }, day),
  shot('Mango wags, a happy pup! (close-up)', 9, 9, pg(), [
    mira(M0), mango(D0, { actions: [A('tailWag', 0.05, { seconds: 1.9 })] }),
  ], { preset: 'closeup', size: 'closeup', target: 1, yaw: -0.25 }, day),
  shot('Now bow down, down to the ground (profile two-shot)', 10, 10, pg(), [
    mira([-0.55, 0, 1.4], { rot: [0, 1.57, 0], actions: [A('bow', 0.2, { seconds: 2.0 })] }),
    mango([0.55, 0, 1.4], { rot: [0, -1.57, 0], look_at: undefined, actions: [A('playBow', 0.4)] }),
  ], { preset: 'group', size: 'full', yaw: 0.25, height: -0.2 }, day),
  shot('Up float balloons, pink and round! (tilt up)', 11, 11, pg({ type: 'balloons', pos: [0.15, 0, 1.75], scale: 0.7, lift: 1.4, rise: 2.4 }), [
    mira([-0.55, 0, 1.4], { actions: [A('lookUp', 0.6, { seconds: 1.6 }), A('cheer', 2.2)] }), mango([0.75, 0, 1.6], { actions: [A('headTilt', 0.8)] }),
  ], { preset: 'tilt-up', size: 'full', height: -0.6, yaw: 0.1 }, day),

  // ===== Chorus 2 =====
  shot('Chorus 2 · seesaw: up and down (low hero angle)', 12, 12, pg(SEESAW), onSeesaw(),
    { preset: 'group', size: 'full', yaw: 0.55, height: -0.9 }, day),
  shot('Chorus 2 · swing: high and low (towards us)', 13, 13, pg(SWING), onSwing(),
    { preset: 'group', size: 'full', yaw: 0.2, height: -0.2 }, day),
  shot('Chorus 2 · yes and no, hello, goodbye (two-shot)', 14, 14, pg(), [
    mira(M0, { actions: [A('nod', 0.05, { seconds: 0.8 }), A('shake', 0.9, { seconds: 0.8 }), A('wave', 1.75, { seconds: 1.4 })] }),
    mango(D0, { actions: [A('nod', 0.3, { seconds: 0.8 }), A('pawRaise', 1.9)] }),
  ], { preset: 'group', size: 'medium', yaw: -0.2 }, day),
  shot('Chorus 2 · come on, give it a try! Up the ladder and down the slide', 15, 15, pg(SLIDE), [
    slideRun(0.2), mango([0.9, 0, 2.4], { actions: [A('excitedHop', 4.3), A('tailWag', 5.8)] }),
  ], { preset: 'group', size: 'wide', yaw: 1.15, height: 0.1 }, day, st(15), st(16)),

  // ===== Verse 2 again: the beach ball =====
  shot('Mira jumps up, up! The ball bounces too', 16, 16, pg(), [
    mira(M0, { actions: [A('jump', 0.1, { repeats: 3, seconds: 2.2, height: 0.3 })] }), mango([0.9, 0, 1.7], { actions: [A('excitedHop', 1.0)] }),
    ball([0.25, 0, 1.15], { motion: { type: 'bounce', to: [0.25, 0, 1.15], hops: 3, height: 0.6 } }),
  ], { preset: 'group', size: 'full', yaw: -0.45, height: -0.5 }, day),
  shot('Mango wags, a happy pup! He catches the ball', 17, 17, pg(), [
    mira([-0.7, 0, 1.2], { actions: [A('kickBall', 0.1)] }), mango([0.8, 0, 1.6], { actions: [A('jumpCatch', 0.6), A('tailWag', 1.3, { seconds: 0.8 })] }),
    ball([-0.35, 0, 1.7], { motion: { type: 'bounce', to: [0.55, 0, 2.05], hops: 1, height: 0.5, start: 0.25, duration: 0.7 } }),
  ], { preset: 'group', size: 'full', yaw: 0.4, height: -0.3 }, day),
  shot('Now bow down, down to the ground (face to face)', 18, 18, pg(), [
    mira([-0.5, 0, 1.4], { rot: [0, 1.57, 0], actions: [A('bow', 0.15, { seconds: 2.0 })] }),
    mango([0.5, 0, 1.4], { rot: [0, -1.57, 0], look_at: undefined, actions: [A('playBow', 0.3)] }),
  ], { preset: 'group', size: 'medium', yaw: 0.05, height: -0.2 }, day),
  shot('Up float balloons… up and away! (crane up)', 19, 19, pg({ type: 'balloons', pos: [0.1, 0, 1.6], scale: 0.7, lift: 2.0, rise: 3.6 }), [
    mira([-0.55, 0, 1.4], { actions: [A('lookUp', 0.7, { seconds: 3.4 }), A('wave', 4.3)] }), mango([0.75, 0, 1.6], { actions: [A('excitedHop', 1.6)] }),
  ], { preset: 'tilt-up', size: 'full', height: -0.6, yaw: -0.1 }, day, st(19), st(20)),

  // ===== Chorus 3: the Candy Garden =====
  shot('Chorus 3 · Candy Garden · seesaw (crane down)', 20, 20, cg(SEESAW), onSeesaw(),
    { preset: 'crane', size: 'full', transition: 'iris', yaw: 0.3 }, day),
  shot('Chorus 3 · merry-go-round: spin around! (orbit)', 21, 21, cg(MERRY), onMerry(),
    { preset: 'orbit', size: 'full', amount: 0.6, height: -0.2, target: 0 }, day),
  shot('Chorus 3 · close-up: yes and no, hello, goodbye (candy bokeh)', 22, 22, cg(), [
    mira(M0, { actions: [A('nod', 0.05, { seconds: 0.8 }), A('shake', 0.9, { seconds: 0.8 }), A('wave', 1.75, { seconds: 1.3, hand: 'left' })] }), mango(D0),
  ], { preset: 'closeup', size: 'closeup', target: 0, yaw: -0.2, dof: '1.6' }, day),
  shot('Chorus 3 · come on, copy! Twirl, and Mango spins', 23, 23, cg(), [
    mira(M0, { actions: [A('twirl', 0.2), A('clap', 2.2), A('cheer', 3.6)] }), mango(D0, { actions: [A('spin', 0.6), A('excitedHop', 2.6)] }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.25, height: -0.3 }, day, st(23), st(24)),

  // ===== Verse 3: the kite =====
  shot('Red kite flying high, so high! (low angle)', 24, 24, cg({ type: 'kite', pos: [0.7, 2.05, -0.8], anchor: [-1.1, -1.05, 3.0], size: 1.4 }), [
    mira([-0.4, 0, 2.2], { actions: [A('lookUp', 0.2, { seconds: 2.4 })] }), mango([0.6, 0, 2.6], { actions: [A('headTilt', 1.2)] }),
  ], { preset: 'tilt-up', size: 'full', distance: 1.35, height: -0.7, yaw: 0.1 }, day),
  shot('Dancing in the big blue sky (the kite)', 25, 25, cg({ type: 'kite', pos: [0.7, 2.05, -0.8], anchor: [-1.1, -1.05, 3.0], size: 1.4 }), [
    mira([-0.4, 0, 2.2], { actions: [A('lookUp', 0.1, { seconds: 2.1 })] }), mango([0.6, 0, 2.6]),
  ], { preset: 'group', size: 'wide', height: -0.9, yaw: -0.3, dof: 'off' }, day),
  shot('Swooping low, low, low it goes!', 26, 26, cg({ type: 'kite', pos: [0.7, 2.05, -0.8], anchor: [-1.1, -1.05, 3.0], size: 1.4, swoop: { at: 0.2, dur: 2.2, drop: 1.0 } }), [
    mira([-0.4, 0, 2.2], { actions: [A('lookUp', 0.2, { seconds: 1.4 }), A('cheer', 1.7)] }), mango([0.6, 0, 2.6], { actions: [A('excitedHop', 1.2)] }),
  ], { preset: 'group', size: 'wide', yaw: 0.35, height: 0.4 }, day),
  shot('Mango sniffs low with his nose (close-up)', 27, 27, cg(), [
    mira([-0.4, 0, 2.2]), mango([0.6, 0, 2.6], { actions: [A('sniff', 0.1, { seconds: 2.1 })] }),
  ], { preset: 'closeup', size: 'closeup', target: 1, yaw: 0.3 }, day),

  // ===== Chorus 4: Candy Garden =====
  shot('Chorus 4 · seesaw: up and down (low, the other side)', 28, 28, cg(SEESAW), onSeesaw(),
    { preset: 'group', size: 'full', yaw: -0.55, height: -0.8 }, day),
  shot('Chorus 4 · swing: high and low (three-quarter, the other side)', 29, 29, cg(SWING), onSwing(),
    { preset: 'group', size: 'full', yaw: -0.65, height: -0.1 }, day),
  shot('Chorus 4 · yes and no, hello, goodbye (two-shot)', 30, 30, cg(), [
    mira(M0, { actions: [A('nod', 0.05, { seconds: 0.8 }), A('shake', 0.9, { seconds: 0.8 }), A('wave', 1.75, { seconds: 1.3 })] }),
    mango(D0, { actions: [A('nod', 0.3, { seconds: 0.8 }), A('pawRaise', 1.9)] }),
  ], { preset: 'group', size: 'medium', yaw: 0.3 }, day),
  shot('Chorus 4 · come on, copy! Hop, hop, hop', 31, 31, cg(), [
    mira(M0, { actions: [A('hop', 0.2, { repeats: 3, seconds: 1.5 }), A('cheer', 1.9)] }), mango(D0, { actions: [A('excitedHop', 0.5), A('excitedHop', 1.4)] }),
  ], { preset: 'group', size: 'full', yaw: -0.15, height: -0.4 }, day),

  // ===== Verse 4: back home, golden sunset =====
  shot('Yes, yes, yes, we nod our heads (sunset)', 32, 32, pg(), [
    mira(M0, { actions: [A('nod', 0.1, { seconds: 2.1 })] }), mango(D0, { actions: [A('nod', 0.3, { seconds: 1.9 })] }),
  ], { preset: 'group', size: 'medium', yaw: 0.25, transition: 'iris' }, sunset),
  shot('No, no, no, we shake instead!', 33, 33, pg(), [
    mira(M0, { actions: [A('shake', 0.1, { seconds: 2.2 })] }), mango(D0, { actions: [A('shake', 0.3, { seconds: 2.0 })] }),
  ], { preset: 'group', size: 'medium', yaw: -0.35 }, sunset),
  shot('Wave hello, the day was fun! (close-up)', 34, 34, pg(), [
    mira(M0, { actions: [A('wave', 0.1, { seconds: 2.2 })] }), mango(D0),
  ], { preset: 'closeup', size: 'closeup', target: 0, yaw: 0.1 }, sunset),
  shot('Wave goodbye to the setting sun! (profile, sun behind)', 35, 35, pg(), [
    mira([-0.4, 0, 1.4], { rot: [0, 0.7, 0], actions: [A('wave', 0.2, { seconds: 2.4 }), A('wave', 3.0, { seconds: 1.6, hand: 'left' })] }),
    mango([0.35, 0, 1.0], { rot: [0, 0.7, 0], look_at: undefined, actions: [A('pawRaise', 0.6), A('tailWag', 2.8)] }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.2, height: -0.3 }, sunset, st(35), st(36)),

  // ===== Chorus 5: sunset =====
  shot('Chorus 5 · seesaw at sunset (hero angle)', 36, 36, pg(SEESAW), onSeesaw(),
    { preset: 'group', size: 'full', yaw: 0.35, height: -1.0 }, sunset),
  shot('Chorus 5 · swing at sunset (three-quarter)', 37, 37, pg(SWING), onSwing(),
    { preset: 'group', size: 'full', yaw: 0.55, height: -0.2 }, sunset),
  shot('Chorus 5 · close-up: yes and no, hello, goodbye', 38, 38, pg(), [
    mira(M0, { actions: [A('nod', 0.05, { seconds: 0.8 }), A('shake', 0.9, { seconds: 0.8 }), A('wave', 1.75, { seconds: 1.3 })] }), mango(D0),
  ], { preset: 'closeup', size: 'closeup', target: 0, yaw: -0.15 }, sunset),
  shot('Chorus 5 · come on, copy! Clap and cheer', 39, 39, pg(), [
    mira(M0, { actions: [A('clap', 0.2), A('greet', 1.8), A('cheer', 3.6)] }), mango(D0, { actions: [A('pawRaise', 0.8), A('excitedHop', 3.2)] }),
  ], { preset: 'dolly-in', size: 'full', yaw: 0.2, height: -0.2 }, sunset, st(39), en(39) + 0.6),
  shot('Instrumental · ball game at sunset (orbit)', 39, 39, pg(), [
    mira([-0.6, 0, 1.2], { actions: [A('kickBall', 0.5), A('dance', 2.6, { seconds: 3.0 }), A('twirl', 6.6)] }),
    mango([0.9, 0, 1.6], { actions: [A('jumpCatch', 1.1), A('rollOver', 3.6), A('excitedHop', 6.8)] }),
    ball([-0.3, 0, 1.7], { motion: { type: 'bounce', to: [0.45, 0, 2.35], hops: 2, height: 0.7, start: 0.65, duration: 1.0 } }),
  ], { preset: 'orbit', size: 'full', amount: 0.6, height: -0.2 }, sunset, en(39) + 0.6, st(40)),

  // ===== Slow chorus: gentle =====
  shot('Slow chorus · a gentle swing (push in)', 40, 41, pg({ ...SWING, period: 3.4, amplitude: 18 }), onSwing(3.4),
    { preset: 'dolly-in', size: 'wide', yaw: 0.4, height: -0.1, transition: 'dissolve' }, sunset),
  shot('Slow chorus · close-up: hello, goodbye', 42, 42, pg(), [
    mira(M0, { actions: [A('nod', 0.2, { seconds: 1.0 }), A('wave', 1.4, { seconds: 1.6 })] }), mango(D0),
  ], { preset: 'closeup', size: 'closeup', target: 0, yaw: 0.2 }, sunset),
  shot('Slow chorus · a soft seesaw (push in)', 43, 43, pg({ ...SEESAW, period: 3.4, amplitude: 10 }), onSeesaw(3.4),
    { preset: 'dolly-in', size: 'full', yaw: -0.3, height: -0.6 }, sunset, st(43), en(43)),
  shot('Instrumental · up the ladder, down the slide', 43, 43, pg(SLIDE), [
    slideRun(0.3), mango([0.9, 0, 2.4], { actions: [A('excitedHop', 4.4), A('tailWag', 6.0)] }),
  ], { preset: 'group', size: 'wide', yaw: -1.15, height: 0.1 }, sunset, en(43), 161.0),
  shot('Instrumental · skipping together', 43, 43, pg(), [
    mira([-2.3, 0, 1.6], { motion: { type: 'path', to: [1.2, 0, 1.2] }, actions: [A('skip', 0.1, { seconds: 0.62, repeats: 9 })] }),
    mango([-1.7, 0, 0.5], { motion: { type: 'path', to: [2.4, 0, 0.2] } }), // a little ahead, on the far side
  ], { preset: 'follow', size: 'full', target: 0, yaw: 0.6, height: -0.3 }, sunset, 161.0, st(44)),

  // ===== Final chorus =====
  shot('Final chorus · seesaw: up and down (front, low)', 44, 44, pg(SEESAW), onSeesaw(),
    { preset: 'group', size: 'full', yaw: 0.15, height: -0.7, transition: 'dissolve' }, sunset),
  shot('Final chorus · merry-go-round: spin around!', 45, 45, pg({ ...MERRY, speed: 0.5 }), onMerry(),
    { preset: 'orbit', size: 'full', amount: 0.8, height: -0.3, target: 0 }, sunset),
  shot('Final chorus · yes and no, hello, goodbye (two-shot)', 46, 46, pg(), [
    mira(M0, { actions: [A('nod', 0.1, { seconds: 1.0 }), A('shake', 1.2, { seconds: 1.0 }), A('wave', 2.4, { seconds: 2.2 })] }),
    mango(D0, { actions: [A('nod', 0.4, { seconds: 1.0 }), A('pawRaise', 2.6)] }),
  ], { preset: 'group', size: 'medium', yaw: 0.25 }, sunset),
  shot('Final chorus · come on, copy, give it a try! Jump together', 47, 47, pg(), [
    mira(M0, { actions: [A('clap', 0.2), A('jump', 1.6, { repeats: 2, seconds: 1.6, height: 0.35 }), A('cheer', 3.6)] }),
    mango(D0, { actions: [A('excitedHop', 1.7), A('excitedHop', 2.5), A('jumpCatch', 3.8)] }),
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
