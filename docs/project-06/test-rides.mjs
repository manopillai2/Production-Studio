// Test shots for the riding poses: every ride, both characters, checked by tools/testing/clearance.mjs.
import { cards, replaceShots, CARD } from './shotlib.mjs';
await cards();
const PG = { card_id: CARD.playground, scale: 1 };
const mira = (extra) => ({ card_id: CARD.mira, pos: [0, 0, 0], scale: 0.75, ...extra });
const mango = (extra) => ({ card_id: CARD.mango, pos: [0, 0, 0], scale: 0.38, ...extra });
const hold = (move, seconds, extra = {}) => ({ move, at: 0, seconds, hold: true, ...extra });
const r = await replaceShots([
  { title: 'TEST seesaw', line_from: 0, line_to: 1, setting: { ...PG, equipment: [{ type: 'seesaw', pos: [0, 0, 0], rot_y: 0, period: 2.4, no_handle: 'b', wide_seat: 'b' }] },
    actors: [mira({ pos: [-1.3, 0, 0], ride: { equip: 0, seat: 'a' }, actions: [hold('seesawRide', 2.4, { repeats: 8 })] }),
             mango({ pos: [1.3, 0, 0], ride: { equip: 0, seat: 'b', lift: 0.02 }, actions: [hold('dogSit', 20)] })],
    camera: { preset: 'group', size: 'full' }, lighting: { preset: 'day' } },
  { title: 'TEST merry-go-round', line_from: 2, line_to: 3, setting: { ...PG, equipment: [{ type: 'merry-go-round', pos: [0, 0, 0], speed: 0.35 }] },
    actors: [mira({ pos: [0.8, 0, 0], ride: { equip: 0, seat: 'a' }, actions: [hold('merryRide', 4, { repeats: 4 })] }),
             mango({ pos: [-0.8, 0, 0], ride: { equip: 0, seat: 'b', lift: 0.02, back: 0.3 }, actions: [hold('dogSit', 20)] })],
    camera: { preset: 'group', size: 'full' }, lighting: { preset: 'day' } },
  { title: 'TEST swing', line_from: 4, line_to: 5, setting: { ...PG, equipment: [{ type: 'swing', pos: [0, 0, -0.5], rot_y: 0 }] },
    actors: [mira({ pos: [-0.62, 0, -0.5], ride: { equip: 0, seat: 'a' }, actions: [hold('swingRide', 2.6, { repeats: 8 })] }),
             mango({ pos: [0.62, 0, -0.5], ride: { equip: 0, seat: 'b', lift: 0.02 }, actions: [hold('dogSit', 20)] })],
    camera: { preset: 'group', size: 'full' }, lighting: { preset: 'day' } },
  { title: 'TEST slide', line_from: 6, line_to: 7, setting: { ...PG, equipment: [{ type: 'slide', pos: [0, 0, -1.5], rot_y: 0 }] },
    actors: [mira({ pos: [0, 0, 0], ride: { equip: 0, seat: 'top', climb: { at: 0.2, dur: 2.2 }, at: 3.4, dur: 1.5 }, actions: [{ move: 'climb', at: 0.2, seconds: 0.7, repeats: 3 }, { move: 'slideRide', at: 2.35, seconds: 3.2 }, { move: 'cheer', at: 6.2 }] }),
             mango({ pos: [1.2, 0, 2.2], actions: [{ move: 'excitedHop', at: 4.5 }] })],
    camera: { preset: 'wide', size: 'full' }, lighting: { preset: 'day' } },
]);
console.log(r.map((s) => `${s.id} ${s.title}`).join('\n'));
