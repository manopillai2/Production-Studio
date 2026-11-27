// SQLite storage using Node's built-in node:sqlite (no native build step on Windows).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { DB_PATH, STORAGE_DIR, MEDIA_DIR } from './paths.js';

fs.mkdirSync(STORAGE_DIR, { recursive: true });
fs.mkdirSync(MEDIA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER,
  title TEXT NOT NULL,
  title_ta TEXT DEFAULT '',
  language TEXT DEFAULT 'both',
  theme TEXT DEFAULT '',
  learning_goals TEXT DEFAULT '',
  target_duration REAL DEFAULT 60,
  notes TEXT DEFAULT '',
  master_audio_id INTEGER,
  approved_lyrics_id INTEGER,
  youtube_title TEXT DEFAULT '',
  youtube_description TEXT DEFAULT '',
  thumbnail_path TEXT,
  caption_style TEXT DEFAULT '{}',
  caption_language TEXT DEFAULT 'both',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,              -- character | location | prop
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  notes TEXT DEFAULT '',           -- personality / lighting notes
  blender_link TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS item_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',     -- draft | approved
  created_at TEXT DEFAULT (datetime('now')),
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL,        -- version | episode | shot | channel
  owner_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  label TEXT DEFAULT '',
  file_path TEXT NOT NULL,         -- relative to storage/media
  mime TEXT DEFAULT '',
  width INTEGER, height INTEGER, duration REAL,
  source TEXT DEFAULT 'import',    -- import | sample | blender | generated:<provider>
  status TEXT DEFAULT 'draft',     -- draft | approved
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS episode_cast (
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  version_id INTEGER REFERENCES item_versions(id),
  PRIMARY KEY (episode_id, item_id)
);

CREATE TABLE IF NOT EXISTS lyrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  title TEXT DEFAULT '',
  sections TEXT DEFAULT '[]',      -- [{type,label,lines:[{ta,en,cue}]}]
  status TEXT DEFAULT 'draft',
  notes TEXT DEFAULT '',
  source TEXT DEFAULT 'manual',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  title TEXT DEFAULT '',
  lyric_cue TEXT DEFAULT '',
  character_item_id INTEGER,
  location_item_id INTEGER,
  ref_asset_id INTEGER,
  motion_notes TEXT DEFAULT '',
  look TEXT DEFAULT 'Bright colorful 3D',
  duration REAL DEFAULT 4,
  approved_clip_id INTEGER,
  trim_in REAL DEFAULT 0,
  trim_out REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS captions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  start REAL NOT NULL,
  end REAL NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  episode_id INTEGER,
  status TEXT DEFAULT 'queued',    -- queued | running | done | error
  progress REAL DEFAULT 0,
  message TEXT DEFAULT '',
  params TEXT DEFAULT '{}',
  output TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
`);

// ---- v0.2: staged projects, assistants, character development ----
const addCol = (table, col, def) => { try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch { /* already exists */ } };
addCol('item_versions', 'spec', `TEXT DEFAULT '{}'`);   // design spec developed with the assistant
addCol('episodes', 'music_brief', `TEXT DEFAULT '{}'`); // {options:[...], chosen: n, source}
db.exec(`
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,             -- lyrics | music | item:<id>
  role TEXT NOT NULL,              -- user | assistant
  content TEXT NOT NULL,
  ref TEXT DEFAULT '{}',           -- e.g. {"lyrics_id": 4}
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_scope ON chat_messages(scope, episode_id);
CREATE TABLE IF NOT EXISTS cast_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,              -- character | location | prop
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  appears_in TEXT DEFAULT '',
  item_id INTEGER,                 -- matching library item, if any
  status TEXT DEFAULT 'suggested', -- suggested | added | dismissed
  source TEXT DEFAULT 'offline',
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// ---- v0.5: five-stage workflow ----
addCol('episodes', 'review_flags', `TEXT DEFAULT '{}'`); // {cast|timing|shots|export: {reason, at}}
addCol('episodes', 'timing', `TEXT DEFAULT '{}'`);       // {lyrics_id, audio_id, approved, lines:[{i,text,start,end}]}
addCol('episodes', 'director', `TEXT DEFAULT '{}'`);     // Stage 4 direction for Claude + Claude's last response {message, last:{mode,reply,did[],cannot[],at}}
db.exec(`
CREATE TABLE IF NOT EXISTS asset_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                 -- character | location | prop
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  usages TEXT DEFAULT '[]',           -- [lyric line index]
  signature TEXT DEFAULT '',          -- recognizable features (recurring characters)
  match_item_id INTEGER,              -- My World match found by the search
  decision TEXT DEFAULT 'pending',    -- pending | reuse | new
  prompt TEXT DEFAULT '',
  texture_prompt TEXT DEFAULT '',
  pose TEXT DEFAULT 'none',
  status TEXT DEFAULT 'draft',        -- match | draft | generating | review | approved | failed
  model_path TEXT, thumb_path TEXT, model_source TEXT,
  job_id INTEGER, error TEXT,
  approved_at TEXT,
  item_id INTEGER, saved_version_id INTEGER, saved_at TEXT, -- My World copy (independent of browser download)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS scene_shots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episode_id INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  title TEXT DEFAULT '',
  line_from INTEGER, line_to INTEGER, -- lyric lines covered (timing comes from Stage 3)
  start_override REAL, end_override REAL,
  setting TEXT DEFAULT '{}',          -- {card_id}
  actors TEXT DEFAULT '[]',           -- [{card_id, pos, rot, scale, motion:{type,...}, clip:{asset_id,name,speed,offset}}]
  camera TEXT DEFAULT '{}',           -- {preset, ...params}
  lighting TEXT DEFAULT '{}',         -- {preset}
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS meshy_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT DEFAULT (datetime('now')),
  method TEXT, path TEXT, purpose TEXT, episode_id INTEGER, ref TEXT
);
`);

addCol('asset_cards', 'method', `TEXT DEFAULT 'procedural'`); // procedural | local_ai | import | meshy | library
addCol('asset_cards', 'recipe', `TEXT`);                      // editable procedural recipe (JSON)
addCol('asset_cards', 'mapping', `TEXT DEFAULT '{}'`);        // {template, applied[], unsupported[], message}
addCol('asset_cards', 'ref_image_path', `TEXT`);              // reference image for Local AI
addCol('asset_cards', 'revision_id', `INTEGER`);              // revision currently shown
addCol('asset_cards', 'preview', `TEXT`);                     // Meshy preview image {image_path, prompt, settings, task_id, at}
addCol('asset_cards', 'user_notes', `TEXT DEFAULT ''`);       // the user's own ideas for this asset — Claude must follow them
addCol('episodes', 'cast_notes', `TEXT DEFAULT '{}'`);
addCol('episodes', 'look', `TEXT DEFAULT '{}'`);
addCol('asset_cards', 'look_check', `TEXT`);
addCol('asset_cards', 'landscape', `TEXT`);       // scenery only: the landscape around this place {sky, clouds, hills, trees, dressing, ground, hill_tint, time_of_day, why}
addCol('episodes', 'landscape_plan', `TEXT`);      // Stage 2: Claude's / the offline plan of where the story happens {plan, at, source, reference}       // Claude's check that the model matches its name: {verdict, looks_like, issues[], suggestion, at, model_path}              // Stage 4 project look: landscape (sky, clouds, hills, trees, dressing), title/end cards, karaoke, default transition        // {characters, scenery}: the user's ideas for Stage 2 — Claude must follow them
db.exec(`
CREATE TABLE IF NOT EXISTS card_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL REFERENCES asset_cards(id) ON DELETE CASCADE,
  n INTEGER NOT NULL,
  method TEXT NOT NULL,              -- procedural | local_ai | import | meshy | recolor | library
  recipe TEXT,                       -- procedural recipe at this revision
  model_path TEXT,
  note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
`);

addCol('card_revisions', 'style_version', `TEXT`);
addCol('card_revisions', 'rig', `TEXT`);
addCol('card_revisions', 'direction', `TEXT`); // what this result was made from: {prompt, texture_prompt, from_preview, preview_image, pose, rig}
addCol('card_revisions', 'feedback', `TEXT`);  // the user's review notes on this result: [{text, at}]
addCol('asset_cards', 'rig_type', `TEXT`); // biped | quadruped | none — which skeleton this character needs (Claude decides; user can override)
addCol('asset_cards', 'rig_note', `TEXT`); // why // Meshy rig made with this result: {rig, clips:[{name,path}], meshy_rig_task_id, created} // which World Style version produced this result

// v0.3: one language per project ("both" was Tamil + English → Tamil with English meaning).
db.exec(`UPDATE episodes SET language='ta' WHERE language IS NULL OR language='both'`);
db.exec(`UPDATE episodes SET caption_language='native' WHERE caption_language IN ('both','ta')`);

// Any job left "running" by a previous server process can never finish.
// (Meshy jobs are resumed instead — see meshy.js resumeJobs.)
db.prepare(`UPDATE jobs SET status='error', message='Server restarted while this job was running. Start it again.' WHERE status IN ('queued','running') AND type NOT LIKE 'meshy-%'`).run();

export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function getSetting(key, fallback = null) {
  const r = one('SELECT value FROM settings WHERE key=?', key);
  return r ? JSON.parse(r.value) : fallback;
}
export function setSetting(key, value) {
  run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value));
}
