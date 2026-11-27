// Project 06 round 2 — slide shot long enough for climb + slide; reverse-angle ball game away from the slide's leg.
const fs = require('fs'); const path = require('path');
const f = path.join(__dirname, 'direction.mjs'); let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 90)); s = s.replace(a, () => b); };
// the slide shot runs into the next line (climb 0–1.8 s, sit, slide 2.3–3.7 s, sit at the bottom), the "copy" shot starts later
rep("  shot('Wheee! Down the slide', 14, 14, PG(), [", "  shot('Wheee! Climb up and down the slide', 14, 15, PG(), [");
rep("], { preset: 'wide', size: 'wide', yaw: -1.25, height: 0.6 }, day, null, st(15)),", "], { preset: 'wide', size: 'wide', yaw: -1.25, height: 0.6 }, day, null, st(15) + 2.4),");
rep("  ], { preset: 'dolly-in', size: 'full', yaw: -0.35, target: 0 }, day, st(15), null),", "  ], { preset: 'dolly-in', size: 'full', yaw: -0.35, target: 0 }, day, st(15) + 2.4, null),");
// reverse-angle ball game on the left of the playground, camera line clear of the slide and the swings
rep("    mira([0.6, 0, -0.6], { rot: [0, 2.25, 0], actions: [{ move: 'hop', at: 0.1, repeats: 2, seconds: 0.5 }, { move: 'kickBall', at: 1.2 }, { move: 'jump', at: 2.8 }] }),\n" +
    "    mango([2.1, 0, -1.5], { rot: [0, 2.15, 0], look_at: undefined, actions: [{ move: 'excitedHop', at: 0.4 }, { move: 'jumpCatch', at: 2.3 }] }),\n" +
    "    prop(CARD.ball, [0.75, 0, -1.0], { scale: 0.45, motion: { type: 'bounce', to: [1.95, 0, -1.75], hops: 2, height: 0.45, start: 1.75 } }),\n" +
    "  ], { preset: 'group', size: 'full', yaw: 2.25, height: -0.4 }, day, null, st(17)),",
    "    mira([-0.9, 0, -0.8], { rot: [0, 2.74, 0], actions: [{ move: 'hop', at: 0.1, repeats: 2, seconds: 0.5 }, { move: 'kickBall', at: 1.2 }, { move: 'jump', at: 2.8 }] }),\n" +
    "    mango([0.6, 0, -1.7], { rot: [0, 2.6, 0], look_at: undefined, actions: [{ move: 'excitedHop', at: 0.4 }, { move: 'jumpCatch', at: 2.3 }] }),\n" +
    "    prop(CARD.ball, [-0.75, 0, -1.2], { scale: 0.45, motion: { type: 'bounce', to: [0.45, 0, -1.95], hops: 2, height: 0.45, start: 1.75 } }),\n" +
    "  ], { preset: 'group', size: 'full', yaw: 2.74, height: -0.3 }, day, null, st(17)),");
rep("    mira([0.6, 0, -0.6], { rot: [0, 2.25, 0], actions: [{ move: 'clap', at: 0.3 }, { move: 'twirl', at: 2.0 }] }),\n" +
    "    mango([1.8, 0, -1.0], { motion: { type: 'circle', center: [1.2, 0, -0.4], turns: 2 } }),",
    "    mira([-0.9, 0, -0.8], { rot: [0, 2.74, 0], actions: [{ move: 'clap', at: 0.3 }, { move: 'twirl', at: 2.0 }] }),\n" +
    "    mango([0.4, 0, -1.6], { motion: { type: 'circle', center: [-0.3, 0, -1.3], turns: 2 } }),");
rep("  ], { preset: 'group', size: 'full', yaw: 2.3, height: 0.4 }, day, st(17), null),", "  ], { preset: 'group', size: 'full', yaw: 2.8, height: 0.4 }, day, st(17), null),");
rep("    prop(CARD.ball, [1.2, 0, -0.4], { scale: 0.45, motion: { type: 'bounce', to: [1.2, 0, -0.4], hops: 3, height: 0.35 } }),",
    "    prop(CARD.ball, [-0.3, 0, -1.3], { scale: 0.45, motion: { type: 'bounce', to: [-0.3, 0, -1.3], hops: 3, height: 0.35 } }),");
fs.writeFileSync(f, s); console.log('fixed');
