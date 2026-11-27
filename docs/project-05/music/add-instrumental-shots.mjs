// Add shots for the long instrumental parts of the Suno song (they start at fixed times, not at a lyric line).
const B = 'http://localhost:5175', EP = 16;
const call = async (m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${u}: ${j.error}`); return j; };
const MEADOW = { card_id: 53, scale: 1.2 };
const mira = (pos, motion, actions, extra = {}) => ({ card_id: 50, pos, rot: [0, 0, 0], scale: 0.75, motion: motion || { type: 'none' }, actions, ...extra });
const mango = (pos, motion, actions, extra = {}) => ({ card_id: 51, pos, rot: [0, 0, 0], scale: 0.38, motion: motion || { type: 'none' }, actions, ...extra });
const balloons = (pos, motion) => ({ card_id: 55, pos, rot: [0, 0, 0], scale: 1.4, motion: motion || { type: 'sway', amount: 0.05, speed: 0.8 } });
const shots = [
  { title: 'Instrumental · dance in the sunset', line_from: 39, line_to: 39, start_override: 125.6, setting: MEADOW, lighting: { preset: 'sunset' },
    camera: { preset: 'orbit', size: 'full', transition: 'dissolve' },
    actors: [mira([-0.7, 0, 0.8], null, [{ move: 'dance', at: 0.3, seconds: 3.6 }, { move: 'spin', at: 4.4, seconds: 1.6 }, { move: 'cheer', at: 6.4, seconds: 2.4 }], { look_at: 1 }),
      mango([0.7, 0, 0.9], null, [{ move: 'excitedHop', at: 0.9, seconds: 2 }, { move: 'tailWag', at: 3.4, seconds: 2 }, { move: 'playBow', at: 5.9, seconds: 2.2 }], { turn_to: 0 }), balloons([2.2, 0, -1.2])], notes: 'Instrumental break: they dance together while the camera circles.' },
  { title: 'Instrumental · a walk through the meadow', line_from: 43, line_to: 43, start_override: 154.0, setting: MEADOW, lighting: { preset: 'sunset' },
    camera: { preset: 'pan', size: 'wide', amount: 1.2, transition: 'dissolve' },
    actors: [mira([-2.6, 0, 0.9], { type: 'path', to: [-0.2, 0, 1.1], start: 0.3 }, [{ move: 'wave', at: 5.2, seconds: 2.4, hand: 'right' }]),
      mango([-1.4, 0, 0.5], { type: 'path', to: [1.0, 0, 0.7], start: 0.8 }, [{ move: 'tailWag', at: 4.6, seconds: 2 }])], notes: 'They walk side by side across the meadow (walk clips).' },
  { title: 'Instrumental · play together', line_from: 43, line_to: 43, start_override: 161.0, setting: MEADOW, lighting: { preset: 'sunset' },
    camera: { preset: 'group', size: 'full', transition: 'cut' },
    actors: [mira([-0.6, 0, 1.0], null, [{ move: 'hop', at: 0.4, seconds: 2 }, { move: 'clap', at: 3.0, seconds: 2 }, { move: 'spin', at: 5.2, seconds: 1.6 }], { look_at: 1 }),
      mango([0.7, 0, 0.9], null, [{ move: 'playBow', at: 1.0, seconds: 2.2 }, { move: 'spin', at: 3.8, seconds: 1.6 }, { move: 'excitedHop', at: 5.0, seconds: 1.8 }], { turn_to: 0 }), balloons([2.0, 0, -1.4])], notes: 'Playtime before the final chorus.' },
  { title: 'Outro · goodbye wave', line_from: 47, line_to: 47, start_override: 186.2, setting: MEADOW, lighting: { preset: 'sunset' },
    camera: { preset: 'wide', size: 'full', transition: 'dissolve' },
    actors: [mira([-0.6, 0, 1.0], null, [{ move: 'wave', at: 0.4, seconds: 2.4, hand: 'right' }, { move: 'bow', at: 3.6, seconds: 2 }, { move: 'wave', at: 7.0, seconds: 2.4, hand: 'left' }, { move: 'cheer', at: 10.0, seconds: 2.4 }]),
      mango([0.6, 0, 1.0], null, [{ move: 'pawRaise', at: 1.0, seconds: 2 }, { move: 'tailWag', at: 4.0, seconds: 2 }, { move: 'nod', at: 7.6, seconds: 1.6 }, { move: 'excitedHop', at: 10.4, seconds: 2 }]),
      balloons([1.9, 0, -1.0], { type: 'rise', amount: 2.5, duration: 9, delay: 1 })], notes: 'Goodbye to the viewer while the balloons float up.' },
  { title: 'Outro · final view (end card)', line_from: 47, line_to: 47, start_override: 199.0, setting: MEADOW, lighting: { preset: 'sunset' },
    camera: { preset: 'tilt-up', size: 'wide', transition: 'dissolve' },
    actors: [mira([-0.5, 0, 0.6], null, [{ move: 'wave', at: 0.6, seconds: 2.4, hand: 'right' }, { move: 'stretch', at: 4.0, seconds: 3 }], { look_at: 1 }),
      mango([0.5, 0, 0.6], null, [{ move: 'headTilt', at: 1.2, seconds: 2 }, { move: 'tailWag', at: 4.6, seconds: 2 }], { turn_to: 0 })], notes: 'The camera looks up to the sunset sky under the end card.' },
];
for (const s of shots) {
  const created = await call('POST', `/api/episodes/${EP}/scene-shots`, { title: s.title });
  await call('PUT', `/api/scene-shots/${created.id}`, s);
}
// order every shot by when it starts
const scene = await call('GET', `/api/episodes/${EP}/scene`);
const lines = scene.timing.lines;
const startOf = (s) => (s.start_override != null ? s.start_override : (lines[s.line_from]?.start ?? 0));
const ordered = [...scene.shots].sort((a, b) => startOf(a) - startOf(b) || a.position - b.position);
await call('POST', `/api/episodes/${EP}/scene-shots/reorder`, { ids: ordered.map((s) => s.id) });
const after = await call('GET', `/api/episodes/${EP}/scene`);
console.log(after.shots.length, 'shots'); after.shots.forEach((s, i) => console.log(i + 1, startOf(s).toFixed(1), s.title));
