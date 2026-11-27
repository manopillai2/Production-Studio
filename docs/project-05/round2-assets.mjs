// Project 05, round 2 (user feedback): no reused scenery/props — new meadow, new kite, new balloons; Mango with a new tail.
const B = 'http://localhost:5175', EP = 16;
const call = async (m, u, b, h = {}) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${u}: ${j.error}`); return j; };
const step = process.argv[2];
const REF = { mode: 'world' };
if (step === 'cards') {
  const add = async (kind, name, description) => { const c = await call('POST', `/api/episodes/${EP}/cards`, { kind, name, description }); if (c.status === 'match') await call('POST', `/api/cards/${c.id}/new-design`); return c.id; };
  const meadow = await add('location', 'Rainbow Flower Meadow', 'A colourful flower meadow play area for a children\'s song, about 14 m across: a soft rounded grassy platform with a wide open lawn in the middle for playing, ringed by big rounded flower clumps in bubblegum pink, sunshine yellow, tangerine, lilac and sky blue, a winding honey-cream path, a few round stepping stones, two small rounded boulders and a low curved hedge at the back. Bright, cheerful, clean. No characters, no animals, no people, no buildings, no water.');
  const kite = await add('prop', 'Rainbow Diamond Kite', 'A big diamond-shaped kite in rainbow segments (cherry red, tangerine, sunshine yellow, leaf green, sky blue, lilac) with a smiling sun badge in the middle, a long tail of colourful bow ribbons and a short string. Soft rounded edges, glossy fabric look.');
  const balloons = await add('prop', 'Rainbow Balloon Bunch', 'A bunch of six round glossy balloons in different bright colours (cherry red, tangerine, sunshine yellow, leaf green, sky blue, bubblegum pink) with curly ribbons gathered into one bow at the bottom. Cheerful, shiny, rounded.');
  console.log(JSON.stringify({ meadow, kite, balloons }));
}
if (step === 'prompts') {
  const [meadow, kite, balloons] = process.argv.slice(3).map(Number);
  for (const id of [meadow, kite, balloons]) { const r = await call('POST', `/api/cards/${id}/draft-prompt`, { reference: REF }); console.log(`\n== ${r.name}\n${r.prompt}`); }
  const r = await call('POST', '/api/cards/51/draft-prompt', { reference: REF, instruction: 'Revise the CURRENT Mango prompt. The user disliked the tail (it came out segmented and ringed like a caterpillar). Mango must have a SHORT, FLUFFY, soft plume tail like a small pom-pom, honey-cream with a tangerine tip, curving gently upward — smooth plush fur, no rings, no segments, no spiral. Also make him more colourful: brighter tangerine patches, a clearly visible turquoise collar with a sunshine-yellow star tag. Keep his face, ears (one tangerine, one sky-blue) and chubby body.' });
  console.log(`\n== Mango (revised)\n${r.prompt}`);
}
if (step === 'previews') {
  const ids = process.argv.slice(3).map(Number);
  for (const id of ids) {
    const body = id === 51 ? { confirm: true, rig: true, rig_type: 'quadruped' } : { confirm: true };
    const r = await call('POST', `/api/cards/${id}/meshy-preview`, body, { 'X-User-Action': 'preview-in-meshy' });
    console.log(r.id, r.name, r.preview_job?.status);
  }
}
