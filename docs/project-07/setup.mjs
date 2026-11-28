// Project 07 "My Little Home": project, lyrics and Meshy asset cards.
// Steps: node setup.mjs episode | cards <ep> | prompts <ids…> | previews <ids…> | generate <ids…> | status <ep>
// Meshy budget approved by the user: 25 paid calls / 324 credits. Every paid step is logged in EXECUTION-LOG.md.
const B = 'http://localhost:5175';
const call = async (m, u, b, h = {}) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${u}: ${j.error}`); return j; };
const [step, ...rest] = process.argv.slice(2);
const REF = { mode: 'world' };

const L = (en, cue) => ({ ta: '', en, cue });
const SECTIONS = [
  { type: 'intro', label: 'Opening Chorus', lines: [
    L('Mommy, Mommy, what is this?', '[Baby] Living room. The child tugs Mommy\'s hand and points, curious.'),
    L('Tell me, tell me, what is this?', '[Baby] The child bounces on the spot, looking up at Mommy.') ] },
  { type: 'verse', label: 'Learning 1 – Sofa', lines: [
    L('This is a sofa, soft and wide!', '[Mommy] Mommy kneels and presents the sofa with an open hand.'),
    L('Oh, a sofa! Sofa, sofa!', '[Baby] The child points at the sofa on each "sofa".'),
    L('Sit, sit, sit by my side!', '[Together] They sit side by side on the sofa.') ] },
  { type: 'verse', label: 'Learning 2 – Television', lines: [
    L('This is a TV, look and see!', '[Mommy] Mommy presents the TV; its screen lights up.'),
    L('Oh, a TV! TV, TV!', '[Baby] The child points at the TV on each "TV".'),
    L('Sing a little song with me!', '[Together] A singing star on the screen; they sway together.') ] },
  { type: 'verse', label: 'Learning 3 – Bed', lines: [
    L('This is a bed, soft and sweet!', '[Mommy] Bedroom. Mommy presents the bed.'),
    L('Oh, a bed! Bed, bed!', '[Baby] The child pats the bed on each "bed".'),
    L('Rest your head and go to sleep!', '[Together] The child lies down, head on the pillow; Mommy tucks the blanket.') ] },
  { type: 'verse', label: 'Learning 4 – Fan', lines: [
    L('This is a fan, round and round!', '[Mommy] Mommy switches the fan on; the blades start to spin.'),
    L('Oh, a fan! Fan, fan!', '[Baby] The child points at the fan on each "fan".'),
    L('Round and round and round it goes!', '[Together] The child twirls round in the breeze while the fan spins.') ] },
  { type: 'verse', label: 'Learning 5 – Refrigerator', lines: [
    L('This is a fridge, nice and cold!', '[Mommy] Kitchen. Mommy opens the fridge door; a cool light inside.'),
    L('Oh, a fridge! Fridge, fridge!', '[Baby] The child points at the fridge on each "fridge".'),
    L('Cold, cold, cold inside!', '[Together] The child shivers happily, hugging itself.') ] },
  { type: 'verse', label: 'Learning 6 – Cup', lines: [
    L('This is a cup, take a sip!', '[Mommy] Mommy hands the child a cup.'),
    L('Oh, a cup! Cup, cup!', '[Baby] The child holds the cup up on each "cup".'),
    L('Sip, sip, sip, sip, sip!', '[Together] The child sips; Mommy smiles.') ] },
  { type: 'outro', label: 'Ending Chorus', lines: [
    L('Mommy, Mommy, now I know!', '[Baby] The child hugs Mommy.'),
    L('Sofa, TV, bed and fan,', '[Baby] Recap: each object as it is named.'),
    L('Fridge and cup — yes, I can!', '[Baby] Recap, then the child cheers.'),
    L('Learn and play, every day,', '[Together] Dancing together.'),
    L('Hip, hip, hip, hooray!', '[Together] A happy jump on "hooray".') ] },
];

// Model rules from My World: one object on a plain background; characters standing straight, arms away from the body,
// legs apart, five separated fingers, a small softly closed PAINTED mouth, nothing hanging over the legs.
const CHAR_RULES = 'Full body, standing straight facing forward, arms held away from the body, legs apart with a clear gap, five separated slightly spread fingers on each hand, a small softly closed painted mouth (not carved open). Alone on a plain light background.';
const CARDS = [
  ['character', 'Mommy', `A warm, kind young mother for a toddler song: soft round face, big warm brown eyes with glossy catchlights, gentle eyebrows, rosy cheeks, warm light-brown skin, dark brown hair in a soft round bun on top with two soft clumps framing her face. She wears a sunny-yellow cardigan over a coral-pink T-shirt with a small white heart, light-blue jeans rolled at the ankle and white sneakers. Modest stylised adult proportions, slightly larger head, gentle and reassuring. ${CHAR_RULES}`],
  ['character', 'Little Leo', `A three-year-old toddler boy, Mommy's son, adorable and curious: big round head, chubby rosy cheeks, huge sparkling brown eyes, warm light-brown skin, a fluffy tousled mop of dark brown curls. He wears a sunflower-yellow T-shirt under sky-blue dungaree shorts with a big yellow star on the bib pocket, white ankle socks and bright red sneakers. Short chubby toddler limbs, compact torso. ${CHAR_RULES}`],
  ['prop', 'Sofa', 'A cosy two-seater sofa for a family living room, sized for a mother and toddler: plump rounded turquoise velvet seat and backrest, soft rolled arms, a flat smooth seat cushion with nothing on it, one coral and one yellow round cushion tucked at the two arm corners, short light-wood tapered feet. Rounded, toy-like, premium fabric with visible soft seams. Alone, centred, on a plain light background. No people, no animals.'],
  ['prop', 'Bed', 'A cosy single child\'s bed: rounded light-wood frame, a soft rounded powder-blue headboard shaped like a puffy cloud, a smooth flat mattress with a lilac quilt covered in small yellow stars neatly folded back at the top, one plump white pillow. Low and toddler-sized. Rounded, soft, premium fabric. Alone, centred, on a plain light background. No people, no animals, no toys.'],
  ['prop', 'Teddy Bear', 'A small cuddly teddy bear plush toy sitting upright: honey-brown soft fur, round ears with cream insides, a cream muzzle with a stitched smile and black button eyes, a red ribbon bow at the neck, chubby arms and legs. Soft, plush, toy-like. Alone, centred, on a plain light background.'],
  ['prop', 'Potted Plant', 'A cheerful indoor potted plant: a round glossy coral-pink ceramic pot with a white band, holding a bushy rounded plant with big soft heart-shaped bright green leaves. Clean, rounded, toy-like. Alone, centred, on a plain light background. No people, no animals.'],
  ['prop', 'Fruit Bowl', 'A shallow round white ceramic fruit bowl with a mint-green rim, filled with shiny red apples, two yellow bananas, oranges and a bunch of green grapes. Clean, bright, appealing, toy-like. Alone, centred, on a plain light background. No people, no animals.'],
];

if (step === 'episode') {
  const ep = await call('POST', '/api/episodes', {
    title: 'My Little Home', language: 'en', target_duration: 165,
    theme: 'Inside a warm family home, a little child explores the living room, bedroom and kitchen with Mommy and learns six household objects.',
    learning_goals: 'Recognise and say six household objects: sofa, TV, bed, fan, fridge, cup. Pattern: Mommy introduces, the child acknowledges and repeats, the picture reinforces.',
    notes: 'Project 07. Meshy budget: 25 paid calls / 324 credits (approved 27 Nov 2026). Song: the user\'s own (~2:45), name to follow.',
  });
  const ly = await call('POST', `/api/episodes/${ep.id}/lyrics`, { title: 'My Little Home – final lyrics', sections: SECTIONS, source: 'manual' });
  await call('POST', `/api/lyrics/${ly.id}/approve`);
  console.log(JSON.stringify({ episode: ep.id, number: ep.number, lyrics: ly.id }));
}
if (step === 'cards') {
  const EP = +rest[0]; const out = {};
  for (const [kind, name, description] of CARDS) {
    const c = await call('POST', `/api/episodes/${EP}/cards`, { kind, name, description });
    if (c.status === 'match') await call('POST', `/api/cards/${c.id}/new-design`); // always a new design
    out[name] = c.id;
  }
  console.log(JSON.stringify(out));
}
const ids = rest.map(Number);
if (step === 'prompts') for (const id of ids) { const r = await call('POST', `/api/cards/${id}/draft-prompt`, { reference: REF }); console.log(`\n== ${id} ${r.name} (${r.prompt.length} chars)\n${r.prompt}`); }
if (step === 'rig') for (const id of ids) { const r = await call('POST', `/api/cards/${id}/rig-type`, { mode: 'offline' }); console.log(id, r.name, r.rig_type); }
if (step === 'previews') for (const id of ids) { const r = await call('POST', `/api/cards/${id}/meshy-preview`, { confirm: true, rig: process.env.RIG === '1', rig_type: 'biped' }, { 'X-User-Action': 'preview-in-meshy' }); console.log(id, r.name, 'preview started'); }
if (step === 'generate') for (const id of ids) {
  const H = { 'Mommy': 1.62, 'Little Leo': 0.95 };
  const c = await call('GET', `/api/cards/${id}`);
  const rig = c.kind === 'character';
  const r = await call('POST', `/api/cards/${id}/generate`, { confirm: true, from_preview: true, rig, rig_type: rig ? 'biped' : 'none', height_meters: H[c.name] }, { 'X-User-Action': 'generate-in-meshy' });
  console.log(id, r.name, r.status);
}
if (step === 'status') { const cs = await call('GET', `/api/episodes/${rest[0]}/cards`); for (const c of cs) console.log(c.id, c.kind.padEnd(9), c.name.padEnd(14), c.status, c.preview?.image_path || '', c.model_path || '', c.error || ''); }
