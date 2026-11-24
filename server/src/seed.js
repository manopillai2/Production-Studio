// Sample "Little Bunny" project: shared character + location, approved chorus lyrics & audio,
// three storyboard shots with approved clips. All art/audio is generated locally (no providers).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { db, one, run, getSetting, setSetting } from './db.js';
import { MEDIA_DIR, TMP_DIR } from './paths.js';
import { Canvas, wav, runFfmpeg, FFMPEG, probe } from './media.js';
import { DEFAULT_CHANNEL } from './model.js';

const WHITE = [250, 250, 255], PINK = [255, 160, 190], DARK = [45, 35, 70], CREAM = [255, 244, 228];

function drawBunny({ ears = 150, bow = false, expression = 'happy' } = {}) {
  const c = new Canvas(600, 780);
  const earY = 200 - (ears - 150) * 0.5;
  for (const [x, r] of [[225, -0.15], [375, 0.15]]) {
    c.ellipse(x, earY, 46, ears, WHITE, { rot: r });
    c.ellipse(x, earY + 12, 22, ears * 0.75, PINK, { rot: r, shade: 0.15 });
  }
  if (bow) { c.ellipse(345, 225, 40, 26, [175, 140, 255], { rot: 0.4 }); c.ellipse(400, 215, 40, 26, [175, 140, 255], { rot: -0.4 }); c.circle(372, 222, 16, [150, 115, 240]); }
  c.ellipse(220, 735, 72, 36, [238, 238, 246]); c.ellipse(380, 735, 72, 36, [238, 238, 246]);
  c.ellipse(300, 585, 165, 175, WHITE);
  c.ellipse(300, 615, 95, 110, CREAM, { shade: 0.1 });
  c.ellipse(158, 560, 40, 72, WHITE, { rot: 0.5 }); c.ellipse(442, 560, 40, 72, WHITE, { rot: -0.5 });
  c.circle(300, 360, 152, WHITE);
  c.circle(212, 418, 30, PINK, { shade: 0, alpha: 0.55 }); c.circle(388, 418, 30, PINK, { shade: 0, alpha: 0.55 });
  const big = expression === 'surprised';
  for (const x of [245, 355]) {
    c.ellipse(x, 350, big ? 30 : 24, big ? 40 : 32, DARK, { shade: 0.2 });
    c.circle(x + 8, 336, big ? 11 : 9, [255, 255, 255], { shade: 0 });
  }
  c.ellipse(300, 400, 20, 14, [255, 115, 155], { shade: 0.25 });
  if (big) c.ellipse(300, 448, 18, 24, [190, 55, 90], { shade: 0.1 });
  else { c.ellipse(300, 432, 30, 18, [200, 60, 95], { shade: 0 }); c.ellipse(300, 420, 34, 16, WHITE, { shade: 0 }); }
  return c.png();
}

function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

function drawMeadow(w = 1920, h = 1080, { evening = false } = {}) {
  const c = new Canvas(w, h, [0, 0, 0, 255]);
  const s = w / 1920;
  c.vgradient(evening ? [255, 160, 120] : [100, 195, 255], evening ? [255, 220, 170] : [205, 240, 255], 0, Math.round(760 * s));
  c.circle(1650 * s, 180 * s, 105 * s, [255, 222, 70], { shade: 0.15 });
  const R = rng(7);
  for (const [x, y] of [[300, 170], [820, 120], [1250, 230]]) for (let k = 0; k < 4; k++) c.ellipse((x + k * 55) * s, (y + (k % 2) * 18) * s, 70 * s, 48 * s, [255, 255, 255], { shade: 0.12 });
  c.ellipse(350 * s, 900 * s, 900 * s, 330 * s, [140, 215, 110]);
  c.ellipse(1550 * s, 950 * s, 1000 * s, 360 * s, [110, 200, 95]);
  c.rect(0, Math.round(820 * s), w, h, [85, 190, 80, 255]);
  c.ellipse(960 * s, 1260 * s, 1500 * s, 470 * s, [75, 182, 72], { shade: 0.2 });
  const petals = [[255, 110, 150], [255, 210, 60], [170, 130, 255], [255, 255, 255], [255, 140, 70]];
  for (let i = 0; i < 160; i++) {
    const x = R() * w, y = (830 + R() * 240) * s, col = petals[i % petals.length], r = (7 + R() * 7) * s;
    for (let p = 0; p < 5; p++) c.circle(x + Math.cos(p * 1.26) * r, y + Math.sin(p * 1.26) * r, r * 0.7, col, { shade: 0.1 });
    c.circle(x, y, r * 0.55, [255, 200, 40], { shade: 0.1 });
  }
  return c.png();
}

function drawCarrotPatch() {
  const c = new Canvas(800, 420);
  c.ellipse(400, 330, 380, 90, [150, 95, 55]);
  for (let i = 0; i < 5; i++) {
    const x = 140 + i * 130;
    for (const r of [-0.45, 0, 0.45]) c.ellipse(x + r * 30, 215, 14, 55, [70, 185, 70], { rot: r });
    c.ellipse(x, 300, 34, 70, [255, 140, 40], { shade: 0.35 });
  }
  return c.png();
}

function drawBridge() {
  const c = new Canvas(1920, 1080, [0, 0, 0, 255]);
  c.vgradient([110, 200, 255], [210, 240, 255], 0, 600);
  c.rect(0, 600, 1920, 480, [85, 190, 80, 255]);
  c.rect(0, 700, 1920, 220, [80, 170, 240, 255]);
  for (let x = 560; x < 1360; x += 60) c.rect(x, 640, 52, 120, [190, 130, 75, 255]);
  c.rect(540, 600, 840, 24, [150, 95, 55, 255]);
  for (let x = 560; x <= 1340; x += 130) c.rect(x, 600, 20, 160, [150, 95, 55, 255]);
  return c.png();
}

function drawStones() {
  const c = new Canvas(1920, 1080, [0, 0, 0, 255]);
  c.vgradient([110, 200, 255], [210, 240, 255], 0, 500);
  c.rect(0, 500, 1920, 580, [85, 190, 80, 255]);
  c.ellipse(960, 820, 1100, 200, [80, 170, 240]);
  for (let i = 0; i < 6; i++) c.ellipse(330 + i * 255, 820 + (i % 2 ? 25 : -25), 85, 42, [170, 170, 185]);
  return c.png();
}

function drawLogo() {
  const c = new Canvas(512, 512);
  c.circle(256, 256, 240, [255, 122, 89], { shade: 0.2 });
  c.ellipse(200, 170, 34, 110, WHITE, { rot: -0.2 }); c.ellipse(312, 170, 34, 110, WHITE, { rot: 0.2 });
  c.circle(256, 300, 110, WHITE);
  for (const x of [220, 292]) c.circle(x, 290, 14, DARK, { shade: 0 });
  c.ellipse(256, 330, 14, 10, [255, 115, 155], { shade: 0 });
  return c.png();
}

// ---------- audio ----------
const RATE = 44100;
const f = (m) => 440 * 2 ** ((m - 69) / 12);
const BEAT = 0.5; // 120 bpm
const MELODY = [
  [[67, 1], [67, 1], [64, 0.5], [64, 0.5], [67, 1], [69, 1], [67, 1], [64, 2]],
  [[65, 1], [65, 1], [62, 0.5], [62, 0.5], [65, 1], [67, 1], [65, 1], [62, 2]],
  [[64, 0.5], [64, 0.5], [67, 1], [72, 1], [71, 0.5], [69, 0.5], [67, 1], [64, 1], [60, 2]],
];
const CHORDS = [[48, 52, 55], [43, 47, 50, 53], [48, 52, 55]];

function synth({ melody = true, band = true, hum = false, seconds = 12.5 } = {}) {
  const out = new Float32Array(Math.round(seconds * RATE));
  const add = (t0, dur, fn) => {
    const i0 = Math.round(t0 * RATE), n = Math.round(dur * RATE);
    for (let i = 0; i < n && i0 + i < out.length; i++) out[i0 + i] += fn(i / RATE, dur);
  };
  const env = (t, d, a = 0.02, r = 0.12) => Math.min(1, t / a) * Math.min(1, Math.max(0, (d - t) / r));
  if (melody) {
    let t = 0;
    for (const line of MELODY) for (const [m, b] of line) {
      const fr = f(m + (hum ? -12 : 0)), d = b * BEAT;
      add(t, d * 0.95, (x, dd) => {
        const vib = Math.sin(2 * Math.PI * 5.5 * x) * (x > 0.15 ? 0.006 : 0);
        const ph = 2 * Math.PI * fr * x * (1 + vib);
        const tone = hum ? Math.sin(ph) * 0.9 + Math.sin(2 * ph) * 0.1
          : Math.sin(ph) * 0.6 + Math.sin(2 * ph) * 0.25 + Math.sin(3 * ph) * 0.12; // bright "toy voice"
        return tone * env(x, dd, 0.03, 0.08) * (hum ? 0.35 : 0.32);
      });
      t += d;
    }
  }
  if (band) {
    MELODY.forEach((_, li) => {
      const t0 = li * 4;
      for (let beat = 0; beat < 8; beat++) {
        const tb = t0 + beat * BEAT;
        const root = CHORDS[li][0];
        add(tb, 0.4, (x, d) => Math.sin(2 * Math.PI * f(root - 12 + (beat % 2 ? 7 : 0)) * x) * env(x, d, 0.005, 0.2) * 0.32);   // bass
        for (const m of CHORDS[li]) add(tb, 0.3, (x, d) => Math.sin(2 * Math.PI * f(m + 12) * x) * Math.exp(-x * 7) * env(x, d, 0.004, 0.05) * 0.07); // plucky chords
        add(tb, 0.12, (x) => Math.sin(2 * Math.PI * (120 - x * 400) * x) * Math.exp(-x * 30) * (beat % 2 ? 0 : 0.5)); // kick
        if (beat % 2) add(tb, 0.15, (x) => (Math.random() * 2 - 1) * Math.exp(-x * 35) * 0.25);                     // clap
      }
    });
  }
  return wav(out, RATE);
}

function chirp() {
  const out = new Float32Array(RATE * 1.6);
  for (const t0 of [0.1, 0.45, 0.9]) {
    for (let i = 0; i < RATE * 0.28; i++) {
      const x = i / RATE, fr = 900 + 600 * Math.sin(Math.PI * x / 0.28);
      out[Math.round(t0 * RATE) + i] += Math.sin(2 * Math.PI * fr * x) * Math.sin(Math.PI * x / 0.28) * 0.5;
    }
  }
  return wav(out);
}
function boing() {
  const out = new Float32Array(RATE * 0.9);
  let ph = 0;
  for (let i = 0; i < out.length; i++) { const x = i / RATE; ph += 2 * Math.PI * (180 + 420 * (1 - Math.exp(-x * 6)) + 30 * Math.sin(x * 60)) / RATE; out[i] = Math.sin(ph) * Math.exp(-x * 3.5) * 0.7; }
  return wav(out);
}

// ---------- db helpers ----------
function addAsset(ownerType, ownerId, category, name, data, { mime, status = 'approved', label, width = null, height = null, duration = null, notes = '' } = {}) {
  const rel = `${ownerType}/${ownerId}/${name}`;
  fs.mkdirSync(path.join(MEDIA_DIR, ownerType, String(ownerId)), { recursive: true });
  if (data) fs.writeFileSync(path.join(MEDIA_DIR, rel), data);
  const p = probe(path.join(MEDIA_DIR, rel));
  const r = run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,width,height,duration,source,status,notes)
                 VALUES(?,?,?,?,?,?,?,?,?, 'sample', ?, ?)`,
    ownerType, ownerId, category, label || name, rel, mime, p.width ?? width, p.height ?? height, p.duration ?? duration, status, notes);
  return Number(r.lastInsertRowid);
}
const item = (kind, name, description, notes, blender_link = '') =>
  Number(run('INSERT INTO items(kind,name,description,notes,blender_link) VALUES(?,?,?,?,?)', kind, name, description, notes, blender_link).lastInsertRowid);
const version = (itemId, label, status, notes = '') =>
  Number(run(`INSERT INTO item_versions(item_id,label,status,notes,approved_at) VALUES(?,?,?,?, ${status === 'approved' ? "datetime('now')" : 'NULL'})`, itemId, label, status, notes).lastInsertRowid);

async function renderClip(out, inputs, filter, { seconds = 4 } = {}) {
  const args = [];
  for (const i of inputs) args.push('-loop', '1', '-framerate', '30', '-i', i);
  args.push('-filter_complex', filter, '-t', String(seconds), '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', out);
  await runFfmpeg(args);
}

export async function seedSample() {
  console.log('  Creating sample Little Bunny project…');
  const png = 'image/png', wavM = 'audio/wav', mp4 = 'video/mp4';

  setSetting('channel', {
    ...DEFAULT_CHANNEL,
    name: 'Bunny Meadow Rhymes',
    tagline: 'Tamil & English nursery rhymes',
  });
  const logo = addAsset('channel', 0, 'logo', 'logo.png', drawLogo(), { mime: png, label: 'Channel logo (sample)' });
  const sound = addAsset('channel', 0, 'sound', 'boing.wav', boing(), { mime: wavM, label: 'Signature "boing" (sample)' });
  setSetting('channel', { ...getSetting('channel'), logo_asset_id: logo, signature_sound_ids: [sound] });

  // Characters
  const bunny = item('character', 'Little Bunny', 'A cheerful white bunny who loves hopping and carrots.', 'Personality: curious, kind, giggly. Always pink cheeks. Voice: high, playful.', 'C:\\Blender\\RhymesWorld\\little_bunny.blend');
  const b1 = version(bunny, 'v1 – Classic look', 'approved', 'Approved for all episodes so far.');
  addAsset('version', b1, 'reference', 'bunny_front.png', drawBunny(), { mime: png, label: 'Front reference' });
  addAsset('version', b1, 'expression', 'bunny_surprised.png', drawBunny({ expression: 'surprised' }), { mime: png, label: 'Expression: surprised' });
  addAsset('version', b1, 'voice', 'bunny_voice.wav', chirp(), { mime: wavM, label: 'Voice reference: giggle' });
  const b2 = version(bunny, 'Draft 2 – Bigger ears + bow', 'draft', 'Trying a festive look. NOT used in any episode until approved and pinned.');
  addAsset('version', b2, 'reference', 'bunny_bow.png', drawBunny({ ears: 175, bow: true }), { mime: png, status: 'draft', label: 'Front reference (bow)' });

  // Locations & props
  const meadow = item('location', 'Sunny Meadow', 'Rolling green hills, flowers, big friendly sun.', 'Lighting: warm late-morning sun from top-right, soft shadows, saturated greens.', 'C:\\Blender\\RhymesWorld\\meadow.blend');
  const m1 = version(meadow, 'v1 – Daytime', 'approved');
  const meadowRef = addAsset('version', m1, 'view', 'meadow_wide.png', drawMeadow(), { mime: png, label: 'Wide view (day)' });
  const m2 = version(meadow, 'Draft 2 – Evening', 'draft', 'Golden-hour variant for a bedtime episode.');
  addAsset('version', m2, 'view', 'meadow_evening.png', drawMeadow(1920, 1080, { evening: true }), { mime: png, status: 'draft', label: 'Wide view (evening)' });

  const bridge = item('location', 'Wooden Bridge', 'Little bridge over the blue stream.', 'Lighting: same sun as meadow.');
  const br1 = version(bridge, 'Draft 1', 'draft');
  addAsset('version', br1, 'view', 'bridge.png', drawBridge(), { mime: png, status: 'draft', label: 'Wide view' });

  const stones = item('prop', 'Stepping Stones', 'Six round grey stones across the stream.', '');
  const st1 = version(stones, 'v1', 'approved');
  addAsset('version', st1, 'view', 'stones.png', drawStones(), { mime: png, label: 'Wide view' });

  const carrots = item('prop', 'Carrot Patch', 'Five carrots in a soil mound.', 'Use at the right third of frame.');
  const c1 = version(carrots, 'v1', 'approved');
  const carrotRef = addAsset('version', c1, 'reference', 'carrot_patch.png', drawCarrotPatch(), { mime: png, label: 'Prop (transparent)' });

  // Episode 1
  const ep = Number(run(`INSERT INTO episodes(number,title,title_ta,language,theme,learning_goals,target_duration,notes,youtube_title,youtube_description,caption_style,caption_language)
    VALUES(1,'Hop Hop Little Bunny','குதி குதி குட்டி முயலே','both','Movement & play in the meadow','Action words: hop, wiggle, clap. Counting claps to three.',12,
    'Sample episode: one chorus, three shots.','Hop Hop Little Bunny | குதி குதி குட்டி முயலே | Bunny Meadow Rhymes',
    'Sing along with Little Bunny! Hop, wiggle and clap in the sunny meadow.\n\nகுட்டி முயலுடன் சேர்ந்து பாடுங்கள்!\n\n#nurseryrhymes #tamilrhymes #kidssongs', ?, 'both')`,
    JSON.stringify(DEFAULT_CHANNEL.caption_style)).lastInsertRowid);
  for (const [it, v] of [[bunny, b1], [meadow, m1], [carrots, c1]]) run('INSERT INTO episode_cast VALUES(?,?,?)', ep, it, v);

  const chorus = [
    { ta: 'குதி குதி குட்டி முயலே, குதி!', en: 'Hop, hop, little bunny, hop!', cue: 'Bunny hops in place, ears bouncing' },
    { ta: 'பச்சைப் புல்வெளியில் ஓடி வா!', en: 'Over the meadow, never stop!', cue: 'Bunny hops left to right across the meadow' },
    { ta: 'மூக்கை ஆட்டி, கை தட்டு, தட்டு!', en: 'Wiggle your nose and clap, clap, clap!', cue: 'Bunny wiggles by the carrot patch and claps 3 times' },
  ];
  run(`INSERT INTO lyrics(episode_id,title,sections,status) VALUES(?,?,?, 'draft')`, ep, 'Chorus – first idea',
    JSON.stringify([{ type: 'chorus', label: 'Chorus', lines: [{ ta: '', en: 'Hop, hop, bunny, hop hop hop', cue: 'hops' }, { ta: '', en: 'Hop around the meadow top', cue: '' }, { ta: '', en: 'Clap your paws and then you stop', cue: 'claps' }] }]));
  const lyr = Number(run(`INSERT INTO lyrics(episode_id,title,sections,status) VALUES(?,?,?, 'approved')`, ep, 'Chorus – bilingual v2',
    JSON.stringify([{ type: 'chorus', label: 'Chorus', lines: chorus }])).lastInsertRowid);

  addAsset('episode', ep, 'hum', 'hummed_melody.wav', synth({ band: false, hum: true }), { mime: wavM, status: 'draft', label: 'Hummed melody (phone memo)' });
  addAsset('episode', ep, 'instrumental', 'instrumental.wav', synth({ melody: false }), { mime: wavM, label: 'Instrumental backing' });
  const master = addAsset('episode', ep, 'song', 'chorus_final_mix.wav', synth(), { mime: wavM, label: 'Chorus – final mix (sample synth)' });
  run('UPDATE episodes SET approved_lyrics_id=?, master_audio_id=? WHERE id=?', lyr, master, ep);

  // Storyboard
  const shotDefs = [
    { title: 'Hop in place', cue: chorus[0].en, loc: meadow, ref: meadowRef, motion: 'Static wide. Bunny centre frame, two hops per second, ears squash on landing.' },
    { title: 'Hop across the meadow', cue: chorus[1].en, loc: meadow, ref: meadowRef, motion: 'Static wide. Bunny enters frame left, hops to exit right in 4s.' },
    { title: 'Wiggle & clap at carrots', cue: chorus[2].en, loc: meadow, ref: carrotRef, motion: 'Medium shot. Bunny sways side to side next to the carrot patch, quick small hops = claps.' },
  ];
  const tmp = path.join(TMP_DIR, 'seed'); fs.mkdirSync(tmp, { recursive: true });
  const meadowPng = path.join(tmp, 'meadow.png'), bunnyPng = path.join(tmp, 'bunny.png'), carrotPng = path.join(tmp, 'carrot.png');
  fs.copyFileSync(path.join(MEDIA_DIR, `version/${m1}/meadow_wide.png`), meadowPng);
  fs.copyFileSync(path.join(MEDIA_DIR, `version/${b1}/bunny_front.png`), bunnyPng);
  fs.copyFileSync(path.join(MEDIA_DIR, `version/${c1}/carrot_patch.png`), carrotPng);

  const filters = [
    ['[1:v]scale=-1:470[b];[0:v]scale=1920:1080[bg];[bg][b]overlay=x=(W-w)/2:y=H*0.95-h-abs(sin(t*6.2832))*140,format=yuv420p', [meadowPng, bunnyPng], 'shot1_1080p.mp4'],
    ['[1:v]scale=-1:420[b];[0:v]scale=1920:1080[bg];[bg][b]overlay=x=-w+(W+w)*t/4:y=H*0.95-h-abs(sin(t*4.7124))*160,format=yuv420p', [meadowPng, bunnyPng], 'shot2_1080p.mp4'],
    ['[0:v]scale=1280:720[bg];[1:v]scale=-1:190[c];[2:v]scale=-1:310[b];[bg][c]overlay=x=W*0.6:y=H*0.7[bg2];[bg2][b]overlay=x=W*0.28+sin(t*3)*W*0.1:y=H*0.97-h-abs(sin(t*9.4248))*45,format=yuv420p', [meadowPng, carrotPng, bunnyPng], 'shot3_720p.mp4'],
  ];
  for (let i = 0; i < shotDefs.length; i++) {
    const d = shotDefs[i];
    const sid = Number(run(`INSERT INTO shots(episode_id,position,title,lyric_cue,character_item_id,location_item_id,ref_asset_id,motion_notes,duration)
      VALUES(?,?,?,?,?,?,?,?,4)`, ep, i, d.title, d.cue, bunny, d.loc, d.ref, d.motion).lastInsertRowid);
    if (!FFMPEG) continue;
    const [filter, inputs, name] = filters[i];
    fs.mkdirSync(path.join(MEDIA_DIR, 'shot', String(sid)), { recursive: true });
    await renderClip(path.join(MEDIA_DIR, 'shot', String(sid), name), inputs, filter);
    const clip = addAsset('shot', sid, 'clip', name, null, { mime: mp4, label: `${d.title} (sample render)`, notes: 'Procedural placeholder render. Replace with Blender/Kling/Veo clip.' });
    run('UPDATE shots SET approved_clip_id=? WHERE id=?', clip, sid);
    if (i === 0) {
      const alt = 'shot1_alt_720p.mp4';
      await renderClip(path.join(MEDIA_DIR, 'shot', String(sid), alt), [meadowPng, bunnyPng],
        '[1:v]scale=-1:300[b];[0:v]scale=1280:720[bg];[bg][b]overlay=x=(W-w)/2:y=H*0.95-h-abs(sin(t*3.1416))*60,format=yuv420p');
      addAsset('shot', sid, 'clip', alt, null, { mime: mp4, status: 'draft', label: 'Alt take – slower hops (draft)' });
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  // Captions follow the three shots (one chorus line per shot).
  chorus.forEach((l, i) => run('INSERT INTO captions(episode_id,start,end,text) VALUES(?,?,?,?)', ep, i * 4, i * 4 + 3.9, `${l.ta}\n${l.en}`));
  patchSampleSpecs();
  console.log(FFMPEG ? '  Sample project ready.' : '  Sample project ready (clips skipped: FFmpeg not found — run "npm run reset-sample" after installing FFmpeg).');
}

const SAMPLE_SPECS = {
  'Little Bunny': {
    description: 'A cheerful white bunny who loves hopping and carrots.',
    look: 'Round, soft white body, big head (1:1.2 head-to-body), long upright ears with pink inner ears, big dark eyes with white highlights, rosy pink cheeks, small pink nose, cream belly patch.',
    personality: 'Curious, kind, giggly; always bouncing.', palette: ['#FAFAFF', '#FFA0BE', '#FFF4E4', '#2D2346'], voice: 'High, playful giggle.',
    image_prompt: 'Cute little white bunny character, full body, front view, big head, long upright ears with pink insides, big shiny dark eyes, rosy cheeks, cream belly, bright colorful 3D kids animation style, soft studio lighting, plain light background',
    search_terms: 'cute cartoon bunny rabbit',
  },
  'Sunny Meadow': {
    description: 'Rolling green hills, flowers, big friendly sun.',
    look: 'Two layers of rounded hills, a flower-dotted foreground, three puffy clouds, big yellow sun top-right.',
    lighting: 'Warm late-morning sun from top-right, soft shadows, saturated greens.', palette: ['#64C3FF', '#55BE50', '#FFDE46', '#FF6E96'],
    image_prompt: 'Bright cartoon meadow with rolling green hills, colorful flowers, puffy white clouds, big friendly sun, wide 16:9 establishing shot, colorful 3D kids animation style, no characters',
    search_terms: 'cartoon meadow hills landscape',
  },
};
/** Fill design specs for the sample library items when they are still empty (safe to run every start). */
export function patchSampleSpecs() {
  for (const [name, spec] of Object.entries(SAMPLE_SPECS)) {
    const v = one(`SELECT v.id FROM item_versions v JOIN items i ON i.id=v.item_id WHERE i.name=? AND v.status='approved' AND (v.spec IS NULL OR v.spec='{}') ORDER BY v.id LIMIT 1`, name);
    if (v) run('UPDATE item_versions SET spec=? WHERE id=?', JSON.stringify(spec), v.id);
  }
}

export async function seedIfEmpty() {
  if (getSetting('seeded')) return;
  if (one('SELECT COUNT(*) n FROM episodes').n || one('SELECT COUNT(*) n FROM items').n) { setSetting('seeded', true); return; }
  await seedSample();
  setSetting('seeded', true);
}

async function resetAll() {
  for (const t of ['chat_messages', 'cast_suggestions', 'captions', 'shots', 'lyrics', 'episode_cast', 'assets', 'item_versions', 'items', 'episodes', 'jobs', 'settings']) db.exec(`DELETE FROM ${t}`);
  db.exec(`DELETE FROM sqlite_sequence`);
  for (const d of ['channel', 'version', 'episode', 'shot', 'exports']) fs.rmSync(path.join(MEDIA_DIR, d), { recursive: true, force: true });
  await seedSample();
  setSetting('seeded', true);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--reset')) {
  console.log('  Resetting ALL studio data to the sample project (stop the server first)…');
  await resetAll();
}
