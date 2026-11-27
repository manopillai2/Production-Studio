// Project 05 round 2: approve + save the new assets, drop the reused ones, and point every shot at the new assets.
const B = 'http://localhost:5175', EP = 16;
const call = async (m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${u}: ${j.error}`); return j; };
if (false) await call('PUT', '/api/cards/51', { description: 'Mango, Mira\'s chubby puppy: plush cream fur with bright tangerine patches on his back and around one eye, a sky-blue patch around the other eye, one tangerine ear and one sky-blue ear, big glossy brown eyes, pink nose, rosy cheeks, happy open smile, and a short fluffy pom-pom tail. Walks on four short legs.' });
const out = [];
for (const id of []) {
  await call('POST', `/api/cards/${id}/approve`);
  const r = await call('POST', `/api/cards/${id}/save-to-world`);
  out.push(`${id} ${r.card.name}: ${r.card.status}, My World item ${r.card.item_id} ${r.card.library?.version_label}`);
}
// Remove the reused library assets from this project (the user wants everything new).
for (const id of [53, 54, 55]) { await call('POST', `/api/cards/${id}/unapprove`).catch(() => {}); await call('POST', `/api/cards/${id}/new-design`).catch(() => {}); await call('DELETE', `/api/cards/${id}`); out.push(`${id} removed from the project (reused asset)`); }
// Shots: old reused ids -> new assets.
const map = { 53: 56, 54: 57, 55: 58 };
const scene = await call('GET', `/api/episodes/${EP}/scene`);
let n = 0;
for (const s of scene.shots) {
  const setting = map[s.setting?.card_id] ? { ...s.setting, card_id: map[s.setting.card_id] } : s.setting;
  const actors = s.actors.map((a) => (map[a.card_id] ? { ...a, card_id: map[a.card_id] } : a));
  if (JSON.stringify(setting) !== JSON.stringify(s.setting) || JSON.stringify(actors) !== JSON.stringify(s.actors)) { await call('PUT', `/api/scene-shots/${s.id}`, { setting, actors }); n++; }
}
out.push(`${n} shots switched to the new meadow / kite / balloons`);
console.log(out.join('\n'));
