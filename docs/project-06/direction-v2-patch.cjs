// Project 06 round 2 (user feedback): legs through the equipment → fitted ride poses (engine); "why only walking?" →
// running chase, ladder climbing, kicking the ball, twirls, skipping, Mango's roll-overs, leaps and zoomies.
// Applies to direction.mjs (the previous version is kept as direction-v1.mjs).
const fs = require('fs'); const path = require('path');
const f = path.join(__dirname, 'direction.mjs'); let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 90)); s = s.replace(a, () => b); };

// 1) a real running chase on "Now we're running fast", then onto the merry-go-round for "zooming past"
rep("  shot('Zooming round on the merry-go-round', 2, 3, PG({}), [",
"  shot('Now we are running fast! A chase round the seesaw', 2, 2, PG(), [\n" +
"    mira([-1.0, 0, 3.0], { motion: { type: 'circle', center: [-0.5, 0, 0.9], turns: 0.85 } }),\n" +
"    mango([-2.4, 0, 2.6], { motion: { type: 'circle', center: [-0.5, 0, 0.9], turns: 0.85 }, look_at: undefined }),\n" +
"  ], { preset: 'group', size: 'wide', height: 0.6, yaw: 0.2, transition: 'cut' }, day, null, st(3)),\n" +
"  shot('Zooming round on the merry-go-round', 3, 3, PG({}), [");
rep("  { preset: 'orbit', size: 'full', amount: 0.6, height: 0.3, target: 0, transition: 'cut' }, day),",
    "  { preset: 'orbit', size: 'full', amount: 0.6, height: 0.3, target: 0, transition: 'cut' }, day, st(3), null),");
// 2) jumps: Mango leaps too
rep("    mango([0.9, 0, 2.6], { actions: [{ move: 'excitedHop', at: 0.5 }] }),\n    prop(CARD.ball, [0.4, 0, 1.6]",
    "    mango([0.9, 0, 2.6], { actions: [{ move: 'jumpCatch', at: 0.6 }, { move: 'excitedHop', at: 2.2 }] }),\n    prop(CARD.ball, [0.4, 0, 1.6]");
// 3) balloons: Mira jumps to reach them
rep("    mira([-0.6, 0, 2.3], { actions: [{ move: 'lookUp', at: 0.3, seconds: 2.4 }, { move: 'cheer', at: 2.8 }] }),",
    "    mira([-0.6, 0, 2.3], { actions: [{ move: 'lookUp', at: 0.2, seconds: 1.6 }, { move: 'jump', at: 1.9, seconds: 1.2 }, { move: 'cheer', at: 3.3 }] }),");
// 4) slides: climb the ladder first, sit at the top, then slide
rep("    mira(PGP.slideTop, { ...ride(2, 'top', { at: 1.0, dur: 1.5 }), actions: [hold('slideRide', 8)] }),",
    "    mira(PGP.slideTop, { ...ride(2, 'top', { climb: { at: 0, dur: 1.8 }, at: 2.4, dur: 1.4 }), actions: [{ move: 'climb', at: 0, seconds: 0.6, repeats: 3 }, { move: 'slideRide', at: 1.75, seconds: 8, hold: true }] }),");
rep("    mira(PGP.slideTop, { ...ride(2, 'top', { at: 0.8, dur: 1.5 }), actions: [hold('slideRide', 8)] }),",
    "    mira(PGP.slideTop, { ...ride(2, 'top', { climb: { at: 0, dur: 1.8 }, at: 2.3, dur: 1.4 }), actions: [{ move: 'climb', at: 0, seconds: 0.6, repeats: 3 }, { move: 'slideRide', at: 1.75, seconds: 8, hold: true }] }),");
// 5) reverse-angle ball game: a kick, the ball bounces to Mango, he leaps for it
rep("    mira([0.6, 0, -0.6], { rot: [0, 2.25, 0], actions: [{ move: 'hop', at: 0.1, repeats: 4 }, { move: 'jump', at: 2.2 }] }),\n" +
    "    mango([1.8, 0, -1.0], { rot: [0, 2.15, 0], look_at: undefined, actions: [{ move: 'excitedHop', at: 0.4 }] }),\n" +
    "    prop(CARD.ball, [1.2, 0, -0.2], { scale: 0.45, motion: { type: 'bounce', to: [1.2, 0, -0.2], hops: 5, height: 0.5 } }),",
    "    mira([0.6, 0, -0.6], { rot: [0, 2.25, 0], actions: [{ move: 'hop', at: 0.1, repeats: 2, seconds: 0.5 }, { move: 'kickBall', at: 1.2 }, { move: 'jump', at: 2.8 }] }),\n" +
    "    mango([2.1, 0, -1.5], { rot: [0, 2.15, 0], look_at: undefined, actions: [{ move: 'excitedHop', at: 0.4 }, { move: 'jumpCatch', at: 2.3 }] }),\n" +
    "    prop(CARD.ball, [0.75, 0, -1.0], { scale: 0.45, motion: { type: 'bounce', to: [1.95, 0, -1.75], hops: 2, height: 0.45, start: 1.75 } }),");
// 6) Mango's zoomies; Mira claps and twirls
rep("    mira([0.6, 0, -0.6], { rot: [0, 2.25, 0], actions: [{ move: 'clap', at: 0.4 }] }),\n" +
    "    mango([1.8, 0, -1.0], { motion: { type: 'circle', center: [1.2, 0, -0.4], turns: 1 }, actions: [{ move: 'tailWag', at: 0.2 }] }),",
    "    mira([0.6, 0, -0.6], { rot: [0, 2.25, 0], actions: [{ move: 'clap', at: 0.3 }, { move: 'twirl', at: 2.0 }] }),\n" +
    "    mango([1.8, 0, -1.0], { motion: { type: 'circle', center: [1.2, 0, -0.4], turns: 2 } }),");
// 7) candy garden: they skip in, then bow
rep("    mira([-0.4, 0, 2.2], { actions: [{ move: 'bow', at: 1.6, seconds: 1.8 }] }),\n    mango([0.6, 0, 2.5], { actions: [{ move: 'playBow', at: 1.9 }] }),",
    "    mira([-3.2, 0, 3.0], { motion: { type: 'path', to: [-0.4, 0, 2.2] }, actions: [{ move: 'skip', at: 0, seconds: 0.6, repeats: 4 }, { move: 'bow', at: 3.1, seconds: 1.6 }] }),\n" +
    "    mango([-3.9, 0, 3.4], { motion: { type: 'path', to: [0.6, 0, 2.5] }, actions: [{ move: 'playBow', at: 3.3 }] }),");
// 8) dance by the cart: twirl + roll over
rep("    mira([1.4, 0, 1.9], { actions: [{ move: 'dance', at: 0.2, seconds: 4.4 }] }),\n    mango([0.5, 0, 2.3], { actions: [{ move: 'spin', at: 0.6 }, { move: 'excitedHop', at: 2.8 }] }),",
    "    mira([1.4, 0, 1.9], { actions: [{ move: 'twirl', at: 0.2 }, { move: 'dance', at: 2.4, seconds: 3.0 }] }),\n    mango([0.5, 0, 2.3], { actions: [{ move: 'rollOver', at: 0.6 }, { move: 'excitedHop', at: 3.0 }] }),");
// 9) pinwheel party: twirls, Mango zooms round Mira
rep("    mira([-1.2, 0, 1.4], { actions: [{ move: 'spin', at: 0.2 }, { move: 'dance', at: 1.6, seconds: 3.2 }] }),\n    mango([-0.2, 0, 1.8], { actions: [{ move: 'excitedHop', at: 0.4 }, { move: 'spin', at: 2.4 }] }),",
    "    mira([-1.2, 0, 1.4], { actions: [{ move: 'twirl', at: 0.2, seconds: 2.2 }, { move: 'dance', at: 2.6, seconds: 2.2 }] }),\n    mango([-0.2, 0, 1.8], { motion: { type: 'circle', center: [-1.2, 0, 1.4], turns: 1.2 } }),");
// 10) glade dance party: twirl, roll over, leap
rep("    mira([-0.6, 0, 1.6], { actions: [{ move: 'dance', at: 0.3, seconds: 3.6 }, { move: 'spin', at: 4.4 }, { move: 'cheer', at: 6.2 }] }),\n    mango([0.6, 0, 1.9], { actions: [{ move: 'excitedHop', at: 0.8 }, { move: 'spin', at: 3.4 }, { move: 'playBow', at: 5.8 }] }),",
    "    mira([-0.6, 0, 1.6], { actions: [{ move: 'dance', at: 0.3, seconds: 3.0 }, { move: 'twirl', at: 3.6 }, { move: 'cheer', at: 6.2 }] }),\n    mango([0.6, 0, 1.9], { actions: [{ move: 'rollOver', at: 0.8 }, { move: 'jumpCatch', at: 3.4 }, { move: 'playBow', at: 5.8 }] }),");
// 11) skipping through the glade
rep("    mira([-3.0, 0, 2.6], { motion: { type: 'path', to: [0.6, 0, 1.8] }, actions: [{ move: 'look', at: 4.2 }] }),",
    "    mira([-3.0, 0, 2.6], { motion: { type: 'path', to: [0.6, 0, 1.8] }, actions: [{ move: 'skip', at: 0.2, seconds: 0.62, repeats: 9 }, { move: 'twirl', at: 6.0 }] }),");
// 12) ball game: kick and catch
rep("    mira([0.4, 0, 1.8], { actions: [{ move: 'clap', at: 0.6 }, { move: 'jump', at: 3.2 }, { move: 'cheer', at: 5.0 }] }),\n" +
    "    mango([1.6, 0, 2.2], { actions: [{ move: 'excitedHop', at: 1.2 }, { move: 'spin', at: 3.6 }] }),\n" +
    "    prop(CARD.ball, [0.4, 0, 1.8], { scale: 0.4, motion: { type: 'bounce', to: [1.6, 0, 2.2], hops: 5, height: 0.9 } }),",
    "    mira([0.2, 0, 1.8], { actions: [{ move: 'kickBall', at: 0.6 }, { move: 'clap', at: 2.6 }, { move: 'cheer', at: 5.0 }] }),\n" +
    "    mango([1.7, 0, 2.2], { actions: [{ move: 'jumpCatch', at: 1.5 }, { move: 'rollOver', at: 3.4 }] }),\n" +
    "    prop(CARD.ball, [0.55, 0, 1.95], { scale: 0.4, motion: { type: 'bounce', to: [1.55, 0, 2.15], hops: 2, height: 0.9, start: 1.0 } }),");
// 13) outro: twirl and a jump in the thank-you
rep("{ move: 'cheer', at: 6.4 }, { move: 'wave', at: 9.0, hand: 'left' }] }),", "{ move: 'twirl', at: 6.0 }, { move: 'jump', at: 8.6 }, { move: 'wave', at: 10.2, hand: 'left' }] }),");
rep("{ move: 'excitedHop', at: 6.6 }, { move: 'tailWag', at: 9.2 }] }),", "{ move: 'rollOver', at: 6.3 }, { move: 'jumpCatch', at: 8.8 }, { move: 'tailWag', at: 10.4 }] }),");
fs.writeFileSync(f, s);
console.log('direction updated');
