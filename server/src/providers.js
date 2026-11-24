// AI tool connections. Keys are stored server-side only (storage/studio.sqlite or server/.env)
// and never sent to the browser. Paid generation stays OFF until you switch it on.
import Anthropic from '@anthropic-ai/sdk';
import { getSetting, setSetting } from './db.js';
import { langName, isEnglish } from './langs.js';

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

const conn = () => getSetting('connections', { keys: {}, paidEnabled: null });
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
  const c = conn();
  c.keys ||= {};
  if (id) {
    const t = TOOLS.find((x) => x.id === id);
    if (!t) throw new ProviderError('Unknown tool.');
    if (key) c.keys[t.key] = String(key).trim();
    else delete c.keys[t.key];
  }
  if (typeof pe === 'boolean') c.paidEnabled = pe;
  setSetting('connections', c);
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
    res = await client.beta.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system,
      messages,
    });
  } catch (e) {
    if (e?.status === 401) throw new ProviderError('Claude rejected the API key. Check it on the Connections page.', 400);
    if (e?.status === 429) throw new ProviderError('Claude is rate-limiting requests right now. Wait a moment and try again.', 429);
    throw new ProviderError(`Claude request failed: ${e?.message || e}`, 502);
  }
  if (res.stop_reason === 'refusal') throw new ProviderError('Claude declined this request. Try rephrasing it.', 422);
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  try {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = m ? m[1] : text;
    return JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
  } catch {
    throw new ProviderError('Claude replied in an unexpected format. Please try again.', 502);
  }
}

export async function lyricsAssistant({ channel, episode, lyrics, history, message, library }) {
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
When you change or create lyrics, return the COMPLETE song. Use null only when the user just asks a question.`;
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
const worldText = (world) => `WORLD STYLE GUIDE (every design must follow it): ${world.guide}
Existing locked designs in this world (new designs must share their rendering style but be clearly UNIQUE — different silhouette, colors and details from all of them):
${world.locked.length ? world.locked.map((x) => `- ${x}`).join('\n') : '- none yet'}`;
const MESHY_FIELDS = `"meshy_prompt" (MAX 700 characters, for Meshy text-to-3D: describe ONLY this one subject as a 3D model — overall shape, proportions, distinctive silhouette, colors, materials, surface finish — written so it matches the world style yet is clearly unique; no background, no scene, no camera or lighting words), "texture_prompt" (MAX 700 characters, for Meshy texturing: exact colors with hex codes, materials and surface details in the world style)`;
const specFields = (kind) => (kind === 'character'
  ? `"description", "look" (shape, proportions, colors, clothing, distinctive features), "personality", "palette" (3-5 hex colors), "voice", "image_prompt" (detailed prompt for an image model: one character, full body, front 3/4 view, plain light background, rendered exactly in the world style), ${MESHY_FIELDS}, "search_terms" (3-5 words to search free 3D model sites)`
  : `"description", "look" (layout, key landmarks), "lighting", "palette" (3-5 hex colors), "image_prompt" (detailed prompt for a wide 16:9 establishing shot, no characters, rendered exactly in the world style), ${MESHY_FIELDS}, "search_terms" (3-5 words)`);

/** Reads the lyrics and returns everything that needs designing, each with a full first design. */
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

export async function designAssistant({ item, spec, history, message, channel, world, refImages = [], styleImages = [] }) {
  const isChar = item.kind === 'character';
  const system = `You are the ${isChar ? 'character' : 'set'} designer for "${channel.name}", a children's animated nursery-rhyme channel with ONE consistent, recognizable visual world.
${worldText(world)}
You develop "${item.name}" (${item.kind}) with the user. When several reference images of ${item.name} are given, combine them into ONE coherent design (take the best features of each). Keep everything the user did not ask to change.
Reply with ONLY JSON: {"reply": short message explaining the design or change, "spec": {${specFields(isChar ? 'character' : 'location')}}}. Always return the full spec.`;
  const text = `Current design spec:\n${JSON.stringify(spec || {})}\nItem description: ${item.description || '-'}
Attached images: ${refImages.length ? `the first ${refImages.length} are the user's reference images for ${item.name}` : 'no reference images for this item yet'}${styleImages.length ? `; the last ${styleImages.length} are locked designs from the world, for STYLE only (do not copy their characters)` : ''}.

My request: ${message}`;
  return claudeJSON(system, history, [...imgBlocks([...refImages, ...styleImages]), { type: 'text', text }]);
}

export async function musicAssistant({ channel, episode, lyricsText, brief, history, message }) {
  const system = `You are the music director for "${channel.name}", a channel of original nursery rhymes for ages 1–5. This song is in ${langName(episode.language)}.
Recommend music directions that fit the lyrics and a ${episode.target_duration || 60}-second video. Mix Indian (Carnatic/folk) and Western kids-pop ideas where they suit.
Reply with ONLY JSON: {"reply": short message, "options": [{"title", "style", "tempo_bpm": number, "key", "time_signature", "mood", "instruments": [string], "vocal" (who sings and how), "structure" (e.g. "intro 4 bars, verse, chorus x2, outro"), "music_ai_prompt" (a ready-to-paste prompt for an AI song generator, without the lyrics)}]}. Give 3 options unless asked otherwise.`;
  const ctx = `Lyrics:\n${lyricsText}\n\nCurrent options: ${JSON.stringify(brief?.options || [])}`;
  return claudeJSON(system, history, `${ctx}\n\nMy request: ${message || 'Recommend music for this song.'}`);
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
