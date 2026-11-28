// AI tool connections. Keys are stored server-side only (storage/studio.sqlite or server/.env)
// and never sent to the browser. Paid generation stays OFF until you switch it on.
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { getSetting, setSetting } from './db.js';
import { STORAGE_DIR } from './paths.js';
import { langName, isEnglish } from './langs.js';
import { MOVE_CATALOG } from '../../client/src/engine/moveCatalog.js';

export const TOOLS = [
  { id: 'claude', stage: 'assistant', label: 'Claude', key: 'ANTHROPIC_API_KEY', implemented: true, signup: 'https://console.anthropic.com/settings/keys',
    purpose: 'The assistant in every stage: writes and tweaks lyrics, suggests characters & scenery, develops character designs, recommends music.' },
  { id: 'gptImage', stage: 'cast', label: 'GPT Image (OpenAI)', key: 'OPENAI_API_KEY', implemented: true, signup: 'https://platform.openai.com/api-keys',
    purpose: 'Generates character and scenery reference images from the design prompt.', note: 'Implemented, not yet tested against a live key.' },
  { id: 'meshy', stage: 'cast', label: 'Meshy (design images + 3D models)', key: 'MESHY_API_KEY', implemented: true, signup: 'https://www.meshy.ai/settings/api',
    purpose: 'Creates design images from your references + world style, and turns designs into textured 3D models (.glb / .fbx for Blender). Needs a paid Meshy plan.',
    note: 'Implemented, not yet tested against a live key.' },
  { id: 'elevenMusic', stage: 'music', label: 'Eleven Music', key: 'ELEVENLABS_API_KEY', implemented: false, signup: 'https://elevenlabs.io/',
    purpose: 'Sings your final lyrics in the chosen music direction.' },
  { id: 'suno', stage: 'music', label: 'Suno', key: 'SUNO_API_KEY', implemented: false, signup: 'https://suno.com/',
    purpose: 'Alternative song generator. Use “Copy lyrics + prompt” until connected.' },
  { id: 'kling', stage: 'animation', label: 'Kling', key: 'KLING_API_KEY', implemented: false, signup: 'https://klingai.com/',
    purpose: 'Animates a storyboard shot from its reference frame and motion notes.' },
  { id: 'veo', stage: 'animation', label: 'Veo (Google)', key: 'GOOGLE_API_KEY', implemented: false, signup: 'https://aistudio.google.com/',
    purpose: 'Animates a storyboard shot.' },
  { id: 'runway', stage: 'animation', label: 'Runway', key: 'RUNWAY_API_KEY', implemented: false, signup: 'https://runwayml.com/',
    purpose: 'Animates a storyboard shot.' },
];

// API keys live in storage/secrets.json (git-ignored), NEVER in the database — the database is pushed to git.
const SECRETS = path.join(STORAGE_DIR, 'secrets.json');
const readKeys = () => { try { return JSON.parse(fs.readFileSync(SECRETS, 'utf8')).keys || {}; } catch { return {}; } };
const writeKeys = (keys) => fs.writeFileSync(SECRETS, JSON.stringify({ keys }, null, 2), 'utf8');
const conn = () => ({ ...getSetting('connections', { paidEnabled: null }), keys: readKeys() });

/** One-time move of keys saved by older versions from the database into secrets.json. Returns true if anything moved. */
export function migrateKeysOutOfDb() {
  const stored = getSetting('connections', null);
  if (!stored?.keys || !Object.keys(stored.keys).length) return false;
  writeKeys({ ...stored.keys, ...readKeys() });
  setSetting('connections', { paidEnabled: stored.paidEnabled ?? null });
  return true;
}
const keyValue = (k) => conn().keys?.[k] || process.env[k] || '';
export const keyFor = keyValue;
export const paidEnabled = () => {
  const c = conn();
  return c.paidEnabled ?? String(process.env.ENABLE_PAID_GENERATION).toLowerCase() === 'true';
};

export function providerStatus() {
  const c = conn();
  return {
    paidGenerationEnabled: paidEnabled(),
    providers: TOOLS.map((t) => {
      const v = keyValue(t.key);
      const configured = Boolean(v);
      const state = !t.implemented ? 'placeholder' : !configured ? 'not-configured' : !paidEnabled() ? 'disabled' : 'active';
      return {
        id: t.id, label: t.label, stage: t.stage, purpose: t.purpose, note: t.note, signup: t.signup, envKey: t.key,
        implemented: t.implemented, configured, state,
        masked: configured ? `••••${v.slice(-4)}` : null,
        source: c.keys?.[t.key] ? 'app' : configured ? 'server/.env' : null,
      };
    }),
  };
}

export function saveConnection({ id, key, paidEnabled: pe }) {
  if (id) {
    const t = TOOLS.find((x) => x.id === id);
    if (!t) throw new ProviderError('Unknown tool.');
    const keys = readKeys();
    if (key) keys[t.key] = String(key).trim();
    else delete keys[t.key];
    writeKeys(keys);
  }
  if (typeof pe === 'boolean') setSetting('connections', { paidEnabled: pe });
  return providerStatus();
}

export class ProviderError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function isActive(id) { return providerStatus().providers.find((p) => p.id === id)?.state === 'active'; }

function assertActive(id) {
  const t = TOOLS.find((x) => x.id === id);
  if (!t.implemented) throw new ProviderError(`${t.label} is a placeholder connection in this version. Use the copy/import options for now.`, 501);
  if (!keyValue(t.key)) throw new ProviderError(`${t.label} is not connected. Add its API key on the Connections page.`, 400);
  if (!paidEnabled()) throw new ProviderError('Paid generation is switched off. Turn it on in Connections to let the assistant run.', 400);
}

// ---------------- Claude ----------------
async function claudeJSON(system, history, userContent) {
  assertActive('claude');
  const client = new Anthropic({ apiKey: keyValue('ANTHROPIC_API_KEY') });
  const messages = [...history.slice(-12).map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: userContent }];
  while (messages.length && messages[0].role !== 'user') messages.shift();
  let res;
  try {
    // Streamed, so long answers (a full shot plan for a 3-4 minute song) can use a high max_tokens without HTTP timeouts.
    res = await client.beta.messages.stream({
      model: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system,
      messages,
    }).finalMessage();
  } catch (e) {
    if (e?.status === 401) throw new ProviderError('Claude rejected the API key. Check it on the Connections page.', 400);
    if (e?.status === 429) throw new ProviderError('Claude is rate-limiting requests right now. Wait a moment and try again.', 429);
    throw new ProviderError(`Claude request failed: ${e?.message || e}`, 502);
  }
  if (res.stop_reason === 'refusal') throw new ProviderError('Claude declined this request. Try rephrasing it.', 422);
  if (res.stop_reason === 'max_tokens') throw new ProviderError('Claude’s answer was too long and was cut off. Ask for less at once (for example fewer shots or shorter notes).', 502);
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  try {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = m ? m[1] : text;
    return JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
  } catch {
    throw new ProviderError('Claude replied in an unexpected format. Please try again.', 502);
  }
}

export async function lyricsAssistant({ channel, episode, lyrics, history, message, library, world }) {
  const secs = episode.target_duration || 60;
  const en = isEnglish(episode.language);
  const L = langName(episode.language);
  const lineShape = en
    ? '{"line": string (English, sung), "cue": string (what happens on screen)}'
    : `{"line": string (${L} in ${L} script — this is what is sung), "english": string (plain English meaning for the producer; NOT sung), "cue": string (what happens on screen, in English)}`;
  const system = `You are the lyrics assistant inside a production studio for "${channel.name}", a YouTube channel of ORIGINAL nursery rhymes for children aged 1–5.
Write simple, singable, joyful lyrics with rhyme, repetition and a catchy chorus. Never copy existing songs.
Song language: ${en ? 'English only.' : `${L} only. Use natural, simple, spoken-style ${L} that small children understand, written in ${L} script, rhyming in ${L}. For every line also give its English meaning so the producer can follow along (the English is never sung).`}
Target video length: about ${secs} seconds (≈ ${Math.max(4, Math.round(secs / 4))} sung lines at ~4 seconds per line, including repeated choruses).
Every line gets a short action cue in English describing what happens on screen (this drives the animation).
Recurring characters/places the channel already owns (prefer them when they fit): ${library || 'none yet'}.
Reply with ONLY a JSON object: {"reply": short friendly message in English saying what you did or answering the question, "lyrics": {"title": string, "sections": [{"type": "intro"|"verse"|"chorus"|"bridge"|"outro", "label": string, "lines": [${lineShape}]}]} or null}.
When you change or create lyrics, return the COMPLETE song. Use null only when the user just asks a question.${world ? `\n\n${worldText(world)}\nKeep the words, places, characters and mood consistent with this world.` : ''}`;
  const toAI = (sections) => sections.map((s) => ({ type: s.type, label: s.label, lines: s.lines.map((l) => (en ? { line: l.en, cue: l.cue } : { line: l.ta, english: l.en, cue: l.cue })) }));
  const ctx = lyrics ? `Current lyrics (version "${lyrics.title}"):\n${JSON.stringify({ title: lyrics.title, sections: toAI(lyrics.sections) })}` : 'There are no lyrics yet.';
  const out = await claudeJSON(system, history, `${ctx}\n\nProject: ${episode.title}.\n\nMy request: ${message}`);
  if (out.lyrics?.sections) {
    out.lyrics.sections = out.lyrics.sections.map((s) => ({
      type: s.type || 'verse', label: s.label || '',
      lines: (s.lines || []).map((l) => (en ? { ta: '', en: l.line ?? l.en ?? '', cue: l.cue || '' } : { ta: l.line ?? l.ta ?? '', en: l.english ?? l.en ?? '', cue: l.cue || '' })),
    }));
  }
  return out;
}

const imgBlocks = (bufs) => bufs.map((b) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: b.toString('base64') } }));
/**
 * The world rules for one Claude call, in the reference mode the user chose:
 *  world       — the World Style description + inspiration brief only (do not base anything on existing designs)
 *  world+cast  — that, plus the existing locked designs (stay consistent with them; new designs stay unique)
 *  new         — ONLY the description the user pasted for this request (something completely new)
 */
const worldText = (world) => {
  if (world?.mode === 'new') return `NEW DIRECTION FOR THIS REQUEST (the user's own description; follow it INSTEAD of the usual world style, and create something new that is not based on existing characters or designs):
${world.guide}`;
  const locked = world?.mode === 'world'
    ? '\nReference for this request: the world description only. Do NOT base anything on existing characters or designs (create fresh ones that follow the world style).'
    : `\nExisting locked designs in this world (stay consistent with them; new designs must share their rendering style but be clearly UNIQUE — different silhouette, colors and details from all of them):
${world?.locked?.length ? world.locked.map((x) => `- ${x}`).join('\n') : '- none yet'}`;
  return `WORLD STYLE GUIDE (compulsory: every design, prop, scenery, landscape, shot and word must follow it): ${world?.guide || ''}${inspirationText(world)}${locked}`;
};
const MESHY_FIELDS = `"meshy_prompt" (MAX 700 characters, for Meshy text-to-3D: describe ONLY this one subject as a 3D model — overall shape, proportions, distinctive silhouette, colors, materials, surface finish — written so it matches the world style yet is clearly unique; no background, no scene, no camera or lighting words), "texture_prompt" (MAX 700 characters, for Meshy texturing: exact colors with hex codes, materials and surface details in the world style)`;
const specFields = (kind) => (kind === 'character'
  ? `"description", "look" (shape, proportions, colors, clothing, distinctive features), "personality", "palette" (3-5 hex colors), "voice", "image_prompt" (detailed prompt for an image model: one character, full body, front 3/4 view, plain light background, rendered exactly in the world style), ${MESHY_FIELDS}, "search_terms" (3-5 words to search free 3D model sites)`
  : `"description", "look" (layout, key landmarks), "lighting", "palette" (3-5 hex colors), "image_prompt" (detailed prompt for a wide 16:9 establishing shot, no characters, rendered exactly in the world style), ${MESHY_FIELDS}, "search_terms" (3-5 words)`);

/** Reads the lyrics and returns everything that needs designing, each with a full first design. */
/** The user's inspiration brief (from reference screenshots of other channels): borrow ideas, never copy. */
const inspirationText = (world) => (world?.inspiration ? `
INSPIRATION BRIEF (written from the user's reference screenshots of videos they like; use it as INSPIRATION ONLY: take about 80% of these ideas — mood, palette feel, shapes, materials, lighting, framing, landscape — and make them your own inside this world. NEVER copy their characters, logos, text, brands or exact designs):
${world.inspiration}` : '');
/** Inspiration screenshots as image blocks, with an explicit "reference only" label. */
const inspirationBlocks = (world) => [
  ...(world?.inspirationImages?.length ? [
    { type: 'text', text: `The next ${world.inspirationImages.length} image(s) are the user's INSPIRATION screenshots from other videos (reference only: take about 80% of the ideas — look and feel, palette, shapes, light, framing — never copy their characters, logos, text or exact designs).${world.inspirationNotes?.length ? ` The user's notes on them: ${world.inspirationNotes.join(' | ')}` : ''}` },
    ...imgBlocks(world.inspirationImages)] : []),
  ...(world?.castImages?.length ? [
    { type: 'text', text: `The next ${world.castImages.length} image(s) are EXISTING designs in this world (for consistency of style; new designs must stay clearly different from them).` },
    ...imgBlocks(world.castImages)] : []),
];
/** A user message with the inspiration screenshots in front of the text (vision calls). */
const withInspiration = (world, text) => { const b = inspirationBlocks(world); return b.length ? [...b, { type: 'text', text }] : text; };

export async function suggestCast({ lyricsText, world, library }) {
  const system = `You are the art director of a children's animated nursery-rhyme channel. Read the lyrics and list everything that must be designed for the video: characters, locations (scenery) and the props that matter on screen.
${worldText(world)}
Library the channel already owns: ${library || 'none'}.
If a library item fits, REUSE it: set "reuse" to its exact library name and leave "spec" null.
Otherwise create a first design that follows the world style guide and is unique in this world.
Reply with ONLY JSON: {"items": [{"kind": "character"|"location"|"prop", "name": short name, "appears_in": quoted lyric line, "reuse": string|null, "spec": {${specFields('character')}} for characters, {${specFields('location')}} for locations/props, or null}]}.
Max 5 characters, 3 locations, 4 props.`;
  return claudeJSON(system, [], `Lyrics:\n${lyricsText}`);
}

const MESHY_RULES = `Meshy prompt rules: "meshy_prompt" max 700 characters, describes ONLY this single subject as a 3D model (shape, proportions, silhouette, colours, materials, signature features), in the studio's visual rules; no background, scene, camera or lighting words. "texture_prompt" max 500 characters: exact colours (hex), materials and surface details. Static pose only — no movement.`;

/** Stage 2 analysis: everything the song needs, where it is used, and a Meshy prompt for each. (Claude only — never Meshy.) */
/** The user's own ideas. They take priority over your own choices (but keep the world style). */
const userIdeas = (label, text) => (String(text || '').trim()
  ? `\nTHE USER'S OWN IDEAS FOR ${label} (follow them: they override your own choices wherever they conflict, but stay within the world style):\n${String(text).trim()}\n`
  : '');

export async function analyzeAssets({ lines, world, library, notes = {} }) {
  const system = `You are the art director of a preschool nursery-rhyme channel. Read the numbered lyric lines and list every static 3D asset the animation needs: characters, scenery (locations) and props.
${worldText(world)}${userIdeas('CHARACTERS', notes.characters)}${userIdeas('SCENERY (locations)', notes.scenery)}
If the user describes or names a character or place, include it (even if the lyrics only hint at it) and design it the way they describe.
My World library (reuse candidates): ${library || 'none'}. If a library item fits, set "reuse_name" to its exact name.
For every asset give: "usages" = the line numbers (0-based) where it appears or should be visible; "signature_features" for recurring characters (1-2 unmistakable features, e.g. one crescent-shaped ear and one golden front paw); and a first Meshy prompt.
${MESHY_RULES}
Reply with ONLY JSON: {"items": [{"kind": "character"|"location"|"prop", "name": string, "description": one sentence, "usages": [int], "signature_features": string, "reuse_name": string|null, "meshy_prompt": string, "texture_prompt": string}]}. Max 6 characters, 3 locations, 5 props.`;
  return claudeJSON(system, [], lines.map((l, i) => `${i}: ${l}`).join('\n'));
}

/** Decide which skeleton a character needs for Meshy rigging. Never calls Meshy. */
export async function rigAdvisor({ card }) {
  const system = `You are a 3D rigging supervisor for a preschool animated channel. Meshy can rig exactly two body plans:
- "biped": stands and walks on two legs like a person (cartoon people, upright animal characters that walk on two legs, robots with two legs).
- "quadruped": a four-legged animal that stands and walks on four legs (dog, cat, horse, cow, bunny/rabbit hopping on four paws, mouse on all fours, fox, lion, sheep…).
- "none": anything Meshy cannot rig: no legs or not a body (sun, moon, star, cloud, flower, vehicle, fish, bird in flight, snake, insect, blob or face-only characters). These keep simple procedural motion instead.
Decide from how THIS character is described and modelled (its description and Meshy prompt), not just the species: a bunny described hopping on four paws is "quadruped"; a bunny described standing upright and waving like a person is "biped". When it is a real animal and nothing says it stands upright, prefer how that animal naturally moves.
Reply with ONLY JSON: {"rig_type": "biped"|"quadruped"|"none", "reason": one short sentence, "height_meters": typical standing height of this character in metres (number) or null}.`;
  return claudeJSON(system, [], `Character: ${card.name}
Description: ${card.description || '-'}
Signature features: ${card.signature || '-'}
Meshy prompt: ${card.prompt || '-'}
The user's own notes about it (follow them, e.g. if they say it walks upright or on four legs): ${card.user_notes || '-'}`);
}

export async function refineMeshyPrompt({ card, world, instruction, notes, lyrics = [] }) {
  const system = `You write Meshy text-to-3D prompts for a preschool nursery-rhyme channel.
${worldText(world)}
${userIdeas(card.kind === 'location' ? 'SCENERY in this song' : card.kind === 'character' ? 'CHARACTERS in this song' : 'this song', notes)}${userIdeas(`"${card.name}" specifically`, card.user_notes)}
${MESHY_RULES}
Reply with ONLY JSON: {"reply": one short sentence, "meshy_prompt": string, "texture_prompt": string, "signature_features": string}.`;
  return claudeJSON(system, [], withInspiration(world, `Asset: ${card.name} (${card.kind}). Description: ${card.description || '-'}. Signature features: ${card.signature || '-'}.
Lyric lines where it appears (design it to fit them): ${lyrics.length ? `\n${lyrics.map((l) => `- ${l}`).join('\n')}` : '(not in the current lyrics)'}
Current Meshy prompt: ${card.prompt || '(none)'}
Current texture prompt: ${card.texture_prompt || '(none)'}
Request: ${instruction || 'Write the best Meshy prompts for this asset.'}`));
}

export async function designAssistant({ item, spec, history, message, channel, world, refImages = [], styleImages = [] }) {
  const isChar = item.kind === 'character';
  const system = `You are the ${isChar ? 'character' : 'set'} designer for "${channel.name}", a children's animated nursery-rhyme channel with ONE consistent, recognizable visual world.
${worldText(world)}
You develop "${item.name}" (${item.kind}) with the user. When several reference images of ${item.name} are given, combine them into ONE coherent design (take the best features of each). Keep everything the user did not ask to change.
Reply with ONLY JSON: {"reply": short message explaining the design or change, "spec": {${specFields(isChar ? 'character' : 'location')}}}. Always return the full spec.`;
  const text = `Current design spec:\n${JSON.stringify(spec || {})}\nItem description: ${item.description || '-'}
Attached images: ${refImages.length ? `the first ${refImages.length} are the user's reference images for ${item.name}` : 'no reference images for this item yet'}${styleImages.length ? `; the last ${styleImages.length} are locked designs from the world, for STYLE only (do not copy their characters)` : ''}.

My request: ${message}`;
  return claudeJSON(system, history, [...imgBlocks([...refImages, ...styleImages]), ...inspirationBlocks(world), { type: 'text', text }]);
}

export async function musicAssistant({ channel, episode, lyricsText, brief, history, message, world }) {
  const system = `You are the music director for "${channel.name}", a channel of original nursery rhymes for ages 1–5. This song is in ${langName(episode.language)}.
Recommend music directions that fit the lyrics and a ${episode.target_duration || 60}-second video. Mix Indian (Carnatic/folk) and Western kids-pop ideas where they suit.
Reply with ONLY JSON: {"reply": short message, "options": [{"title", "style", "tempo_bpm": number, "key", "time_signature", "mood", "instruments": [string], "vocal" (who sings and how), "structure" (e.g. "intro 4 bars, verse, chorus x2, outro"), "music_ai_prompt" (a ready-to-paste prompt for an AI song generator, without the lyrics)}]}. Give 3 options unless asked otherwise.${world ? `\n\n${worldText(world)}\nKeep the words, places, characters and mood consistent with this world.` : ''}`;
  const ctx = `Lyrics:\n${lyricsText}\n\nCurrent options: ${JSON.stringify(brief?.options || [])}`;
  return claudeJSON(system, history, `${ctx}\n\nMy request: ${message || 'Recommend music for this song.'}`);
}

/** Stage 4: propose a shot plan in the scene engine's own shot format. The caller validates every field. */
export async function shotDirector({ channel, episode, lines, assets, duration, world, message, current }) {
  const system = `You are the director of a short 3D animated nursery-rhyme video for "${channel.name}" (children aged 1–5), in ${langName(episode.language)}.
${world?.guide ? `${worldText(world)}\n` : ''}Plan the shots for the whole song using ONLY the approved 3D assets listed. Keep it calm, clear and readable for toddlers: one idea per shot, gentle motion, the singing subject easy to see. Vary the camera between shots, and repeat a look when the chorus repeats.
KIDS-FIRST DIRECTION (learned from our reviews; follow strictly):
- ONE clear action per shot: the one being sung at that moment, timed to the WORD (jump on each "up", nod on "yes", wave on "hello").
- At most THREE things to follow: the characters plus ONE object they use. Only props or equipment the lyric needs; no decoration props.
- The object the lyric names must be FULLY in the picture while it is sung about (balloons, kite).
- Gestures the lyric names (wave, clap) in a medium or full shot, so the hands are visible. Never a close-up that crops them.
- Characters face what they play with (a kite flies IN FRONT of them, the string to the raised hand), shown in profile or three-quarter view.
- Keep characters an arm's length apart; nobody blocks another character from the camera.
- Nothing may go through anything: riders sit ON seats, characters stand ON the floor.
- Bright day or golden light; the same action for the same chorus words every time, from new camera angles.
Every shot MUST have a setting: it is the landscape the characters live in. The setting model is scaled to a landscape ${16} m across (setting_scale multiplies that, 0.5–2.5), centred on the origin; optional setting_rot_y (radians) turns it and setting_offset [x,y,z] shifts it (negative y sinks it). Keep the same setting across consecutive shots unless the lyrics move to a new place, and keep lighting consistent with the song (a night song stays night).
Scene: units are metres. The camera sits on the +z side looking toward -z, and frames the characters automatically by their real size (see SHOT SIZE). Characters are 1.5 m tall at scale 1, props about 0.9 m, sky objects about 1.4 m. Ground actors stand ON the landscape surface automatically: give pos [x, 0, z] with x between -4 and 4 and z between -3 and 2 (y = height above the ground, normally 0). Sky actors (sun, moon, stars, clouds, birds…) use y 2.5–5 (height above the landscape) and z -3 to -6. Put characters where the landscape gives them something to do (on the hilltop, by the bridge, in the bedroom), group them so they read clearly, and turn them (rot_y) toward each other or the camera. Only stars and lights twinkle; characters sway, bounce, spin or stand.
Only cast assets that fit the line being sung — but if the director's note asks for a character in a shot (for example "dogs visible in the background"), follow the note: it overrides the lyric usage list.

WHAT EACH ACTOR CAN DO (three layers, all optional):
1. Travel/placement motion (pick one per actor; whole-body movement across the scene):
- none
- rise {amount: metres it rises (1–5), duration: seconds, delay: seconds}: comes UP INTO PLACE from below (a sun rising over a hill). Never use it for things that fly away.
- float {amount: metres it floats up (1–8), duration: seconds, delay: seconds before lift-off, dx: drift sideways}: floats UP AND AWAY from where it stands (balloons, bubbles, a kite lifting). Time the delay so it lifts off when the lyric says so.
- drift {dx: metres across the shot (-8–8), bob: 0–0.3, start: seconds to wait before moving}
- bounce {to: [x,y,z] end point, height: 0.2–1.2, hops: 1–8, start}
- twinkle {amount: 0.05–0.3, speed: 1–5}
- spin {speed: radians/s, 0.3–3}
- sway {amount: 0.03–0.2, speed: 0.5–3}
- path {to: [x,y,z], start}
- circle {center: [x,0,z], turns: 0.5–2, start}: walks around a point (e.g. circling the group); the radius is its distance from the centre
A character with a rig and a walk/run clip walks (or runs) with real steps while it travels on path/drift/bounce, at its natural pace, then stops and stands with a breathing idle. Use "start" to make one character set off after another (e.g. the second walks once the first arrives).
2. "actions": timed body actions for characters WITH a rig, each {"move": id, "at": seconds from the start of the shot, "seconds": length, "hand": "right"|"left" (optional), "repeats": n (optional)}. Only use the move ids listed for that asset. An action takes over the whole body while it plays, so schedule actions when the character is standing (after it arrives, or before it sets off). Give different characters different moves or different timings: never start the same move on two characters at the same moment.
Move ids: ${MOVE_CATALOG.map((m) => `${m.id} (${m.rig === 'any' ? 'any rig' : m.rig === 'quad' ? 'four-legged' : 'two-legged'}: ${m.desc})`).join('; ')}.
3. "look_at_card_id": the head keeps turning toward that character (rigged characters). "turn_to_card_id": the body turns to face that character once it is standing (after it arrives). Use these so characters react to each other.

HARD LIMITS of this engine — do not pretend to do these; list what you could not do in "cannot":
- Only the approved assets listed below exist. If the direction asks for characters that are not listed (e.g. a second mouse), say so in "cannot".
- Faces: characters blink and their mouths move with the singing automatically. No other facial expressions (no smiling on cue, no eye-rolls).
- No finger/hand contact or inverse kinematics: characters can reach out a hand ("greet"), but two hands never actually lock; place them about 0.8–1 m apart facing each other.
- Ears and tail move only on rigs that have those bones (four-legged rigs: tail wag, ear twitch). Two-legged rigs have no tail/ear bones.
- No word-level or beat-level sync: only the line start/end times below. Fit the story to them.
- The song is short: if the direction describes more scenes than lines/seconds allow, compress or merge them and say what was cut.
CAMERA = a move + a SHOT SIZE. Moves: wide (still, slow push-in), tilt-up (looks up a little), pan {amount: 0.5–3} (slides sideways), dolly-in (moves one size closer during the shot), closeup {target}, follow {target} (tracks one actor), orbit (slow half-circle), group (keeps everyone standing in frame). "target" is the actor index in this shot.
SHOT SIZE ("size"): extreme-wide (the whole place, characters small: use rarely, to open a new place), wide (place + characters), full (whole body fills the frame), medium (waist up), closeup (head and shoulders of ONE character: set target). Toddlers follow faces: most shots should be full or medium; open each new place with a wide shot, and give the singer a close-up on key lines. Vary sizes between consecutive shots (never the same size three times in a row), and repeat the same camera pattern when the chorus repeats. Optional on any camera: distance 0.6–1.6 (multiplies the framing), height -1–2.
TRANSITION into a shot ("transition" on the camera): cut, dissolve (soft cross-fade, for a new song section), dip-white (bright flash, for a magical moment), iris (circle closing/opening, for a new place or the ending), wipe (curtain sweep), or auto (dissolve at a new section, iris at a new place, else cut). Mostly cuts inside a section.
Characters face the camera (rot_y 0) unless they look at each other; an actor that travels turns to face where it goes (set "face_travel": false to keep it facing the camera while it moves, e.g. a rider on a bike sliding sideways), so make them travel across the frame (x) or toward the camera (+z), not away from it.
Lighting: morning, day, sunset, night.
LANDSCAPE: around every setting the app builds a landscape (sky, clouds, far hills, trees, flowers, optional river with flowing water, colourful cottages, swaying plants, birds) automatically. Per shot you may set "landscape": {sky: auto|clear|soft|storybook, clouds: none|few|some|many, hills: none|low|rolling|tall, trees: none|few|some|many, dressing: none|light|lush, river: none|behind|winding, houses: none|few|some|many, wind: calm|breezy|windy, birds: none|few|some, detail: normal|rich}, e.g. many clouds for a "clouds float by" line. Leave it out to keep the project look.
Shots cover the lyric lines in order with no gaps or overlaps: the first shot starts at line 0, the last ends at line ${lines.length - 1}. A shot covers 1–4 lines.
PROPOSE FIXES — ask, never assume: when part of the direction can't be done because something is missing from an EARLIER stage, add a proposal the user can approve. The app carries out approved proposals and then asks you to plan again. Types:
- new_character {name, description (look, colours, clothing, personality; clearly different from the existing characters), rig: "biped"|"quadruped"}: a new character is generated in Stage 2 (paid Meshy model + rig + walk/run clips), approved and saved to My World. Use this for every missing character the direction names.
- new_prop {name, description}: a new prop is generated in Stage 2 (paid Meshy). E.g. separate number props that can pop up one by one.
- manual {stage: 1|2|3, title, steps}: something only the user can do, e.g. Stage 3 "record/upload a 10-second song" or Stage 1 "add lyric lines so each scene has its own line". Be specific.
Do not propose things the engine can't do at all (blinking, facial expressions, hand contact): those stay in "cannot". Plan the shots NOW with what exists; proposals are for the next round.
Reply with ONLY JSON: {"reply": two or three sentences on the overall approach (or on what you changed), "did": [short bullet strings: which parts of the direction you put into the plan, and where], "cannot": [short bullet strings: each part of the direction you could NOT do, and why], "proposals": [{"type": ..., "title": short, "why": which part of the direction it unlocks, ...fields}], "shots": [{"title": short, "line_from": int, "line_to": int, "setting_card_id": id of a location asset, "setting_scale": number, "setting_rot_y": number, "setting_offset": [x,y,z], "actors": [{"card_id": int, "pos": [x,y,z], "rot_y": radians, "scale": number, "motion": {"type": ..., ...params}, "actions": [{"move": id, "at": s, "seconds": s}], "look_at_card_id": int, "turn_to_card_id": int, "face_travel": false (optional)}], "camera": {"preset": ..., "size": ..., "transition": ..., ...params}, "lighting": preset, "landscape": {optional}, "notes": one sentence of direction}]}`;
  const text = `Song length: ${duration ? `${duration.toFixed(1)} s` : 'unknown'}
Lyric lines (index, timing if known, text, on-screen cue):
${lines.map((l, i) => `${i}. ${l.start != null ? `[${l.start.toFixed(1)}–${l.end.toFixed(1)} s] ` : ''}${l.text}${l.en && l.en !== l.text ? ` (${l.en})` : ''}${l.cue ? `  [on screen: ${l.cue}]` : ''}`).join('\n')}

Approved assets:
${assets.map((a) => `card_id ${a.card_id}: ${a.name} (${a.kind})${a.kind === 'character' ? (a.body_rig ? ` [${a.body_rig === 'quadruped' ? 'four-legged' : 'two-legged'} rig${a.walk ? ', walk/run clip' : ', no walk clip (glides when travelling)'}; moves: ${a.moves.join(', ')}]` : ' [no rig: static model, travel motions only, no actions]') : ''}${a.usages?.length ? `, appears in lines ${a.usages.join(', ')}` : ''}${a.description ? ` — ${a.description}` : ''}`).join('\n')}

${current ? `CURRENT SHOT PLAN (revise it: change only what the director's note asks for, keep everything else exactly — same shots, lines, settings, positions, motions, cameras and lighting):
${JSON.stringify(current)}

` : ''}${message ? `Director's note: ${message}` : 'Propose the best shot plan for this song.'}`;
  return claudeJSON(system, [], withInspiration(world, text));
}

// ---------------- GPT Image ----------------
/** With reference images, uses the edits endpoint so the result blends the references + world style. */
export async function generateImage({ prompt, wide, refs = [] }) {
  assertActive('gptImage');
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const size = wide ? '1536x1024' : '1024x1024';
  const auth = { Authorization: `Bearer ${keyValue('OPENAI_API_KEY')}` };
  let r;
  if (refs.length) {
    const fd = new FormData();
    fd.append('model', model);
    fd.append('prompt', prompt);
    fd.append('size', size);
    refs.slice(0, 16).forEach((buf, i) => fd.append('image[]', new Blob([buf], { type: 'image/png' }), `ref${i}.png`));
    r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: auth, body: fd });
  } else {
    r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, size, n: 1 }),
    });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ProviderError(`GPT Image failed: ${j?.error?.message || r.status}`, 502);
  const b64 = j?.data?.[0]?.b64_json;
  if (!b64) throw new ProviderError('GPT Image returned no image.', 502);
  return Buffer.from(b64, 'base64');
}

// ---------------- Placeholders (clearly labelled) ----------------
export async function generateMusic({ provider = 'elevenMusic' } = {}) { assertActive(provider); }
export async function generateVideo({ provider = 'kling' } = {}) { assertActive(provider); }

/** Claude looks at pictures of a 3D model and says whether it matches its name and description (Claude only, never Meshy). */
export async function lookCheck({ card, images }) {
  const system = `You check 3D models for a preschool nursery-rhyme channel. You get pictures of ONE model (front and side views) plus the name and description it is supposed to have.
Say plainly what the model actually is (species / object, colours, clothing), and whether it matches. Be strict about species and object type (a mouse is not a bunny, a bunny is not a bear), and about anything the name or description promises (a helmet, wings, a bicycle). Small style differences are fine.
Reply with ONLY JSON: {"verdict": "match" | "partly" | "mismatch", "looks_like": short description of what the model actually is, "issues": [short strings: each thing that does not match], "suggestion": one sentence: rename the card to what it is, or regenerate / re-import a model that matches}.`;
  return claudeJSON(system, [], [...imgBlocks(images), { type: 'text', text: `Name: ${card.name}\nKind: ${card.kind}\nDescription: ${card.description || '-'}\nRecognizable features: ${card.signature || '-'}` }]);
}

/**
 * Read the user's World Style and their inspiration screenshots, and write the inspiration brief every later
 * Claude call receives: what to borrow (about 80% of the ideas) and what never to copy. Claude only.
 */
export async function inspirationBrief({ guide, images, notes }) {
  const system = `You are the art director of a preschool nursery-rhyme channel. The user describes their own world (WORLD STYLE) and shares screenshots from other channels' videos they find inspiring.
Write an INSPIRATION BRIEF that every later design, prop, scenery, landscape and shot plan will follow. Take about 80% of the ideas from the screenshots: overall look and feel, colour palette and saturation, shapes and proportions, materials and surface finish, lighting and time of day, sky and landscape (hills, trees, flowers, clouds, depth), camera framing and shot sizes, how characters are placed and how busy a frame is, on-screen text style. Make them fit the user's World Style (their description always wins where they differ). List what must NOT be copied: specific characters, faces, logos, channel names, text, trademarks, exact designs.
Write it as short, concrete rules (hex colours where useful). No more than 1800 characters for the brief.
Reply with ONLY JSON: {"brief": the brief as plain text with short lines, "palette": [up to 8 hex colours you took from the screenshots], "landscape": {"sky": "auto"|"clear"|"soft"|"storybook", "clouds": "none"|"few"|"some"|"many", "hills": "none"|"low"|"rolling"|"tall", "trees": "none"|"few"|"some"|"many", "dressing": "none"|"light"|"lush", "ground": "#hex", "hill_tint": "#hex"}, "avoid": [short strings: what not to copy]}.`;
  const text = `MY WORLD STYLE (my own description, it wins where it differs):\n${guide}\n\nMy notes on the screenshots: ${notes.length ? notes.map((n, i) => `${i + 1}. ${n}`).join(' | ') : '(none)'}`;
  return claudeJSON(system, [], [{ type: 'text', text: `The next ${images.length} image(s) are my inspiration screenshots.` }, ...imgBlocks(images), { type: 'text', text }]);
}

/** Landscape defaults for the whole channel (sky, clouds, hills, trees, dressing, colours) from the World Style. Claude only. */
export async function worldLandscape({ world }) {
  const system = `You set the default landscape for every video of a preschool nursery-rhyme channel. Around each 3D scenery the app builds: a gradient sky, cartoon clouds, three rings of rolling far hills fading into haze, round trees on the hills, small flowers / bushes / grass tufts around the set, and a ground colour.
${worldText(world)}
Choose values that match the world and the inspiration. Reply with ONLY JSON: {"sky": "auto"|"clear"|"soft"|"storybook", "clouds": "none"|"few"|"some"|"many", "hills": "none"|"low"|"rolling"|"tall", "trees": "none"|"few"|"some"|"many", "dressing": "none"|"light"|"lush", "ground": "#hex", "hill_tint": "#hex", "transition": "auto"|"cut"|"dissolve"|"dip-white"|"iris"|"wipe", "why": one or two sentences}.`;
  return claudeJSON(system, [], withInspiration(world, 'Set the default landscape for my world.'));
}

/**
 * Stage 2: design the landscape where the story happens — the project's landscape and, for each scenery (place),
 * what is different around it (sky, clouds, far hills, trees, flowers, colours, time of day). Claude only.
 */
export async function designLandscape({ world, lines, sceneries, current }) {
  const system = `You are the set designer of a short 3D nursery-rhyme video for children aged 1–5.
${worldText(world)}
Around every 3D scenery (the set where the characters stand) the app builds a LANDSCAPE out to the horizon: a gradient sky, cartoon clouds, three rings of rolling far hills fading into haze, round trees on the hills, flowers / bushes / grass tufts around the set, and a ground colour. Lighting per place: morning, day, sunset or night.
Read the lyrics and on-screen cues and design where the story happens. Give the whole video a landscape ("project"), and for each place only what is DIFFERENT there ("sceneries"; leave a field out to use the project value). Places in the same song share one world: keep them related (same palette family) but recognisable. Toddlers need clean, bright, uncluttered backgrounds: keep the middle ground open for the action.
Options: sky auto|clear|soft|storybook, clouds none|few|some|many, hills none|low|rolling|tall, trees none|few|some|many, dressing none|light|lush, river none|behind|winding (a river with flowing water behind the play area), houses none|few|some|many (colourful cottages around the play area), wind calm|breezy|windy (trees, flowers and grass sway), birds none|few|some, detail normal|rich (rich = rainbow flower beds, bunting flags, candy blossom trees, patchwork hills, a rainbow, hot-air balloons, butterflies: a busy, colourful picture), ground and hill_tint "#hex", time_of_day morning|day|sunset|night. Make the world feel alive and colourful when the story allows: moving water, swaying trees, cottages around the play area.
Reply with ONLY JSON: {"plan": 3–6 short sentences describing where the story happens and how the landscape supports each part of the song, "project": {sky, clouds, hills, trees, dressing, ground, hill_tint}, "sceneries": [{"card_id": int, "time_of_day": ..., "sky"?: ..., "clouds"?: ..., "hills"?: ..., "trees"?: ..., "dressing"?: ..., "river"?: ..., "houses"?: ..., "wind"?: ..., "birds"?: ..., "detail"?: ..., "ground"?: "#hex", "hill_tint"?: "#hex", "why": one sentence}]}. "project" may also set river, houses, wind and birds.`;
  const text = `Lyric lines (index, text, on-screen cue):
${lines.map((l, i) => `${i}. ${l.text}${l.cue ? `  [on screen: ${l.cue}]` : ''}`).join('\n')}

Places (scenery cards):
${sceneries.length ? sceneries.map((s) => `card_id ${s.card_id}: ${s.name}${s.usages?.length ? ` (lines ${s.usages.join(', ')})` : ''}: ${s.description || '-'}`).join('\n') : '(no scenery cards yet: design the project landscape only)'}
${current ? `\nCurrent landscape (improve it): ${JSON.stringify(current)}` : ''}`;
  return claudeJSON(system, [], withInspiration(world, text));
}
