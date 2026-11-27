// Project 06 step 1: duplicate Project 05 (episode 16) as Project 06.
// Same lyrics, same music (+ timing), same characters (Mira, Mango with their rigs/clips). Nothing else is copied:
// sceneries, props, landscape and the animation direction are made new for Project 06.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = new DatabaseSync(path.join(ROOT, 'storage', 'studio.sqlite'));
const one = (s, ...p) => db.prepare(s).get(...p);
const run = (s, ...p) => db.prepare(s).run(...p);
const SRC = 16;

if (one("SELECT id FROM episodes WHERE number=6")) { console.log('Project 6 already exists:', one('SELECT id, title FROM episodes WHERE number=6')); process.exit(0); }
const ep = one('SELECT * FROM episodes WHERE id=?', SRC);
db.exec('BEGIN');
try {
  const title = 'Mira and Mango: Playground Party!';
  const e = run(`INSERT INTO episodes(number,title,title_ta,language,theme,learning_goals,target_duration,notes,youtube_title,youtube_description,caption_style,caption_language,music_brief,review_flags,timing,director,cast_notes,look,landscape_plan)
    VALUES(6,?,?,?,?,?,?,?,?,?,?,?,?,'{}','{}','{}',?,'{}','{}')`,
    title, ep.title_ta, ep.language, 'A colourful playground adventure: Mira and her puppy Mango play on a seesaw, swings, a slide and a merry-go-round while singing about slow and fast, up and down.',
    ep.learning_goals, ep.target_duration, 'Duplicated from Project 05: same lyrics, music and characters. New sceneries, props, landscape and direction.',
    title, ep.youtube_description, ep.caption_style, ep.caption_language, ep.music_brief, ep.cast_notes);
  const id = Number(e.lastInsertRowid);
  // lyrics (approved version only)
  const ly = one('SELECT * FROM lyrics WHERE id=?', ep.approved_lyrics_id);
  const lyId = Number(run('INSERT INTO lyrics(episode_id,title,sections,status,notes,source) VALUES(?,?,?,?,?,?)', id, ly.title.replace(/·.*/, '· Project 06'), ly.sections, 'approved', ly.notes, ly.source).lastInsertRowid);
  // the song (file copied, so the projects stay independent)
  const au = one('SELECT * FROM assets WHERE id=?', ep.master_audio_id);
  const rel = `episode/${id}/${path.basename(au.file_path)}`;
  fs.mkdirSync(path.join(ROOT, 'storage', 'media', 'episode', String(id)), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'storage', 'media', au.file_path), path.join(ROOT, 'storage', 'media', rel));
  const auId = Number(run('INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,width,height,duration,source,status,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    'episode', id, au.category, au.label, rel, au.mime, au.width, au.height, au.duration, au.source, 'approved', 'Copied from Project 05').lastInsertRowid);
  // timing: same measured line times, pointing at the new lyrics + song
  const timing = JSON.parse(ep.timing || '{}'); timing.lyrics_id = lyId; timing.audio_id = auId;
  run('UPDATE episodes SET approved_lyrics_id=?, master_audio_id=?, timing=? WHERE id=?', lyId, auId, JSON.stringify(timing), id);
  // characters: Mira and Mango (same My World versions, so the same rigs and clips)
  for (const cid of [50, 51]) {
    const c = one('SELECT * FROM asset_cards WHERE id=?', cid);
    const cols = Object.keys(c).filter((k) => !['id', 'episode_id', 'created_at', 'updated_at'].includes(k));
    run(`INSERT INTO asset_cards(episode_id,${cols.join(',')}) VALUES(?,${cols.map(() => '?').join(',')})`, id, ...cols.map((k) => c[k]));
    run('INSERT OR IGNORE INTO episode_cast(episode_id,item_id,version_id) SELECT ?, item_id, version_id FROM episode_cast WHERE episode_id=? AND item_id=?', id, SRC, c.item_id);
  }
  db.exec('COMMIT');
  console.log(JSON.stringify({ project: 6, episode_id: id, title, lyrics_id: lyId, audio_id: auId, lines: timing.lines?.length }));
} catch (e) { db.exec('ROLLBACK'); throw e; }
