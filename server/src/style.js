// STYLE PROFILE — structured rules extracted from the World Style document. Every generation path uses it:
// Build Locally (geometry, palette, finish), Local AI (reference check + finish), Meshy (attached prompt), Claude (full text).
import { getSetting, setSetting } from './db.js';
import { channel } from './model.js';

// Named colours your World Style may use (matched in the text, longest names first).
export const NAMED = {
  'oat cream': '#EADCC0', 'oat-cream': '#EADCC0', ivory: '#FBF5E6', 'pale ivory': '#F5EEDB', cream: '#F7EEDC',
  'moss green': '#8BB174', 'moss-green': '#8BB174', 'pale moss': '#B9CFA2', 'dusty teal': '#6E9E9B', 'deep teal': '#2F6B6B', 'teal-brown': '#4A5A4E',
  'soft peach': '#F5C6A5', peach: '#F5BFA0', 'peach-pink': '#F4B3A6', 'petal pink': '#EFB2C2', 'dusty-pink': '#D9A3AE', 'dusty pink': '#D9A3AE',
  'lavender-gray': '#B4AEC4', 'lavender gray': '#B4AEC4', lavender: '#C3B4E0', apricot: '#E9A97A', 'muted apricot': '#D99B78',
  amber: '#D9922E', charcoal: '#383640', coral: '#EE8A78', 'golden yellow': '#F4C430', golden: '#F2B705', 'blue-gray': '#8FA0B3', 'pale blue': '#CFE6F5',
  // Bright, saturated colours
  'honey cream': '#FFE2A8', 'honey-cream': '#FFE2A8', 'snow white': '#FFFDF8', 'snow-white': '#FFFDF8', 'sunshine yellow': '#FFD23F',
  'leaf green': '#4CC35A', 'leaf-green': '#4CC35A', 'lime green': '#A6E04F', 'lime-green': '#A6E04F', turquoise: '#21C7C4',
  'sky blue': '#4FB9F7', 'sky-blue': '#4FB9F7', 'royal blue': '#3E6BE0', 'royal-blue': '#3E6BE0', 'coral pink': '#FF6F7D', 'coral-pink': '#FF6F7D',
  'bubblegum pink': '#FF7EC4', 'bubblegum-pink': '#FF7EC4', tangerine: '#FF9234', lilac: '#B98CF5', violet: '#8A5CF0', 'cherry red': '#F03E4E', 'cherry-red': '#F03E4E',
  magenta: '#E8409E',
};
const lc = (s) => String(s || '').toLowerCase();
const findColors = (s) => {
  const names = Object.keys(NAMED).sort((a, b) => b.length - a.length);
  const out = []; let t = lc(s);
  for (const n of names) { let i; while ((i = t.indexOf(n)) >= 0) { out.push({ name: n, hex: NAMED[n], at: i }); t = t.slice(0, i) + ' '.repeat(n.length) + t.slice(i + n.length); } }
  return out.sort((a, b) => a.at - b.at).filter((c, i, arr) => arr.findIndex((x) => x.hex === c.hex) === i).map(({ name, hex }) => ({ name, hex }));
};
const sentence = (text, re) => (text.split(/(?<=[.!?])\s+/).find((s) => re.test(lc(s))) || '');

/** Offline extraction. Returns the rules + a human-readable list of what was picked up. */
export function extractProfile(text, version = null) {
  const T = lc(text);
  const has = (re) => re.test(T);
  const detected = [];
  const note = (ok, label) => { if (ok) detected.push(label); return ok; };
  const base = findColors(sentence(text, /base colou?rs/));
  const accent = findColors(sentence(text, /bring out|richer/));
  const all = findColors(text);
  const pick = (...names) => { for (const n of names) if (NAMED[n] && T.includes(n)) return NAMED[n]; return null; };
  const roles = {
    // First name found wins: bright names are listed before the older muted ones.
    fur: pick('honey cream', 'honey-cream', 'oat cream', 'oat-cream', 'cream') || base[0]?.hex || '#EADCC0',
    fur_support: pick('snow white', 'snow-white', 'ivory', 'pale ivory', 'cream') || '#FBF5E6',
    inner_ear: pick('bubblegum pink', 'bubblegum-pink', 'peach-pink', 'petal pink', 'soft peach') || '#F4B3A6',
    iris: pick('teal-brown', 'deep teal', 'royal blue', 'charcoal') || '#3B4A48',
    nose: pick('coral pink', 'coral-pink', 'muted apricot', 'apricot', 'coral') || '#D99B78',
    cheeks: pick('bubblegum pink', 'bubblegum-pink', 'soft peach', 'peach', 'petal pink') || '#F5C6A5',
    accent: pick('golden yellow', 'sunshine yellow', 'golden', 'amber') || '#F4C430',
    foliage: pick('leaf green', 'leaf-green', 'moss green', 'moss-green') || '#8BB174',
    foliage_far: pick('turquoise', 'dusty teal') || '#6E9E9B',
    flowers: [pick('bubblegum pink', 'petal pink'), pick('tangerine', 'dusty-pink', 'dusty pink'), pick('lilac', 'soft peach', 'peach'), pick('sky blue', 'sky-blue'), pick('cherry red', 'cherry-red')].filter(Boolean),
    stone: pick('lilac', 'lavender-gray', 'lavender gray') || '#B4AEC4',
    soil: pick('tangerine', 'apricot') || '#C99A72',
    water: pick('turquoise', 'dusty teal') || '#6E9E9B',
    sun: pick('sunshine yellow', 'golden yellow', 'golden') || '#F4C430',
    moon: pick('pale ivory', 'ivory') || '#F5EEDB',
    sky_day: pick('sky blue', 'sky-blue', 'pale blue') || '#CFE6F5',
  };
  if (!roles.flowers.length) roles.flowers = ['#EFB2C2', '#F5C6A5'];
  const profile = {
    version, source: 'offline',
    palette: { base, accent, all },
    roles,
    finish: {
      fur: note(has(/satin/), 'Satin finish on fur') ? 0.55 : 0.8,
      eyes: note(has(/gloss[a-z]* (depth|on the eyes)|clear gloss|glossy depth/), 'Glossy eyes') ? 0.06 : 0.3,
      nose: note(has(/sheen on the nose/), 'Sheen on the nose') ? 0.32 : 0.6,
      foliage: has(/foliage a soft satin/) ? 0.55 : 0.75,
      rock: note(has(/smooth matte|matte surface/), 'Matte rocks') ? 0.92 : 0.85,
      water: note(has(/water a glossy|glossy finish/), 'Glossy water') ? 0.08 : 0.2,
    },
    proportions: {
      head: note(has(/oversized head/), 'Slightly oversized heads') ? 1.12 : 1,
      torso: note(has(/compact torso/), 'Compact torsos') ? 0.93 : 1,
      cheeks: note(has(/plush cheeks|full cheeks/), 'Plush cheeks') ? 1.25 : 1,
    },
    face: {
      iris: note(has(/irises|iris colou?r/), 'Visible coloured irises'),
      catchlights: note(has(/catchlight/), 'Eye catchlights'),
      eyelids: note(has(/eyelid/), 'Shaped eyelids'),
      muzzle: note(has(/muzzle/), 'Sculpted muzzle'),
    },
    features: {
      tufts: note(has(/tufts?/), 'Grouped fur tufts (cheeks, chest, tail)'),
      inset_ears: note(has(/inset inner|slightly inset|softly inset/), 'Inset ear interiors'),
      freckles: has(/freckle/), tooth: has(/tooth|teeth/), whiskers: has(/whisker/),
    },
    asymmetry: note(has(/asymmetr|uneven curves|sit a little higher/), 'Purposeful asymmetry') ? 0.08 : 0,
    scenery: {
      leaf_terrain: note(has(/curled leaf|giant .*leaf/), 'Leaf-shaped terrain with a path'),
      path: has(/path/),
      petal_flowers: note(has(/folded petals?|petal-shaped flowers/), 'Folded-petal flowers'),
      hill_layers: note(has(/layers of rolling hills|layer hills/), 'Layered hills, cooler with distance') ? 3 : 2,
      leaf_canopies: note(has(/leaf clusters|overlapping leaf/), 'Leaf-cluster tree canopies'),
      stones: has(/stones?/),
    },
    sky: {
      petal_rays: note(has(/petal-like rays/), 'Sun with thick petal-like rays'),
      cloud_lobes: note(has(/large rounded lobe/), 'Cloud: one large lobe + two trailing'),
      rainbow: has(/rainbow/),
    },
    uniqueness: {
      required: note(has(/distinct combination|own body shape|signature detail|recognize them/), 'Each character must be unique (signature combination)'),
    },
  };
  profile.detected = [...detected, `Palette: ${all.map((c) => c.name).join(', ') || 'default'}`];
  return profile;
}

export const styleVersion = () => channel().world_style_updated_at || 'default'; // version of the DOCUMENT
/** The active profile (re-extracted automatically whenever the World Style document changes). */
export function currentProfile() {
  const v = styleVersion();
  const saved = getSetting('world_style_profile', null);
  if (saved && saved.doc_version === v) return saved;
  const p = { ...extractProfile(channel().world_style || '', v), doc_version: v };
  setSetting('world_style_profile', p);
  return p;
}
/** Version id of the active rules (changes when the document OR the hand-edited profile changes). */
export const profileVersion = () => currentProfile().version;
export function saveProfile(edits) {
  const cur = currentProfile();
  const p = { ...cur, ...edits, doc_version: styleVersion(), version: `${styleVersion()} · edit ${new Date().toISOString()}`, source: 'edited' };
  setSetting('world_style_profile', p);
  return p;
}
/** Compact snapshot stored inside each recipe so a build is reproducible. */
export const snapshot = (p) => ({ version: p.version, palette: (p.palette?.all || []).map((c) => c.hex), roles: p.roles, finish: p.finish, proportions: p.proportions, face: p.face, features: p.features, asymmetry: p.asymmetry, scenery: p.scenery, sky: p.sky });

// ---------- palette check (used for Local AI reference images and imported/AI models) ----------
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const colorDistance = (a, b) => { const [x, y] = [rgb(a), rgb(b)]; return Math.sqrt(x.reduce((s, v, i) => s + (v - y[i]) ** 2, 0)); };
/** How well a set of colours fits the world palette: 0 (perfect) … 1 (unrelated). */
export function paletteFit(colors, profile) {
  const world = [...new Set([...Object.values(profile.roles).flat(), ...profile.palette.all.map((c) => c.hex)])].filter((h) => /^#[0-9a-f]{6}$/i.test(h));
  if (!colors.length || !world.length) return { score: 0, offenders: [] };
  const d = colors.map((c) => ({ c, d: Math.min(...world.map((w) => colorDistance(c, w))) }));
  const score = Math.min(1, d.reduce((s, x) => s + x.d, 0) / d.length / 160);
  return { score: +score.toFixed(2), offenders: d.filter((x) => x.d > 110).map((x) => x.c) };
}
