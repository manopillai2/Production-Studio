// Quick visual test of the playground equipment and the riding poses (4 shots over the first lyric lines).
import { cards, replaceShots, CARD } from './shotlib.mjs';
await cards();
const PG = { card_id: CARD.playground, scale: 1 };
const mira = (extra) => ({ card_id: CARD.mira, pos: [0, 0, 0], scale: 0.75, ...extra });
const mango = (extra) => ({ card_id: CARD.mango, pos: [0, 0, 0], scale: 0.38, ...extra });
const r = await replaceShots([
  { title: 'TEST seesaw', line_from: 0, line_to: 0, setting: { ...PG, equipment: [{ type: 'seesaw', pos: [0, 0, 0], rot_y: 0, period: 2.4 }] },
    actors: [mira({ pos: [-1.3, 0, 0], ride: { equip: 0, seat: 'a' }, actions: [{ move: 'seesawRide', at: 0, seconds: 2.4, repeats: 8, hold: true }] }),
             mango({ pos: [1.3, 0, 0], ride: { equip: 0, seat: 'b', lift: 0.02 }, actions: [{ move: 'dogSit', at: 0, seconds: 20, hold: true }] })],
    camera: { preset: 'group', size: 'full' }, lighting: { preset: 'day' } },
  { title: 'TEST swing', line_from: 1, line_to: 1, setting: { ...PG, equipment: [{ type: 'swing', pos: [0, 0, -0.5], rot_y: 0 }] },
    actors: [mira({ pos: [-0.62, 0, -0.5], ride: { equip: 0, seat: 'a' }, actions: [{ move: 'swingRide', at: 0, seconds: 2.6, repeats: 8, hold: true }] }),
             mango({ pos: [0.62, 0, -0.5], ride: { equip: 0, seat: 'b', lift: 0.02 }, actions: [{ move: 'dogSit', at: 0, seconds: 20, hold: true }] })],
    camera: { preset: 'group', size: 'full' }, lighting: { preset: 'day' } },
  { title: 'TEST slide', line_from: 2, line_to: 2, setting: { ...PG, equipment: [{ type: 'slide', pos: [0, 0, -1.5], rot_y: 0 }] },
    actors: [mira({ pos: [0, 0, 0], ride: { equip: 0, seat: 'top', at: 0.6, dur: 1.4 }, actions: [{ move: 'slideRide', at: 0, seconds: 6, hold: true }] }),
             mango({ pos: [1.2, 0, 1.6], actions: [{ move: 'excitedHop', at: 0.5 }] })],
    camera: { preset: 'wide', size: 'full' }, lighting: { preset: 'day' } },
  { title: 'TEST merry-go-round', line_from: 3, line_to: 3, setting: { ...PG, equipment: [{ type: 'merry-go-round', pos: [0, 0, 0], speed: 0.35 }] },
    actors: [mira({ pos: [0.8, 0, 0], ride: { equip: 0, seat: 'a' }, actions: [{ move: 'merryRide', at: 0, seconds: 4, repeats: 4, hold: true }] }),
             mango({ pos: [-0.8, 0, 0], ride: { equip: 0, seat: 'b', lift: 0.02 }, actions: [{ move: 'dogSit', at: 0, seconds: 20, hold: true }] })],
    camera: { preset: 'group', size: 'full' }, lighting: { preset: 'day' } },
]);
console.log(r.map((s) => `${s.id} ${s.title}`).join('\n'));
