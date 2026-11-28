// Project 07: shorter character prompts (clothing must survive the 800-character Meshy limit), then show the exact
// text a preview would send (meshy-plan: no Meshy call).
const B = 'http://localhost:5175';
const call = async (m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${u}: ${j.error}`); return j; };
const P = {
  68: 'Stylized 3D cartoon young mother, kind and warm, full body. Modest adult proportions with a slightly larger head, soft round face, big warm brown eyes with catchlights, rosy cheeks, small softly closed painted mouth. Warm light-brown skin, dark brown hair in a neat round top bun. Wears a sunny-yellow cardigan over a coral-pink T-shirt, light-blue jeans and white sneakers. Five separated fingers on each hand.',
  69: 'Stylized 3D cartoon toddler boy, three years old, cute and curious, full body. Big round head, chubby rosy cheeks, huge glossy brown eyes, small softly closed painted mouth. Warm light-brown skin, fluffy dark brown curly hair. Wears a sunflower-yellow T-shirt, sky-blue dungaree shorts with a yellow star on the bib, white socks and red sneakers. Short chubby arms and legs. Five separated fingers on each hand.',
};
for (const [id, prompt] of Object.entries(P)) {
  await call('PUT', `/api/cards/${id}`, { prompt, rig_type: 'biped' });
  const p = await call('POST', `/api/cards/${id}/meshy-plan`, { rig: true, rig_type: 'biped' });
  console.log(`\n== ${id} (${p.prompt.length} chars, pose ${p.pose})\n${p.prompt}`);
}
