// Project 06 step 2: new sceneries and props in Meshy (Mira and Mango are reused from Project 05).
// Steps: cards → prompts (Claude, World Style) → previews (~3 credits each) → [look at them] → 3D from the preview (~30 each).
const B = 'http://localhost:5175', EP = 17;
const call = async (m, u, b, h = {}) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(`${u}: ${j.error}`); return j; };
const step = process.argv[2]; const ids = process.argv.slice(3).map(Number);
const REF = { mode: 'world' };
const NO = 'No characters, no animals, no people.';
const CARDS = [
  ['location', 'Rainbow Playground', `A bright, colourful children's playground area for a cartoon song, about 16 m across, packed with colour all around the edge but with a wide flat open play floor in the middle (rainbow soft-play rubber tiles in big curved stripes of cherry red, tangerine, sunshine yellow, leaf green, sky blue and lilac). Around the edge: a low candy-striped picket fence, flower boxes overflowing with pink, yellow and purple flowers, round topiary bushes, a few small bright benches and lamp posts with round lamps. ${NO} No swings, slides or seesaws (they are added separately).`],
  ['location', 'Lollipop Candy Garden', `A sweet candy-themed garden for a cartoon song, about 16 m across, with a wide open lawn of soft mint-green grass in the middle and dense colour all around the edge: giant swirly lollipop trees in pink, turquoise and orange, a red-and-white candy-cane fence, gumdrop bushes in jewel colours, a pastel cupcake-shaped fountain at the back, round marshmallow stepping stones and patches of rainbow flowers. ${NO} No buildings.`],
  ['location', 'Mushroom Fairy Glade', `A magical fairy glade for a cartoon song, about 16 m across, with a soft round lawn in the middle and lots of colour all around: giant spotted mushrooms (red with white dots, purple with yellow dots, turquoise), glowing bell flowers, tiny fairy lanterns on curly stems, ferns, round mossy stones and a ring of small pastel toadstools. Warm, cosy and colourful. ${NO}`],
  ['prop', 'Rainbow Beach Ball', 'A big inflatable beach ball with six glossy panels in cherry red, tangerine, sunshine yellow, leaf green, sky blue and lilac, white round caps on top and bottom. Shiny, smooth, perfectly round.'],
  ['prop', 'Rainbow Hot-Air Balloon', 'A cheerful hot-air balloon: a big round envelope with bright vertical stripes in rainbow colours and a smiling sun face, little bunting flags around its middle, ropes down to a small woven basket with a red trim. Rounded, toy-like.'],
  ['prop', 'Candy Ice-Cream Cart', 'A cute ice-cream cart on two big wheels: a pastel mint cart with pink scalloped trim, a red-and-white striped umbrella on top, a giant ice-cream cone sign with three colourful scoops, little jars of sprinkles on the counter. Rounded, toy-like, bright.'],
  ['prop', 'Giant Rainbow Pinwheel', 'A giant garden pinwheel on a tall white and red striped pole: four big curved petals in bright rainbow colours (red, yellow, green, blue) with a round yellow centre button. Glossy, playful, rounded edges.'],
];
if (step === 'cards') {
  const out = {};
  for (const [kind, name, description] of CARDS) {
    const c = await call('POST', `/api/episodes/${EP}/cards`, { kind, name, description });
    if (c.status === 'match') await call('POST', `/api/cards/${c.id}/new-design`); // always a new design for Project 06
    out[name] = c.id;
  }
  console.log(JSON.stringify(out));
}
if (step === 'prompts') for (const id of ids) { const r = await call('POST', `/api/cards/${id}/draft-prompt`, { reference: REF }); console.log(`\n== ${id} ${r.name} (${r.prompt.length} chars)\n${r.prompt}`); }
if (step === 'previews') for (const id of ids) { const r = await call('POST', `/api/cards/${id}/meshy-preview`, { confirm: true }, { 'X-User-Action': 'preview-in-meshy' }); console.log(id, r.name, 'preview started'); }
if (step === 'generate') for (const id of ids) { const r = await call('POST', `/api/cards/${id}/generate`, { confirm: true, from_preview: true }, { 'X-User-Action': 'generate-in-meshy' }); console.log(id, r.name, r.status); }
if (step === 'status') { const cs = await call('GET', `/api/episodes/${EP}/cards`); for (const c of cs) console.log(c.id, c.kind.padEnd(9), c.name.padEnd(24), c.status, c.preview?.image_path || '', c.model_path || ''); }
