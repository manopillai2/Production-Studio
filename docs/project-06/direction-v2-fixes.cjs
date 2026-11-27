// Project 06 round 2 — Shot Doctor fixes after the new movement.
const fs = require('fs'); const path = require('path');
const f = path.join(__dirname, 'direction.mjs'); let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing: ' + a.slice(0, 90)); s = s.replace(a, () => b); };
// chase: start behind the seesaw and run round to the front (towards the camera)
rep("    mira([-1.0, 0, 3.0], { motion: { type: 'circle', center: [-0.5, 0, 0.9], turns: 0.5 } }),\n    mango([-2.4, 0, 2.6], { motion: { type: 'circle', center: [-0.5, 0, 0.9], turns: 0.5 }, look_at: undefined }),",
    "    mira([0.1, 0, -1.2], { motion: { type: 'circle', center: [-0.5, 0, 0.9], turns: 0.5 } }),\n    mango([1.1, 0, -1.0], { motion: { type: 'circle', center: [-0.5, 0, 0.9], turns: 0.5 }, look_at: undefined }),");
// slide shots: side view so the ladder climb, the top and the chute are all in the picture
rep("], { preset: 'group', size: 'full', yaw: -0.45, height: 0.5 }, day, null, st(15)),", "], { preset: 'wide', size: 'wide', yaw: -1.25, height: 0.6 }, day, null, st(15)),");
rep("], { preset: 'group', size: 'full', yaw: -0.5, height: 0.6 }, sunset, null, st(47)),", "], { preset: 'wide', size: 'wide', yaw: -1.3, height: 0.7 }, sunset, null, st(47)),");
// candy garden crane: wide, so the skip-in from the left is in the picture
rep("  ], { preset: 'crane', size: 'full', transition: 'iris' }, day, null, st(19)),", "  ], { preset: 'crane', size: 'wide', transition: 'iris' }, day, null, st(19)),");
// vary neighbouring framings
rep("  ], { preset: 'dolly-in', size: 'full', yaw: 0.35, transition: 'dissolve' }, sunset),", "  ], { preset: 'dolly-in', size: 'wide', yaw: 0.35, transition: 'dissolve' }, sunset),");
// end card: a slow pan instead of a still frame
rep("  ], { preset: 'wide', size: 'extreme-wide', height: 0.6, yaw: 0.1 }, sunset, 199.0, null),", "  ], { preset: 'pan', size: 'extreme-wide', amount: 0.6, height: 0.6, yaw: 0.1 }, sunset, 199.0, null),");
fs.writeFileSync(f, s); console.log('fixed');
