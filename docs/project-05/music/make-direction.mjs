// Build the Stage 4 animation direction from the measured timing of the Suno song (two lines per shot, one in the slow chorus).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(fs.readFileSync(path.join(DIR, 'timing-suno.json'), 'utf8'));
const L = t.lines; const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const groups = []; // [from, to] 0-based line indices
for (let i = 0; i < L.length;) { const n = 2; groups.push([i, Math.min(L.length - 1, i + n - 1)]); i += n; }
const rows = groups.map(([a, b], k) => {
  const start = k === 0 ? 0 : L[a].start; const end = groups[k + 1] ? L[groups[k + 1][0]].start : t.duration;
  return `- shot ${k + 1}: lines ${a}-${b} (index), ${fmt(start)}–${fmt(end)} (${(end - start).toFixed(1)} s) · ${L[a].label} · “${L.slice(a, b + 1).map((x) => x.text).join(' / ')}”`;
});
const text = `Project 05 "Mira and Mango: Up and Down!" — animation direction for the FINAL SONG "Slow and Fast" (Suno, 3:32.4). Line times are measured from the real vocals.

CAST & SCALE: Mira (card 50, two-legged rig with walk/run clips) is a 5-year-old girl: scale 0.75 (about 1.1 m). Mango (card 51, four-legged rig with walk/run clips) is her chubby puppy: scale 0.38 (about 0.55 m). Props: Big Red Kite (card 54, a sky object: y 3.5–4.5) and Pink Balloon Bunch (card 55, scale 1.4). Places: Sunny Backyard Garden (card 52, setting_scale 0.75) for line indices 0–23; Sunny Meadow 3 (card 53, setting_scale 1.2) for indices 24–47. Use only these six assets.

GOLDEN RULES
- Use EXACTLY the shots listed below (same line ranges), so each shot is about 5 s. Fit every action inside the shot's length.
- Mira sings; Mango reacts. Never the same move at the same moment (stagger by at least 0.5 s). Each character gets 2–3 actions per shot with its own timing; they look at / turn to each other when not facing the viewer.
- Keep them at least 1.2 m apart; paths never cross each other or the props. Walk/run across the frame or toward the camera, never away. Feet on the ground (y 0); only the kite and the balloons go up.
- Face the camera (rot_y 0) when singing to the viewer.
- Cameras: never closeup or follow a sky object (the kite or balloons). Open each place wide, then full and medium shots, close-ups for key words (Mango's close-ups on his lines). Never the same size three times in a row. The SECOND "Verse 2" (indices 16–19) uses different camera angles and actions from the first one (indices 8–11). Repeat the chorus camera pattern in every normal chorus; the slow chorus (indices 40–43) uses slow orbits and dolly-ins and gentle actions (sway, nod, stretch).
- Lighting: garden = morning (indices 0–23), meadow = day (24–31), meadow = sunset (32–47).
- Transitions: dissolve into every chorus, iris at the place change (index 24), cut otherwise.
- Long instrumental parts are added later as separate shots; just end each shot with a pleasant pose.

SHOTS (line indices are 0-based)
${rows.join('\n')}

STAGING NOTES: verse 1 = slow walk then fast run around the garden lawn; verse 2 = Mira jumps / bows, Mango wags, balloons float up by the fence; verse 3 = red kite high then swooping low, Mango sniffs the flowers; verse 4 = nod yes, shake no, wave hello and goodbye to the setting sun; final chorus = balloons float up, final bow.`;
fs.writeFileSync(path.join(DIR, '..', 'animation-direction-suno.md'), text);
console.log(text.length, 'chars,', groups.length, 'shots');
