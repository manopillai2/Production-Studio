// Helpers to write Project 06 shots through the studio API (replace all shots of the project with a new list).
export const B = 'http://localhost:5175', EP = 17;
export const call = async (m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${u}: ${j.error}`); return j; };
export const CARD = { mira: null, mango: null, playground: 61, candy: 62, glade: 63, ball: 64, balloon: 65, cart: 66, pinwheel: 67 };
export async function cards() {
  const cs = await call('GET', `/api/episodes/${EP}/cards`);
  CARD.mira = cs.find((c) => c.name === 'Mira').id; CARD.mango = cs.find((c) => c.name === 'Mango').id;
  return CARD;
}
/** Replace every shot of Project 06 with `shots` (each {title, line_from, line_to, setting, actors, camera, lighting, start_override?, end_override?}). */
export async function replaceShots(shots) {
  const scene = await call('GET', `/api/episodes/${EP}/scene`);
  for (const s of scene.shots) await call('DELETE', `/api/scene-shots/${s.id}`);
  const out = [];
  for (const s of shots) {
    const c = await call('POST', `/api/episodes/${EP}/scene-shots`, { title: s.title });
    out.push(await call('PUT', `/api/scene-shots/${c.id}`, s));
  }
  return out;
}
