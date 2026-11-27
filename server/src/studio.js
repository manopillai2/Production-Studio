// Routes for the five-stage workflow (Stages 2–5). Registered from index.js.
import fs from 'node:fs';
import path from 'node:path';
import { one, all, run, tx, getSetting } from './db.js';
import { MEDIA_DIR, TMP_DIR } from './paths.js';
import { runFfmpeg, FFMPEG, probe } from './media.js';
import { cardOut, cardsFor, sceneShotOut, sceneShotsFor, libraryPreview, flagStages, clearFlag, episodeFull, jobOut, channel } from './model.js';
import { toSrt } from './export.js';
import { sungLine, isEnglish } from './langs.js';
import * as providers from './providers.js';
import * as meshy from './meshy.js';
import * as localai from './localai.js';
import { scanLyrics } from './offline.js';
import { templateList, mapDescription, buildFromRecipe, normalizeRecipe, draftDescription, TEMPLATES, uniquenessReport, makeUnique, restyleRecipe } from './procedural.js';
import { listMaterials, recolorMaterial, parseGLB, applyFinish } from './glbedit.js';
import { currentProfile, snapshot, profileVersion as styleVersion, paletteFit } from './style.js';
import { spawnSync } from 'node:child_process';
import { movesFor, moveById } from '../../client/src/engine/moveCatalog.js'; // shared with the 3D engine and the Stage 4 editor

const slug = (s) => String(s || 'asset').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'asset';
const writeRel = (rel, buf) => { const abs = path.join(MEDIA_DIR, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, buf); return rel; };
const ACTIVE_GEN = `(type LIKE 'meshy-%' OR type LIKE 'localai-%') AND status IN ('queued','running')`;

export function registerStudio(app, ctx) {
  const { h, need, HttpError, upload, touchEpisode, findMatch, libraryText, worldContext, worldContextFull, worldFor, cleanupTmp } = ctx;
  const getCard = (id) => need(one('SELECT * FROM asset_cards WHERE id=?', Number(id)), 'Asset card');
  // ---- World Style everywhere ----
  const S = () => snapshot(currentProfile()); // the style snapshot new recipes are built with
  /** Locked designs (My World) + other approved cards: what a new design must differ from. Revisions of the same item are allowed. */
  const lockedRecipes = (card) => {
    const seen = new Set();
    return [
      ...all(`SELECT i.id item_id, i.name, v.spec FROM items i JOIN item_versions v ON v.id=(SELECT id FROM item_versions WHERE item_id=i.id AND status='approved' ORDER BY id DESC LIMIT 1)`)
        .map((r) => ({ item_id: r.item_id, name: r.name, recipe: JSON.parse(r.spec || '{}').recipe })),
      ...all(`SELECT id card_id, name, recipe, item_id FROM asset_cards WHERE status='approved' AND recipe IS NOT NULL AND id != ?`, card.id).map((c) => ({ ...c, recipe: JSON.parse(c.recipe) })),
    ].filter((o) => o.recipe && TEMPLATES[o.recipe.template] && !(card.item_id && o.item_id === card.item_id))
      .filter((o) => { const k = o.item_id ? `i${o.item_id}` : `c${o.card_id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  };
  const uniq = (card) => { try { return card.recipe ? uniquenessReport(JSON.parse(card.recipe), lockedRecipes(card)) : null; } catch { return null; } };
  /** Exactly what “Generate in Meshy” will send: card prompt + World Style summary + uniqueness clause (≤ 800 chars). */
  const meshyPrompt = (c) => {
    let summary = channel().world_style_summary || '';
    // Scenery and props get only the non-character parts of the summary: "creatures, oversized heads, glossy eyes,
    // fur tufts" made Meshy put little creatures into empty sets.
    if (c.kind !== 'character') summary = summary.split(/(?<=\.)\s+/).filter((x) => !/creature|head|eye|cheek|fur|tuft|character/i.test(x)).join(' ');
    const style = summary && !String(c.prompt || '').includes(summary.slice(0, 40)) ? ` World style: ${summary}` : '';
    // No "clearly different from: <names>" list: it wasted the 800-character limit. Uniqueness is handled when
    // Claude writes the prompt (it sees every locked design), so the whole budget goes to describing this asset.
    const unique = '';
    // Fit the card prompt into what is left of the 800 characters by whole sentences, and never drop the "No …" /
    // "Never …" sentences (cutting mid-sentence used to remove "No animals, creatures…" from scenery prompts).
    const fit = (text, max) => {
      const t = String(text || '').trim(); if (t.length <= max) return t;
      const sents = t.split(/(?<=[.!?])\s+/); const neg = sents.filter((x) => /^(no|never|without|only)\b/i.test(x)); const pos = sents.filter((x) => !neg.includes(x));
      let out = ''; const negText = neg.join(' ');
      for (const x of pos) { if ((out + ' ' + x + ' ' + negText).trim().length > max) break; out = `${out} ${x}`.trim(); }
      return `${out} ${negText}`.trim().slice(0, max);
    };
    const base = fit(c.prompt, Math.max(200, 800 - style.length - unique.length));
    // Meshy paints from the texture prompt alone, so it must say WHAT to colour, not just list colours
    // (a bare palette list made a whole house oat-cream). Describe the object, then ask for varied palette colours.
    const prof = currentProfile();
    const palette = [...new Set(prof.palette.all.map((x) => x.name.replace('-', ' ')))].slice(0, 10).join(', ');
    const what = String(c.texture_prompt || '').trim() || base.replace(/World style:.*$/i, '').replace(/Original design, clearly different from:.*$/i, '').trim().slice(0, 360);
    const colourRule = palette ? ` Clearly different colours for each part (for example roof, walls, door, windows, trim, or fur, ears, paws), chosen from this palette: ${palette}. Golden yellow only for one small focal accent. Rich, warm colours, not monochrome.` : '';
    const tex = `${what}${colourRule}`.trim().slice(0, 600);
    return { final: `${base}${style}${unique}`.slice(0, 800), base, style: style.trim(), unique: unique.trim(), texture: tex };
  };
  const parseJSON = (t, d) => { try { return t ? JSON.parse(t) : d; } catch { return d; } };
  /** The direction a Meshy job was given (exact prompt sent, texture, preview image, pose, rig). */
  const directionFromJob = (job) => {
    const p = parseJSON(job?.params, null);
    if (!p) return null;
    return { prompt: p.prompt || '', texture_prompt: p.texture_prompt || '', from_preview: !!p.image_path, preview_image: p.image_path || null, pose: p.pose || 'none', rig: p.rig ? (p.animation_type || 'biped') : null };
  };
  /** A revision's stored direction; older Meshy results get it from the job that made them (saved for next time). */
  const directionOf = (r) => {
    if (r.direction) return parseJSON(r.direction, null);
    if (r.method !== 'meshy' || !r.model_path) return null;
    const d = directionFromJob(one(`SELECT params FROM jobs WHERE type='meshy-3d' AND json_extract(output,'$.model_path')=? ORDER BY id DESC LIMIT 1`, r.model_path));
    if (d) run('UPDATE card_revisions SET direction=? WHERE id=?', JSON.stringify(d), r.id);
    return d;
  };
  const previewOf = (c) => { try { return c?.preview ? JSON.parse(c.preview) : null; } catch { return null; } };
  const out = (id) => {
    const c = one('SELECT * FROM asset_cards WHERE id=?', id);
    const revisions = all('SELECT id,n,method,note,created_at,model_path,style_version,rig,direction,feedback FROM card_revisions WHERE card_id=? ORDER BY n DESC', id).map((r) => ({ ...r, rig: r.rig ? JSON.parse(r.rig) : null, direction: directionOf(r), feedback: parseJSON(r.feedback, []) }));
    const rig = revisions.find((r) => r.id === c?.revision_id)?.rig || null;
    return { ...cardOut(c), revisions, rig: rig && { clips: rig.clips.map((x) => x.name), rig_url: `/media/${rig.rig}`, animation_type: rig.animation_type || 'biped' }, recipe: parseRecipe(id), mapping: JSON.parse(c?.mapping || '{}'), uniqueness: uniq(c),
      preview: previewOf(c), preview_job: one(`SELECT id, status, message, progress FROM jobs WHERE type='meshy-preview' AND json_extract(params,'$.card_id')=? ORDER BY id DESC LIMIT 1`, id) || null,
      style_current: styleVersion(), style_stale: !!revisions[0]?.style_version && revisions[0].style_version !== styleVersion() };
  };
  const parseRecipe = (id) => { const r = one('SELECT recipe FROM asset_cards WHERE id=?', id)?.recipe; return r ? JSON.parse(r) : null; };
  const approvedLines = (epId) => {
    const ep = one('SELECT * FROM episodes WHERE id=?', epId);
    const l = ep?.approved_lyrics_id && one('SELECT * FROM lyrics WHERE id=?', ep.approved_lyrics_id);
    if (!l) return null;
    return JSON.parse(l.sections).flatMap((s) => s.lines).filter((x) => sungLine(x, ep.language).trim() || x.en?.trim()).map((x) => ({ ...x, text: sungLine(x, ep.language) || x.en }));
  };
  const assertNoActiveGen = (epId) => {
    const a = one(`SELECT id, type FROM jobs WHERE episode_id=? AND ${ACTIVE_GEN}`, epId);
    if (a) throw new HttpError(409, `A generation is already running for this project (job #${a.id}, ${a.type.startsWith('meshy') ? 'Meshy' : 'Local AI'}). One at a time — wait for it to finish.`);
  };
  /** Record a new result for a card (every build/import/generation/recolour is kept as a revision). */
  const addRevision = (cardId, { method, recipe = null, model_path, note = '', direction = null }) => {
    const n = one('SELECT COALESCE(MAX(n),0)+1 n FROM card_revisions WHERE card_id=?', cardId).n;
    const rid = Number(run('INSERT INTO card_revisions(card_id,n,method,recipe,model_path,note,style_version,direction) VALUES(?,?,?,?,?,?,?,?)', cardId, n, method, recipe ? JSON.stringify(recipe) : null, model_path, note, recipe?.style?.version || styleVersion(), direction ? JSON.stringify(direction) : null).lastInsertRowid);
    run(`UPDATE asset_cards SET revision_id=?, model_path=?, model_source=?, status='review', approved_at=NULL, saved_at=NULL, saved_version_id=NULL, error=NULL,
         ${recipe ? 'recipe=?,' : ''} updated_at=datetime('now') WHERE id=?`, rid, model_path, method, ...(recipe ? [JSON.stringify(recipe)] : []), cardId);
    return rid;
  };
  const flagShotsFor = (card) => flagStages(card.episode_id, { shots: `“${card.name}” changed in Stage 2`, export: 'Assets changed after the last export' });

  /** Store a Meshy rig (+ its walk/run clips) on a My World version. Labels follow "Walking (Meshy)" so Stage 4 finds them. */
  const attachRig = (versionId, r, status) => {
    const cap = (s) => `${s[0].toUpperCase()}${s.slice(1)}`;
    run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,source,status,notes) VALUES('version',?, 'rig', ?, ?, 'model/gltf-binary', 'generated:meshy-rig', ?, ?)`,
      versionId, `Rigged model (Meshy, ${r.animation_type === 'quadruped' ? 'four-legged' : 'two-legged'})`, r.rig, status, JSON.stringify({ meshy_rig_task_id: r.meshy_rig_task_id, animation_type: r.animation_type || 'biped', created: r.created || Date.now() }));
    for (const c of r.clips || []) run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,source,status,notes) VALUES('version',?, 'clip', ?, ?, 'model/gltf-binary', 'generated:meshy-rig', ?, ?)`,
      versionId, `${cap(c.name)} (Meshy)`, c.path, status, JSON.stringify({ self_contained: true }));
  };
  /** A card saved to My World before its rig arrived: copy the rig (and clips) into the saved version. Safe to call any time. */
  const syncRigToWorld = (cardId) => {
    const c = one('SELECT * FROM asset_cards WHERE id=?', cardId);
    if (!c?.saved_version_id || !c.revision_id) return false;
    const rv = one('SELECT rig FROM card_revisions WHERE id=?', c.revision_id)?.rig;
    if (!rv || one(`SELECT id FROM assets WHERE owner_type='version' AND owner_id=? AND category='rig'`, c.saved_version_id)) return false;
    const r = JSON.parse(rv);
    if (!fs.existsSync(path.join(MEDIA_DIR, r.rig))) return false;
    const item = one('SELECT item_id FROM item_versions WHERE id=?', c.saved_version_id)?.item_id;
    const keep = (from, suffix) => { const to = `world/${item}/${slug(c.name)}-${suffix}.glb`; fs.copyFileSync(path.join(MEDIA_DIR, from), path.join(MEDIA_DIR, to)); return to; };
    attachRig(c.saved_version_id, { ...r, rig: keep(r.rig, 'rig'), clips: (r.clips || []).filter((x) => fs.existsSync(path.join(MEDIA_DIR, x.path))).map((x) => ({ ...x, path: keep(x.path, slug(x.name)) })) }, 'approved');
    console.log(`  Rig for “${c.name}” copied into My World (it arrived after the model was saved).`);
    return true;
  };
  // Repair: cards saved before their rig finished (e.g. by an earlier version of the director follow-up).
  setImmediate(() => { for (const c of all('SELECT id FROM asset_cards WHERE saved_version_id IS NOT NULL')) { try { syncRigToWorld(c.id); } catch (e) { console.error('rig sync', c.id, e.message); } } });

  // Hooks for background generators (results come back as new revisions — never auto-approved).
  meshy.setHooks({
    onCardPreview: (cardId, r) => { if (one('SELECT id FROM asset_cards WHERE id=?', cardId)) run('UPDATE asset_cards SET preview=? WHERE id=?', JSON.stringify({ ...r, at: new Date().toISOString() }), cardId); },
    onCardResult: (cardId, r) => { if (one('SELECT id FROM asset_cards WHERE id=?', cardId)) { const d = directionFromJob(one('SELECT params FROM jobs WHERE id=?', r.job_id)); addRevision(cardId, { method: 'meshy', model_path: r.model_path, note: d?.from_preview ? 'Meshy 3D from the preview image' : 'Meshy text-to-3D', direction: d }); } if (r.thumb_path) run('UPDATE asset_cards SET thumb_path=? WHERE id=?', r.thumb_path, cardId); },
    onCardFailed: (cardId, msg) => run(`UPDATE asset_cards SET status=CASE WHEN model_path IS NULL THEN 'failed' ELSE 'review' END, error=? WHERE id=?`, msg, cardId),
    onCardRig: (cardId, r) => {
      // Attach the rig to the revision it was made from (the model shown on the card).
      run('UPDATE card_revisions SET rig=? WHERE card_id=? AND model_path=?', JSON.stringify({ rig: r.rig, clips: r.clips, meshy_rig_task_id: r.meshy_rig_task_id, animation_type: r.animation_type, created: r.created }), cardId, r.model_path);
      syncRigToWorld(cardId); // the card may already be saved to My World (rigging finishes after the model)
    },
    onRigResult: (itemId, r) => {
      const v = (r.version_id && one('SELECT id FROM item_versions WHERE id=? AND item_id=?', r.version_id, itemId))
        || one(`SELECT id FROM item_versions WHERE item_id=? AND status='approved' ORDER BY id DESC LIMIT 1`, itemId) || one('SELECT id FROM item_versions WHERE item_id=? ORDER BY id DESC LIMIT 1', itemId);
      attachRig(v.id, r, 'draft');
    },
    // A new model for a My World item (from its page): a new draft version, to check and lock.
    onItemModel: (itemId, r) => {
      const n = one('SELECT COUNT(*) n FROM item_versions WHERE item_id=?', itemId).n + 1;
      const vid = Number(run(`INSERT INTO item_versions(item_id,label,status,spec,notes) VALUES(?,?, 'draft', ?, ?)`, itemId, `Draft ${n}`, JSON.stringify(r.spec || {}), String(r.note || '').slice(0, 300)).lastInsertRowid);
      run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,source,status) VALUES('version',?, 'model3d', ?, ?, 'model/gltf-binary', 'generated:meshy', 'approved')`, vid, `3D model (Draft ${n})`, r.model_path);
      if (r.thumb_path) run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,source,status) VALUES('version',?, 'render', 'Preview', ?, 'image/png', 'generated:meshy', 'approved')`, vid, r.thumb_path);
      return vid;
    },
    onItemRig: (itemId, versionId, r) => { if (versionId) attachRig(versionId, r, 'approved'); },
    onClipResult: (itemId, r) => {
      const v = one(`SELECT id FROM item_versions WHERE item_id=? AND status='approved' ORDER BY id DESC LIMIT 1`, itemId) || one('SELECT id FROM item_versions WHERE item_id=? ORDER BY id DESC LIMIT 1', itemId);
      run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,source,status,notes) VALUES('version',?, 'clip', ?, ?, 'model/gltf-binary', 'generated:meshy-anim', 'draft', ?)`, v.id, `${r.name} (Meshy clip)`, r.path, JSON.stringify({ self_contained: true }));
    },
  });
  localai.setHooks({
    onResult: (cardId, r) => {
      // World Style finish on the AI result (satin fur, no metal), keeping its geometry and textures.
      try { const abs = path.join(MEDIA_DIR, r.model_path); fs.writeFileSync(abs, applyFinish(fs.readFileSync(abs), { roughness: currentProfile().finish.fur })); } catch { /* keep the raw result */ }
      addRevision(cardId, { method: 'local_ai', model_path: r.model_path, note: `${r.note} · World Style finish applied` });
    },
    onFailed: (cardId, msg) => run(`UPDATE asset_cards SET status=CASE WHEN model_path IS NULL THEN 'failed' ELSE 'review' END, error=? WHERE id=?`, msg, cardId),
  });

  // ================= Stage 2: characters, scenery & props =================
  app.get('/api/procedural/templates', h(() => templateList(S())));
  app.post('/api/procedural/map', h((req) => mapDescription({ ...req.body, style: S() })));
  /** Live preview while editing a recipe (nothing is saved). */
  app.post('/api/procedural/preview', (req, res, next) => {
    try { res.type('model/gltf-binary').send(buildFromRecipe(req.body.recipe, S())); } catch (e) { e.status = 400; next(e); }
  });

  app.get('/api/episodes/:id/cards', h((req) => cardsFor(+req.params.id).map((c) => out(c.id))));
  app.get('/api/cards/:id', h((req) => out(getCard(req.params.id).id)));

  /** Analyze approved lyrics + search My World + draft descriptions/recipes/prompts. Never calls Meshy. */
  app.post('/api/episodes/:id/cards/analyze', h(async (req) => {
    const epId = +req.params.id;
    const before = meshy.meshyCallCount();
    const lines = approvedLines(epId);
    if (!lines) throw new HttpError(400, 'Approve the lyrics in Stage 1 first — Stage 2 analyzes the approved version.');
    const ai = req.body.mode === 'ai' && providers.isActive('claude');
    const world = ai ? await worldFor(req.body.reference) : worldContext();
    const reuse = !ai || world.mode === 'world+cast'; // "My World" or "Something new" = don't match existing designs
    let items, source;
    if (ai) {
      const r = await providers.analyzeAssets({ lines: lines.map((l) => `${l.text}${l.cue ? `  [on screen: ${l.cue}]` : ''}`), world, library: reuse ? libraryText() : 'none to reuse (the user asked for new designs)', notes: castNotesOf(epId) });
      items = (r.items || []).filter((x) => x?.name).map((x) => ({ ...x, signature: x.signature_features || '', usages: (x.usages || []).filter((i) => Number.isInteger(i) && i >= 0 && i < lines.length) }));
      source = 'claude';
    } else {
      const found = new Map();
      lines.forEach((l, i) => scanLyrics([{ ta: l.ta, en: `${l.en} ${l.cue || ''}` }]).forEach((s) => { const f = found.get(s.name) || { ...s, usages: [] }; f.usages.push(i); found.set(s.name, f); }));
      // Named recurring characters from My World (e.g. "Pip the Sky Bunny" is found by "Pip").
      for (const it of all('SELECT id, name, kind FROM items')) {
        const proper = it.name.split(/ the /i)[0].trim();
        if (proper.length < 3) continue;
        const re = new RegExp(`\\b${proper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        const uses = lines.map((l, i) => (re.test(`${l.text} ${l.en} ${l.cue || ''}`) ? i : -1)).filter((i) => i >= 0);
        if (!uses.length) continue;
        for (const [k, f] of found) if (f.kind === it.kind && (k.toLowerCase().includes(proper.toLowerCase()) || proper.toLowerCase().includes(k.toLowerCase()))) found.delete(k);
        found.set(it.name, { kind: it.kind, name: it.name, usages: uses, reuse_name: it.name });
      }
      items = [...found.values()];
      source = 'offline';
    }
    tx(() => {
      const seen = new Set();
      for (const it of items) {
        const kind = ['character', 'location', 'prop'].includes(it.kind) ? it.kind : 'prop';
        const existing = one('SELECT * FROM asset_cards WHERE episode_id=? AND lower(name)=lower(?)', epId, it.name);
        if (existing) {
          run(`UPDATE asset_cards SET usages=?, updated_at=datetime('now') WHERE id=?`, JSON.stringify(it.usages || []), existing.id);
          // A card that is still an untouched draft (nothing built, generated or reused yet) takes Claude's new design,
          // so changed ideas or lyrics reach it. Anything you already built, approved or reused is left alone.
          if (source === 'claude' && existing.status === 'draft' && !existing.model_path && existing.decision !== 'reuse') {
            run(`UPDATE asset_cards SET description=COALESCE(NULLIF(?, ''), description), signature=COALESCE(NULLIF(?, ''), signature),
                 prompt=COALESCE(NULLIF(?, ''), prompt), texture_prompt=COALESCE(NULLIF(?, ''), texture_prompt) WHERE id=?`,
              it.description || '', it.signature || '', String(it.meshy_prompt || '').slice(0, 780), String(it.texture_prompt || '').slice(0, 800), existing.id);
          }
          seen.add(existing.id); continue;
        }
        const match = reuse ? ((it.reuse_name && findMatch(it.reuse_name, kind)) || findMatch(it.name, kind)) : null;
        const description = it.description || draftDescription({ name: it.name, kind, signature: it.signature, lyricLines: (it.usages || []).map((i) => lines[i]?.text).filter(Boolean), worldGuide: world.guide });
        const map = mapDescription({ name: it.name, description, signature: it.signature, kind, style: S() });
        const styleSummary = channel().world_style_summary || '';
        const prompt = it.meshy_prompt || `${it.name}: ${description}${styleSummary ? ` Style: ${styleSummary}` : ''}`.slice(0, 780);
        const id = Number(run(`INSERT INTO asset_cards(episode_id,kind,name,description,usages,signature,match_item_id,status,prompt,texture_prompt,method,recipe,mapping)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, epId, kind, it.name, description, JSON.stringify(it.usages || []), it.signature || '', match?.id ?? null,
          match ? 'match' : 'draft', prompt, it.texture_prompt || '', map.supported ? 'procedural' : 'import', map.recipe ? JSON.stringify(map.recipe) : null,
          JSON.stringify({ template: map.recipe?.template || null, applied: map.applied, unsupported: map.unsupported, message: map.message, supported: map.supported })).lastInsertRowid);
        seen.add(id);
      }
      // Cards no longer in the lyrics are kept (with no usages) so no work is lost.
      for (const c of all('SELECT id FROM asset_cards WHERE episode_id=?', epId)) if (!seen.has(c.id) && source === 'claude') run(`UPDATE asset_cards SET usages='[]' WHERE id=?`, c.id);
    });
    clearFlag(epId, 'cast');
    touchEpisode(epId);
    return { source, meshy_calls: meshy.meshyCallCount() - before, cards: cardsFor(epId).map((c) => out(c.id)) };
  }));

  // The user's own ideas for characters and scenery — passed to Claude, which must follow them.
  const castNotesOf = (epId) => { try { return JSON.parse(one('SELECT cast_notes FROM episodes WHERE id=?', epId)?.cast_notes || '{}'); } catch { return {}; } };
  app.put('/api/episodes/:id/cast-notes', h((req) => {
    const epId = +req.params.id;
    need(one('SELECT id FROM episodes WHERE id=?', epId), 'Project');
    const n = { ...castNotesOf(epId) };
    for (const k of ['characters', 'scenery']) if (k in req.body) n[k] = String(req.body[k] ?? '').slice(0, 4000);
    run('UPDATE episodes SET cast_notes=? WHERE id=?', JSON.stringify(n), epId);
    return n;
  }));

  app.post('/api/episodes/:id/cards', h((req) => createCard(+req.params.id, req.body)));
  const createCard = (epId, { kind = 'character', name, description = '' }) => {
    const req = { params: { id: epId } };
    if (!name?.trim()) throw new HttpError(400, 'Give the asset a name.');
    const map = mapDescription({ name, description, kind, style: S() });
    const id = Number(run(`INSERT INTO asset_cards(episode_id,kind,name,description,status,method,recipe,mapping,prompt) VALUES(?,?,?,?, 'draft', ?, ?, ?, ?)`,
      +req.params.id, kind, name.trim(), description, map.supported ? 'procedural' : 'import', map.recipe ? JSON.stringify(map.recipe) : null,
      JSON.stringify({ template: map.recipe?.template || null, applied: map.applied, unsupported: map.unsupported, message: map.message, supported: map.supported }), `${name}: ${description}${channel().world_style_summary ? ` Style: ${channel().world_style_summary}` : ''}`.slice(0, 780)).lastInsertRowid);
    const match = findMatch(name, kind);
    if (match) run(`UPDATE asset_cards SET match_item_id=?, status='match' WHERE id=?`, match.id, id);
    return out(id);
  };
  app.put('/api/cards/:id', h((req) => {
    const c = getCard(req.params.id);
    const allowed = ['name', 'description', 'signature', 'prompt', 'texture_prompt', 'pose', 'kind', 'method', 'rig_type', 'user_notes'];
    if ('rig_type' in req.body && !['biped', 'quadruped', 'none'].includes(req.body.rig_type)) throw new HttpError(400, 'Rig type must be biped, quadruped or none.');
    if ('rig_type' in req.body) req.body.rig_note = 'Chosen by you';
    const keys = Object.keys(req.body).filter((k) => allowed.includes(k) || (k === 'rig_note' && 'rig_type' in req.body));
    if (keys.length) run(`UPDATE asset_cards SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=datetime('now') WHERE id=?`, ...keys.map((k) => String(req.body[k] ?? '')), c.id);
    // Which lyric lines this asset appears in (0-based). Cards added by hand start with none; the engine uses this
    // to decide who sings each line.
    if (Array.isArray(req.body.usages)) {
      const n = (approvedLines(c.episode_id) || []).length;
      run('UPDATE asset_cards SET usages=? WHERE id=?', JSON.stringify([...new Set(req.body.usages.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < n))].sort((a, b) => a - b)), c.id);
      flagShotsFor(c);
    }
    return out(c.id);
  }));
  app.delete('/api/cards/:id', h((req) => {
    const c = getCard(req.params.id);
    if (c.status === 'approved') throw new HttpError(409, 'Approved assets can’t be deleted. Un-approve first.');
    run('DELETE FROM asset_cards WHERE id=?', c.id);
  }));

  app.post('/api/cards/:id/reuse', h((req) => {
    const c = getCard(req.params.id);
    const lib = c.match_item_id && libraryPreview(c.match_item_id);
    if (!lib) throw new HttpError(400, 'No My World match to reuse.');
    tx(() => {
      run(`UPDATE asset_cards SET decision='reuse', status='approved', method='library', model_source='library', item_id=?, saved_version_id=?, saved_at=datetime('now'),
           approved_at=datetime('now'), model_path=?, recipe=?, updated_at=datetime('now') WHERE id=?`,
        lib.id, lib.version_id, lib.model?.file_path || null, lib.spec?.recipe ? JSON.stringify(lib.spec.recipe) : null, c.id);
      run(`INSERT INTO episode_cast(episode_id,item_id,version_id) VALUES(?,?,?) ON CONFLICT(episode_id,item_id) DO UPDATE SET version_id=excluded.version_id`, c.episode_id, lib.id, lib.locked ? lib.version_id : null);
    });
    flagShotsFor(c);
    return { ...out(c.id), warning: lib.model ? null : `“${lib.name}” in My World has no 3D model yet — import one or create a new design for animation.` };
  }));
  app.post('/api/cards/:id/new-design', h((req) => {
    const c = getCard(req.params.id);
    if (c.decision === 'reuse' && c.status === 'approved') run(`DELETE FROM episode_cast WHERE episode_id=? AND item_id=?`, c.episode_id, c.item_id);
    let map = null;
    if (!c.recipe) map = mapDescription({ name: c.name, description: c.description, signature: c.signature, kind: c.kind, style: S() });
    run(`UPDATE asset_cards SET decision='new', status=CASE WHEN status='match' OR decision='reuse' THEN 'draft' ELSE status END, item_id=NULL, saved_at=NULL, saved_version_id=NULL,
         model_path=CASE WHEN decision='reuse' THEN NULL ELSE model_path END ${map?.recipe ? ', recipe=?, mapping=?' : ''} WHERE id=?`,
      ...(map?.recipe ? [JSON.stringify(map.recipe), JSON.stringify({ template: map.recipe.template, applied: map.applied, unsupported: map.unsupported, message: map.message, supported: true })] : []), c.id);
    return out(c.id);
  }));

  // ---- Build Locally (procedural) ----
  app.post('/api/cards/:id/map', h((req) => {
    const c = getCard(req.params.id);
    const map = mapDescription({ name: c.name, description: req.body.description ?? c.description, signature: c.signature, kind: c.kind, style: S() });
    if (req.body.template && TEMPLATES[req.body.template]) { // manual template choice
      const recipe = normalizeRecipe({ template: req.body.template, ...(TEMPLATES[req.body.template].scenery ? { objects: mapDescription({ name: 'meadow', style: S() }).recipe.objects } : {}) }, S());
      run('UPDATE asset_cards SET recipe=?, mapping=?, method=? WHERE id=?', JSON.stringify(recipe), JSON.stringify({ template: req.body.template, applied: [`Template chosen manually: ${TEMPLATES[req.body.template].label}`], unsupported: [], message: 'Template chosen manually.', supported: true }), 'procedural', c.id);
    } else {
      run('UPDATE asset_cards SET mapping=?, recipe=COALESCE(?, recipe) WHERE id=?', JSON.stringify({ template: map.recipe?.template || null, applied: map.applied, unsupported: map.unsupported, message: map.message, supported: map.supported }), map.recipe ? JSON.stringify(map.recipe) : null, c.id);
    }
    return out(c.id);
  }));
  app.put('/api/cards/:id/recipe', h((req) => {
    const c = getCard(req.params.id);
    let recipe;
    try { recipe = normalizeRecipe(req.body.recipe, S()); } catch (e) { throw new HttpError(400, e.message); }
    run(`UPDATE asset_cards SET recipe=?, updated_at=datetime('now') WHERE id=?`, JSON.stringify(recipe), c.id);
    return out(c.id);
  }));
  app.post('/api/cards/:id/build', h((req) => {
    const c = getCard(req.params.id);
    const recipe = req.body.recipe ? normalizeRecipe(req.body.recipe, S()) : (parseRecipe(c.id) && normalizeRecipe(parseRecipe(c.id), S()));
    if (!recipe) throw new HttpError(400, 'No recipe yet. Choose a template (or fix the description) first.');
    const rel = writeRel(`cards/${c.id}/procedural-${Date.now()}.glb`, buildFromRecipe(recipe, S()));
    addRevision(c.id, { method: 'procedural', recipe, model_path: rel, note: `Built locally · ${TEMPLATES[recipe.template].label}` });
    run(`UPDATE asset_cards SET method='procedural', decision='new' WHERE id=?`, c.id);
    return out(c.id);
  }));

  // ---- Import Model ----
  app.post('/api/cards/:id/import', upload.single('files'), h((req) => {
    const c = one('SELECT * FROM asset_cards WHERE id=?', +req.params.id);
    if (!c) { cleanupTmp([req.file].filter(Boolean)); throw new HttpError(404, 'Asset card not found.'); }
    if (!req.file || !/\.glb$/i.test(req.file.originalname)) { cleanupTmp([req.file].filter(Boolean)); throw new HttpError(400, 'Import a single .glb file (export from Blender or download from Meshy as GLB).'); }
    const buf = fs.readFileSync(req.file.path);
    try { parseGLB(buf); } catch (e) { cleanupTmp([req.file]); throw new HttpError(400, `That file isn't a valid .glb: ${e.message}`); }
    const rel = writeRel(`cards/${c.id}/import-${Date.now()}-${slug(path.basename(req.file.originalname, '.glb'))}.glb`, buf);
    cleanupTmp([req.file]);
    addRevision(c.id, { method: 'import', model_path: rel, note: `Imported ${req.file.originalname}` });
    run(`UPDATE asset_cards SET method='import', decision='new' WHERE id=?`, c.id);
    return out(c.id);
  }));

  // ---- Local AI (optional) ----
  app.get('/api/localai/status', h(() => localai.status()));
  app.post('/api/cards/:id/ref-image', upload.single('files'), h((req) => {
    const c = one('SELECT * FROM asset_cards WHERE id=?', +req.params.id);
    if (!c || !req.file || !/^image\//.test(req.file.mimetype)) { cleanupTmp([req.file].filter(Boolean)); throw new HttpError(400, 'Upload one image (PNG/JPG).'); }
    const rel = `cards/${c.id}/ref-${Date.now()}${path.extname(req.file.originalname).toLowerCase() || '.png'}`;
    fs.mkdirSync(path.dirname(path.join(MEDIA_DIR, rel)), { recursive: true });
    fs.renameSync(req.file.path, path.join(MEDIA_DIR, rel));
    // Local AI builds whatever is in the reference image, so check it against the World Style palette.
    const map = JSON.parse(c.mapping || '{}');
    map.ref_check = refPaletteCheck(path.join(MEDIA_DIR, rel));
    run('UPDATE asset_cards SET ref_image_path=?, mapping=? WHERE id=?', rel, JSON.stringify(map), c.id);
    return out(c.id);
  }));
  app.post('/api/cards/:id/local-ai', h(async (req) => {
    const c = getCard(req.params.id);
    const st = await localai.status();
    const action = req.body.action === 'texture' ? 'texture' : 'shape';
    const cap = st.capabilities.find((x) => x.key === (action === 'texture' ? 'texture' : 'image_to_3d'));
    if (!cap.available) throw new HttpError(400, `Local AI ${action === 'texture' ? 'texture refinement' : 'image → 3D'} isn't available on this machine: ${st.checks.filter((x) => !x.ok).map((x) => x.label).join(', ') || cap.note}. Use Build Locally, Import or Meshy instead.`);
    if (!c.ref_image_path) throw new HttpError(400, 'Upload a reference image on this card first (Local AI is image-to-3D).');
    if (action === 'texture' && !c.model_path) throw new HttpError(400, 'Generate the shape first, then refine its texture.');
    assertNoActiveGen(c.episode_id);
    const jobId = localai.startJob(action === 'texture' ? 'localai-texture' : 'localai-shape', c.episode_id, { card_id: c.id, image_path: c.ref_image_path, mesh_path: c.model_path }, `Local AI ${action} for ${c.name}`);
    run(`UPDATE asset_cards SET status='generating', job_id=?, method='local_ai', error=NULL WHERE id=?`, jobId, c.id);
    return out(c.id);
  }));

  // ---- World Style compliance & uniqueness (no AI, no network) ----
  /** Average colours of an image (16×16 grid) → how well they fit the World Style palette. */
  function refPaletteCheck(abs) {
    if (!FFMPEG) return null;
    const r = spawnSync(FFMPEG, ['-v', 'error', '-i', abs, '-vf', 'scale=8:8:flags=area', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { windowsHide: true });
    if (r.status !== 0 || !r.stdout?.length) return null;
    const px = []; for (let i = 0; i + 2 < r.stdout.length; i += 3) { const [R, G, B] = [r.stdout[i], r.stdout[i + 1], r.stdout[i + 2]]; if (R + G + B < 720) px.push(`#${[R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('')}`); }
    const fit = paletteFit(px, currentProfile());
    return { ...fit, verdict: fit.score < 0.35 ? 'fits' : fit.score < 0.55 ? 'partly' : 'off-style', checked_at: new Date().toISOString() };
  }
  app.get('/api/cards/:id/uniqueness', h((req) => uniq(getCard(req.params.id))));
  app.post('/api/cards/:id/make-unique', h((req) => {
    const c = getCard(req.params.id);
    if (!c.recipe) throw new HttpError(400, 'Only Build Locally designs can be made unique automatically.');
    const r = makeUnique(JSON.parse(c.recipe), lockedRecipes(c));
    run(`UPDATE asset_cards SET recipe=?, updated_at=datetime('now') WHERE id=?`, JSON.stringify(r.recipe), c.id);
    return { ...out(c.id), changes: r.changes };
  }));
  /** Bring a design made with an older World Style up to date (colours still at the old defaults follow the new palette). */
  app.post('/api/cards/:id/apply-style', h((req) => {
    const c = getCard(req.params.id);
    if (c.recipe) run(`UPDATE asset_cards SET recipe=?, updated_at=datetime('now') WHERE id=?`, JSON.stringify(restyleRecipe(JSON.parse(c.recipe), S())), c.id);
    return out(c.id);
  }));
  app.get('/api/cards/:id/meshy-prompt', h((req) => meshyPrompt(getCard(req.params.id))));

  // ---- Stage 2: the landscape where the story happens (project landscape + what is different around each place) ----
  const landscapeOf = (c) => { try { return c?.landscape ? JSON.parse(c.landscape) : {}; } catch { return {}; } };
  const TIMES = ['morning', 'day', 'sunset', 'night'];
  const cleanSceneryLook = (b = {}, prev = {}) => {
    const o = { ...prev };
    for (const [k, opts] of Object.entries(LOOK_KEYS)) if (k !== 'transition' && k in b) { if (opts.includes(b[k])) o[k] = b[k]; else delete o[k]; }
    for (const k of ['ground', 'hill_tint']) if (k in b) { if (/^#[0-9a-f]{6}$/i.test(b[k] || '')) o[k] = b[k]; else delete o[k]; }
    if ('time_of_day' in b) { if (TIMES.includes(b.time_of_day)) o.time_of_day = b.time_of_day; else delete o.time_of_day; }
    if ('why' in b) o.why = String(b.why || '').slice(0, 300);
    return o;
  };
  const landscapeState = (epId) => {
    const ep = one('SELECT * FROM episodes WHERE id=?', epId);
    let plan = null; try { plan = ep.landscape_plan ? JSON.parse(ep.landscape_plan) : null; } catch { /* none */ }
    return { plan, look: { ...getSetting('world_look', {}), ...lookOf(ep) }, project_look: lookOf(ep), world_look: getSetting('world_look', {}),
      roles: currentProfile().roles, sceneries: cardsFor(epId).filter((c) => c.kind === 'location').map((c) => ({ card_id: c.id, name: c.name, model_url: c.model_url, status: c.status, usages: c.usages, landscape: landscapeOf(c) })) };
  };
  app.get('/api/episodes/:id/landscape', h((req) => { need(one('SELECT id FROM episodes WHERE id=?', +req.params.id), 'Project'); return landscapeState(+req.params.id); }));
  app.put('/api/cards/:id/landscape', h((req) => {
    const c = getCard(req.params.id);
    if (c.kind !== 'location') throw new HttpError(400, 'Only scenery has a landscape.');
    run('UPDATE asset_cards SET landscape=? WHERE id=?', JSON.stringify(cleanSceneryLook(req.body || {}, landscapeOf(c))), c.id);
    flagStages(c.episode_id, { shots: `The landscape around “${c.name}” changed`, export: 'The landscape changed after the last export' });
    touchEpisode(c.episode_id);
    return landscapeState(c.episode_id);
  }));
  /** Design the landscape: Claude (with the reference the user chose), or offline rules from the lyrics. */
  app.post('/api/episodes/:id/landscape/design', h(async (req) => {
    const epId = +req.params.id;
    const ep = need(one('SELECT * FROM episodes WHERE id=?', epId), 'Project');
    const lines = approvedLines(epId);
    if (!lines) throw new HttpError(400, 'Approve the lyrics in Stage 1 first.');
    const cards = cardsFor(epId).filter((c) => c.kind === 'location');
    let r; let source = 'offline';
    if (req.body.mode === 'ai') {
      if (!providers.isActive('claude')) throw new HttpError(400, 'Connect Claude in AI Connections, or use the simple landscape.');
      const st = landscapeState(epId);
      r = await providers.designLandscape({ world: await worldFor(req.body.reference, { images: true }), lines,
        sceneries: cards.map((c) => ({ card_id: c.id, name: c.name, description: c.description, usages: c.usages })),
        current: st.plan ? { project: st.project_look, sceneries: st.sceneries.map((s) => ({ card_id: s.card_id, ...s.landscape })) } : null });
      source = 'claude';
    } else {
      // Offline: read the lyrics and cues for each place (night / sunset / morning words, clouds, flowers, trees).
      const textOf = (idx) => idx.map((i) => `${lines[i]?.text || ''} ${lines[i]?.cue || ''}`).join(' ').toLowerCase();
      const all2 = textOf(lines.map((_, i) => i));
      const pick = (t) => ({ time_of_day: /night|moon|star|sleep|dream|bed/.test(t) ? 'night' : /sunset|evening|dusk/.test(t) ? 'sunset' : /morning|sunrise|wake|dawn/.test(t) ? 'morning' : 'day',
        ...(/cloud|sky|kite|balloon|fly|float/.test(t) ? { clouds: 'many' } : {}), ...(/flower|garden|bloom|petal|meadow/.test(t) ? { dressing: 'lush' } : {}),
        ...(/forest|tree|wood|park/.test(t) ? { trees: 'many' } : {}), ...(/hill|mountain|climb|up the/.test(t) ? { hills: 'tall' } : {}), ...(/sea|beach|pond|lake|river/.test(t) ? { hills: 'low' } : {}) });
      const base = pick(all2);
      r = { plan: `Simple landscape from the lyrics: ${base.time_of_day} light${base.clouds ? ', lots of clouds' : ''}${base.dressing ? ', lush flowers' : ''}${base.trees ? ', many trees' : ''}. Each place adds what its own lines mention.`,
        project: { clouds: base.clouds || 'some', dressing: base.dressing || 'light', trees: base.trees || 'some', hills: base.hills || 'rolling' },
        sceneries: cards.map((c) => ({ card_id: c.id, ...pick(textOf(c.usages || [])), why: 'From the lyric lines set here.' })) };
    }
    const proj = cleanLook(r.project || {}, lookOf(ep));
    tx(() => {
      run('UPDATE episodes SET look=?, landscape_plan=? WHERE id=?', JSON.stringify(proj), JSON.stringify({ plan: String(r.plan || '').slice(0, 1500), at: new Date().toISOString(), source, reference: req.body.reference?.mode || 'world+cast' }), epId);
      for (const s of Array.isArray(r.sceneries) ? r.sceneries : []) {
        const c = cards.find((x) => x.id === Number(s.card_id)); if (!c) continue;
        run('UPDATE asset_cards SET landscape=? WHERE id=?', JSON.stringify(cleanSceneryLook(s, {})), c.id);
      }
    });
    flagStages(epId, { shots: 'The landscape was designed again in Stage 2', export: 'The landscape changed after the last export' });
    touchEpisode(epId);
    return landscapeState(epId);
  }));

  // ---- Look check: Claude views pictures of the model and says whether it matches the name (Claude only) ----
  app.post('/api/cards/:id/look-check', h(async (req) => {
    const c = getCard(req.params.id);
    if (!c.model_path) throw new HttpError(400, 'There is no model to check yet.');
    if (!providers.isActive('claude')) throw new HttpError(400, 'Connect Claude in AI Connections to use the look check.');
    const imgs = (Array.isArray(req.body.images) ? req.body.images : []).slice(0, 3)
      .map((d) => String(d || '').replace(/^data:image\/png;base64,/, '')).filter((d) => d.length > 100 && d.length < 4_000_000).map((d) => Buffer.from(d, 'base64'));
    if (!imgs.length) throw new HttpError(400, 'No picture of the model was sent.');
    const r = await providers.lookCheck({ card: c, images: imgs });
    const out2 = { verdict: ['match', 'partly', 'mismatch'].includes(r.verdict) ? r.verdict : 'partly', looks_like: String(r.looks_like || '').slice(0, 300),
      issues: (Array.isArray(r.issues) ? r.issues : []).map((x) => String(x).slice(0, 200)).slice(0, 6), suggestion: String(r.suggestion || '').slice(0, 300), at: new Date().toISOString(), model_path: c.model_path };
    run('UPDATE asset_cards SET look_check=? WHERE id=?', JSON.stringify(out2), c.id);
    return out(c.id);
  }));

  // ---- Draft / refine the Meshy prompt with Claude (Claude only — never Meshy) ----
  app.post('/api/cards/:id/draft-prompt', h(async (req) => {
    const c = getCard(req.params.id);
    await draftPromptFor(c, req.body.instruction, req.body.reference);
    return out(c.id);
  }));
  // ---- Review feedback on the current result → Claude revises the Meshy prompt (Claude only — never Meshy) ----
  app.post('/api/cards/:id/feedback', h(async (req) => {
    const c = getCard(req.params.id);
    const text = String(req.body.feedback || '').trim().slice(0, 1500);
    if (!text) throw new HttpError(400, 'Write what you want changed.');
    if (!c.revision_id) throw new HttpError(400, 'There is no result to give feedback on yet.');
    const rv = one('SELECT feedback FROM card_revisions WHERE id=?', c.revision_id);
    run('UPDATE card_revisions SET feedback=? WHERE id=?', JSON.stringify([...parseJSON(rv?.feedback, []), { text, at: new Date().toISOString() }]), c.revision_id);
    let revised = false;
    if (req.body.revise !== false && providers.isActive('claude')) {
      await draftPromptFor(getCard(c.id), `Revise the CURRENT prompts. The user reviewed the latest 3D result and wants these changes: "${text}". Change only what they asked for and keep everything else (design, colours, recognizable features) the same.`, req.body.reference);
      revised = true;
    }
    return { ...out(c.id), revised };
  }));
  /** Claude writes the Meshy prompts from: World Style + the lyric lines it appears in + your Stage 2 ideas + the card's own notes. */
  const draftPromptFor = async (c, instruction, reference) => {
    const notes = castNotesOf(c.episode_id);
    const lines = approvedLines(c.episode_id) || [];
    const used = JSON.parse(c.usages || '[]').map((i) => lines[i]).filter(Boolean).map((l) => `${l.text}${l.cue ? `  [on screen: ${l.cue}]` : ''}`);
    const kindNotes = c.kind === 'character' ? notes.characters : c.kind === 'location' ? notes.scenery
      : [notes.characters && `Characters: ${notes.characters}`, notes.scenery && `Scenery: ${notes.scenery}`].filter(Boolean).join('\n');
    const fb = all('SELECT n, feedback FROM card_revisions WHERE card_id=? AND feedback IS NOT NULL ORDER BY n', c.id)
      .flatMap((r) => parseJSON(r.feedback, []).map((f) => `- (on result #${r.n}) ${f.text}`));
    const review = fb.length ? `\n\nChanges the user asked for after reviewing earlier results. Keep ALL of them in the new prompt (later notes win if they conflict):\n${fb.join('\n')}` : '';
    const r = await providers.refineMeshyPrompt({ card: c, world: await worldFor(reference, { images: true }), instruction: `${instruction || 'Write the best Meshy prompts for this asset.'}${review}`, lyrics: used, notes: kindNotes });
    run(`UPDATE asset_cards SET prompt=?, texture_prompt=?, signature=COALESCE(NULLIF(?, ''), signature), updated_at=datetime('now') WHERE id=?`,
      String(r.meshy_prompt || c.prompt).slice(0, 800), String(r.texture_prompt || c.texture_prompt || '').slice(0, 800), r.signature_features || '', c.id);
  };

  // ---- Which skeleton does a character need? (Claude, or an offline guess) — never calls Meshy ----
  const QUAD = /\b(bunny|bunnies|rabbit|hare|dog|puppy|pup|cat|kitten|kitty|horse|pony|foal|cow|calf|sheep|lamb|goat|pig|piglet|fox|wolf|lion|tiger|bear|cub|deer|fawn|elephant|giraffe|zebra|mouse|mice|rat|hamster|squirrel|hedgehog|raccoon|camel|donkey|leopard|cheetah|panther|dinosaur|turtle|tortoise)\b/i;
  const NONE = /\b(sun|sunny|moon|star|cloud|rainbow|flower|tree|firefly|butterfly|bee|bird|fish|snake|worm|car|train|boat|balloon|kite|diamond|ball)\b/i;
  const UPRIGHT = /\b(upright|on two (hind )?legs|bipedal|walks like a (person|human)|waving|wears? (a )?(shirt|dress|trousers|overalls|jacket))\b/i;
  const guessRig = (c) => {
    const t = `${c.name} ${c.description || ''} ${c.signature || ''} ${c.prompt || ''}`;
    if (UPRIGHT.test(t)) return { rig_type: 'biped', reason: 'Described standing upright (offline guess).' };
    if (QUAD.test(t)) return { rig_type: 'quadruped', reason: 'A four-legged animal (offline guess).' };
    if (NONE.test(t)) return { rig_type: 'none', reason: 'No legs to rig — it keeps procedural motion (offline guess).' };
    return { rig_type: 'biped', reason: 'Character standing on two legs (offline guess).' };
  };
  app.post('/api/cards/:id/rig-type', h(async (req) => {
    const c = getCard(req.params.id);
    if (c.kind !== 'character') throw new HttpError(400, 'Only characters are rigged.');
    let r = null;
    if (req.body.mode !== 'offline' && providers.isActive('claude')) {
      const a = await providers.rigAdvisor({ card: c });
      if (['biped', 'quadruped', 'none'].includes(a.rig_type)) r = { rig_type: a.rig_type, reason: `${String(a.reason || '').slice(0, 300)} (Claude)`, height: Number(a.height_meters) > 0 ? Number(a.height_meters) : null };
    }
    r ||= guessRig(c);
    run(`UPDATE asset_cards SET rig_type=?, rig_note=?, updated_at=datetime('now') WHERE id=?`, r.rig_type, r.reason, c.id);
    return { ...out(c.id), suggested_height: r.height ?? null };
  }));

  // ---- Generate in Meshy (paid; only this explicit click submits) ----
  app.post('/api/cards/:id/generate', h((req) => {
    const c = getCard(req.params.id);
    if (req.get('X-User-Action') !== 'generate-in-meshy' || req.body.confirm !== true) throw new HttpError(400, 'Meshy jobs can only be started with the “Generate in Meshy” button.');
    return meshyGenerate(c, req.body, `card ${c.id}`);
  }));
  /** One paid Meshy generation for a card. Only called from an explicit user click (the Generate button, or approving a director fix). */
  /** The exact prompt, pose and rig settings a Meshy generation uses (the preview image uses the same ones). */
  const meshyPlan = (c, body) => {
    const req = { body };
    if (!c.prompt?.trim()) throw new HttpError(400, 'Write or review the Meshy prompt on this card first.');
    if (c.prompt.length > 800 || (c.texture_prompt || '').length > 800) throw new HttpError(400, 'Meshy prompts must be 800 characters or fewer.');
    const mp = meshyPrompt(c); // always includes the World Style summary
    const rigType = ['biped', 'quadruped'].includes(req.body.rig_type) ? req.body.rig_type : ['biped', 'quadruped'].includes(c.rig_type) ? c.rig_type : 'biped';
    const rig = req.body.rig === true && c.kind === 'character' && req.body.rig_type !== 'none';
    if (rig && req.body.rig_type && req.body.rig_type !== c.rig_type) run('UPDATE asset_cards SET rig_type=?, rig_note=? WHERE id=?', rigType, 'Chosen by you', c.id);
    const height = rig && req.body.height_meters ? Math.min(20, Math.max(0.1, Number(req.body.height_meters) || 0)) || null : null;
    // A two-legged rig needs arms away from the body (A-pose). Meshy's poses are human poses, so four-legged animals keep their natural stance.
    const pose = rig && rigType === 'biped' && (!c.pose || c.pose === 'none') ? 'a-pose' : rig && rigType === 'quadruped' ? 'none' : c.pose;
    // Meshy's rig is a human (two-legged) skeleton: a character that will be rigged must be modelled standing upright,
    // or the walk folds its legs into the body. Four-legged wording is dropped for the rigged version.
    // The model must match the skeleton Meshy will put in it.
    const BIPED_SHAPE = ' Standing upright on two hind legs like a cartoon person (bipedal), front paws as arms held slightly away from the body, legs apart with a clear gap, feet flat on the ground, facing forward.';
    const QUAD_SHAPE = ' Standing naturally on all four legs, four straight legs clearly separated with a visible gap under the belly, paws flat on the ground, head and body facing forward, tail clear of the legs.';
    const clean = (t, re) => t.replace(re, '').replace(/\s{2,}/g, ' ').trim();
    const prompt = !rig ? mp.final
      : rigType === 'quadruped' ? `${clean(mp.final, /\b(standing upright|on two (hind )?legs|bipedal|a-pose|t-pose|arms (held )?(slightly )?(out|away)[^.,]*)[^.,]*[.,]?/gi).slice(0, 800 - QUAD_SHAPE.length)}${QUAD_SHAPE}`
      : `${clean(mp.final, /\b(four[- ]legged|quadruped(al)?|on all fours|all four paws( visible)?)[^.,]*[.,]?/gi).slice(0, 800 - BIPED_SHAPE.length)}${BIPED_SHAPE}`;
    return { prompt, texture: mp.texture, pose, rig, rigType, height, settings: `${prompt}|${pose}|${rig ? rigType : 'none'}` };
  };
  const meshyGenerate = (c, body, ref) => {
    if (c.status === 'generating') throw new HttpError(409, 'This card is already generating. Wait for it to finish.');
    const { prompt, texture, pose, rig, rigType, height } = meshyPlan(c, body);
    // "Build from the preview": Meshy turns the approved preview picture into the 3D model (image to 3D).
    const pv = body.from_preview ? previewOf(c) : null;
    if (body.from_preview && !pv?.image_path) throw new HttpError(400, 'Make a preview image first.');
    const permit = meshy.permit('generate', { episodeId: c.episode_id, ref });
    const jobId = meshy.startJob('meshy-3d', c.episode_id, { card_id: c.id, prompt, texture_prompt: texture, pose, rig, animation_type: rigType, height_meters: height, style_version: styleVersion(), ...(pv ? { image_path: pv.image_path } : {}) },
      `Meshy 3D model${pv ? ' from the preview image' : ''}${rig ? ' + rig' : ''} for ${c.name}`, permit);
    run(`UPDATE asset_cards SET status='generating', job_id=?, method='meshy', error=NULL WHERE id=?`, jobId, c.id);
    return out(c.id);
  };
  // ---- Preview image in Meshy (paid, ~3 credits; only this explicit click submits) ----
  app.post('/api/cards/:id/meshy-preview', h((req) => {
    if (req.get('X-User-Action') !== 'preview-in-meshy' || req.body.confirm !== true) throw new HttpError(400, 'A preview can only be started with the “Preview in Meshy” button.');
    const c = getCard(req.params.id);
    const plan = meshyPlan(c, req.body);
    meshy.startJob('meshy-preview', c.episode_id, { card_id: c.id, prompt: plan.prompt, pose: plan.pose, wide: c.kind !== 'character', settings: plan.settings },
      `Meshy preview image for ${c.name}`, meshy.permit('preview', { episodeId: c.episode_id, ref: `preview click card ${c.id}` }));
    return out(c.id);
  }));
  // What a preview/generation would be made from now (to tell whether an existing preview is out of date). No Meshy call.
  app.post('/api/cards/:id/meshy-plan', h((req) => { const p = meshyPlan(getCard(req.params.id), req.body); return { prompt: p.prompt, pose: p.pose, settings: p.settings }; }));
  app.post('/api/meshy/balance', h(async (req) => meshy.balance(meshy.permit('balance', { episodeId: req.body.episode_id || null, ref: 'check credits click' }))));
  app.get('/api/meshy/calls', h(() => ({ count: meshy.meshyCallCount(), recent: all('SELECT * FROM meshy_calls ORDER BY id DESC LIMIT 20') })));
  app.get('/api/episodes/:id/gen-jobs', h((req) => all(`SELECT * FROM jobs WHERE episode_id=? AND (type LIKE 'meshy-%' OR type LIKE 'localai-%') ORDER BY id DESC LIMIT 20`, +req.params.id).map(jobOut)));

  // ---- Edit: part colours (any .glb), revisions ----
  app.get('/api/cards/:id/materials', h((req) => {
    const c = getCard(req.params.id);
    if (!c.model_path) return [];
    return listMaterials(fs.readFileSync(path.join(MEDIA_DIR, c.model_path)));
  }));
  app.post('/api/cards/:id/recolor', h((req) => {
    const c = getCard(req.params.id);
    if (!c.model_path) throw new HttpError(400, 'No model to recolour yet.');
    if (!/^#[0-9a-f]{6}$/i.test(req.body.color || '')) throw new HttpError(400, 'Pick a colour.');
    const buf = recolorMaterial(fs.readFileSync(path.join(MEDIA_DIR, c.model_path)), Number(req.body.material_index), req.body.color);
    const rel = writeRel(`cards/${c.id}/recolor-${Date.now()}.glb`, buf);
    addRevision(c.id, { method: 'recolor', recipe: c.recipe ? JSON.parse(c.recipe) : null, model_path: rel, note: `Recoloured material #${req.body.material_index} to ${req.body.color}` });
    return out(c.id);
  }));
  app.post('/api/cards/:id/revisions/:rid/restore', h((req) => {
    const c = getCard(req.params.id);
    const r = need(one('SELECT * FROM card_revisions WHERE id=? AND card_id=?', +req.params.rid, c.id), 'Revision');
    addRevision(c.id, { method: r.method, recipe: r.recipe ? JSON.parse(r.recipe) : null, model_path: r.model_path, note: `Restored revision ${r.n}` });
    return out(c.id);
  }));

  // ---- Approve / Save to My World ----
  app.post('/api/cards/:id/approve', h((req) => approveCard(getCard(req.params.id))));
  const approveCard = (c) => {
    if (!c.model_path || !fs.existsSync(path.join(MEDIA_DIR, c.model_path))) throw new HttpError(400, 'There is no 3D result to approve yet.');
    if (c.status === 'generating') throw new HttpError(409, 'Wait for the generation to finish.');
    // Every character must be recognizable on its own (World Style rule). Revisions of the same My World item are fine.
    if (c.kind === 'character' && c.method === 'procedural') {
      const u = uniq(c);
      if (u && !u.unique) throw new HttpError(409, `Too similar to “${u.closest.name}” (${Math.round(u.closest.score * 100)}% alike — ${u.closest.signature}). Click “Make unique”, or change its signature features, so every character in your world is recognizable on its own.`);
    }
    run(`UPDATE asset_cards SET status='approved', approved_at=datetime('now') WHERE id=?`, c.id);
    flagShotsFor(c);
    return out(c.id);
  };
  app.post('/api/cards/:id/unapprove', h((req) => {
    const c = getCard(req.params.id);
    if (c.decision === 'reuse') throw new HttpError(400, 'This card reuses a My World asset. Use “Create a new design” to change it.');
    run(`UPDATE asset_cards SET status='review', approved_at=NULL WHERE id=?`, c.id);
    return out(c.id);
  }));
  /** Durable copy into My World (independent of the browser download). Saved flag is set only after the copy is verified. */
  app.post('/api/cards/:id/save-to-world', h((req) => saveToWorld(getCard(req.params.id))));
  const saveToWorld = (c) => {
    if (c.status !== 'approved') throw new HttpError(400, 'Approve the asset before saving it to My World.');
    if (c.saved_at && c.item_id) return { card: out(c.id), download_url: `/api/cards/${c.id}/download` };
    const src = path.join(MEDIA_DIR, c.model_path || '');
    if (!c.model_path || !fs.existsSync(src)) throw new HttpError(400, 'The approved model file is missing — regenerate or import it again.');
    const ep = one('SELECT title FROM episodes WHERE id=?', c.episode_id);
    const revs = all('SELECT n,method,note,created_at FROM card_revisions WHERE card_id=? ORDER BY n', c.id);
    tx(() => {
      let itemId = c.item_id && c.decision !== 'reuse' && one('SELECT id FROM items WHERE id=?', c.item_id) ? c.item_id : null;
      if (!itemId) {
        let name = c.name; let k = 2;
        while (one('SELECT id FROM items WHERE lower(name)=lower(?)', name)) name = `${c.name} ${k++}`;
        itemId = Number(run('INSERT INTO items(kind,name,description,notes) VALUES(?,?,?,?)', c.kind, name, c.description, c.signature ? `Signature features: ${c.signature}` : '').lastInsertRowid);
      }
      const n = one('SELECT COUNT(*) n FROM item_versions WHERE item_id=?', itemId).n + 1;
      const spec = { description: c.description, signature_features: c.signature, method: c.method, recipe: c.recipe ? JSON.parse(c.recipe) : null,
        meshy_prompt: c.prompt, texture_prompt: c.texture_prompt, source_project: ep?.title, revisions: revs };
      const vid = Number(run(`INSERT INTO item_versions(item_id,label,status,approved_at,spec,notes) VALUES(?,?, 'approved', datetime('now'), ?, ?)`, itemId, `v${n}`, JSON.stringify(spec), `Saved from “${ep?.title}”`).lastInsertRowid);
      const rel = `world/${itemId}/${slug(c.name)}-v${n}.glb`;
      fs.mkdirSync(path.join(MEDIA_DIR, `world/${itemId}`), { recursive: true });
      fs.copyFileSync(src, path.join(MEDIA_DIR, rel));
      if (fs.statSync(path.join(MEDIA_DIR, rel)).size !== fs.statSync(src).size) throw new HttpError(500, 'The saved copy could not be verified. Try again.');
      run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,source,status,notes) VALUES('version',?, 'model3d', ?, ?, 'model/gltf-binary', ?, 'approved', ?)`, vid, `${c.name} 3D model (v${n})`, rel, c.method || 'import', c.method === 'procedural' ? 'Editable recipe stored in this version' : '');
      if (c.thumb_path && fs.existsSync(path.join(MEDIA_DIR, c.thumb_path))) {
        const tr = `world/${itemId}/${slug(c.name)}-v${n}.png`; fs.copyFileSync(path.join(MEDIA_DIR, c.thumb_path), path.join(MEDIA_DIR, tr));
        run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,source,status) VALUES('version',?, 'render', 'Preview', ?, 'image/png', ?, 'approved')`, vid, tr, c.method || 'import');
      }
      // The rig made with this model (and Meshy's basic clips) moves into My World with it, ready for Stage 4.
      const rv = c.revision_id && one('SELECT rig FROM card_revisions WHERE id=?', c.revision_id)?.rig;
      if (rv) {
        const r = JSON.parse(rv);
        const keep = (from, suffix) => { const to = `world/${itemId}/${slug(c.name)}-v${n}-${suffix}.glb`; fs.copyFileSync(path.join(MEDIA_DIR, from), path.join(MEDIA_DIR, to)); return to; };
        if (fs.existsSync(path.join(MEDIA_DIR, r.rig))) {
          run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,source,status,notes) VALUES('version',?, 'rig', ?, ?, 'model/gltf-binary', 'generated:meshy-rig', 'approved', ?)`,
            vid, `Rigged model (Meshy, ${r.animation_type === 'quadruped' ? 'four-legged' : 'two-legged'})`, keep(r.rig, 'rig'), JSON.stringify({ meshy_rig_task_id: r.meshy_rig_task_id, animation_type: r.animation_type || 'biped', created: r.created }));
          for (const cl of r.clips || []) if (fs.existsSync(path.join(MEDIA_DIR, cl.path)))
            run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,source,status,notes) VALUES('version',?, 'clip', ?, ?, 'model/gltf-binary', 'generated:meshy-rig', 'approved', ?)`,
              vid, `${cl.name[0].toUpperCase()}${cl.name.slice(1)} (Meshy)`, keep(cl.path, slug(cl.name)), JSON.stringify({ self_contained: true }));
        }
      }
      run(`UPDATE asset_cards SET item_id=?, saved_version_id=?, saved_at=datetime('now'), model_path=? WHERE id=?`, itemId, vid, rel, c.id);
      run(`INSERT INTO episode_cast(episode_id,item_id,version_id) VALUES(?,?,?) ON CONFLICT(episode_id,item_id) DO UPDATE SET version_id=excluded.version_id`, c.episode_id, itemId, vid);
    });
    return { card: out(c.id), download_url: `/api/cards/${c.id}/download` };
  };
  app.get('/api/cards/:id/download', (req, res) => {
    const c = one('SELECT * FROM asset_cards WHERE id=?', +req.params.id);
    if (!c?.model_path || !fs.existsSync(path.join(MEDIA_DIR, c.model_path))) return res.status(404).json({ error: 'No model file.' });
    res.download(path.join(MEDIA_DIR, c.model_path), `${slug(c.name)}.glb`);
  });
  /** Reopen a saved My World asset as a new revision in a project (recipe and history come along). */
  app.post('/api/items/:id/revise', h((req) => {
    const lib = need(libraryPreview(+req.params.id), 'My World item');
    const epId = Number(req.body.episode_id);
    need(one('SELECT id FROM episodes WHERE id=?', epId), 'Project');
    const recipe = lib.spec?.recipe || null;
    const id = Number(run(`INSERT INTO asset_cards(episode_id,kind,name,description,signature,decision,status,method,recipe,item_id,model_path,prompt,texture_prompt,mapping)
      VALUES(?,?,?,?,?, 'new', 'review', ?, ?, ?, ?, ?, ?, ?)`, epId, lib.kind, lib.name, lib.description || lib.spec?.description || '', lib.spec?.signature_features || '',
      recipe ? 'procedural' : 'import', recipe ? JSON.stringify(recipe) : null, lib.id, lib.model?.file_path || null, lib.spec?.meshy_prompt || '', lib.spec?.texture_prompt || '',
      JSON.stringify({ template: recipe?.template || null, applied: ['Reopened from My World'], unsupported: [], message: `Revising “${lib.name}” — saving adds a new version to the same My World asset.`, supported: !!recipe })).lastInsertRowid);
    if (lib.model) run('INSERT INTO card_revisions(card_id,n,method,recipe,model_path,note) VALUES(?,1,?,?,?,?)', id, recipe ? 'procedural' : 'library', recipe ? JSON.stringify(recipe) : null, lib.model.file_path, `From My World ${lib.version_label}`);
    return out(id);
  }));

  // ================= Stage 3: music & vocals =================
  app.post('/api/episodes/:id/audio/mix', h(async (req) => {
    const epId = +req.params.id;
    const a = need(one(`SELECT * FROM assets WHERE id=? AND owner_type='episode' AND owner_id=?`, req.body.instrumental_id, epId), 'Instrumental');
    const b = need(one(`SELECT * FROM assets WHERE id=? AND owner_type='episode' AND owner_id=?`, req.body.vocal_id, epId), 'Vocal');
    const gm = Number(req.body.music_gain ?? 1), gv = Number(req.body.vocal_gain ?? 1);
    const rel = `episode/${epId}/mix-${Date.now()}.wav`;
    await runFfmpeg(['-i', path.join(MEDIA_DIR, a.file_path), '-i', path.join(MEDIA_DIR, b.file_path), '-filter_complex',
      `[0:a]volume=${gm}[m];[1:a]volume=${gv}[v];[m][v]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95`, '-ar', '44100', path.join(MEDIA_DIR, rel)]);
    const meta = probe(path.join(MEDIA_DIR, rel));
    run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,duration,source,status) VALUES('episode',?, 'song', ?, ?, 'audio/wav', ?, 'mix', 'draft')`, epId, `Mix: ${a.label} + ${b.label}`, rel, meta.duration ?? null);
    touchEpisode(epId);
    return episodeFull(epId);
  }));

  const timingOf = (epId) => JSON.parse(one('SELECT timing FROM episodes WHERE id=?', epId)?.timing || '{}');
  const saveTiming = (epId, t) => run('UPDATE episodes SET timing=? WHERE id=?', JSON.stringify(t), epId);
  app.put('/api/episodes/:id/timing', h((req) => {
    const epId = +req.params.id;
    const ep = need(one('SELECT * FROM episodes WHERE id=?', epId), 'Project');
    const lines = approvedLines(epId);
    if (!lines) throw new HttpError(400, 'Approve the lyrics first.');
    const prev = timingOf(epId);
    const got = req.body.lines || [];
    const out2 = lines.map((l, i) => { const g = got.find((x) => x.i === i) || prev.lines?.find((x) => x.i === i) || {}; return { i, text: l.text, start: g.start == null ? null : Number(g.start), end: g.end == null ? null : Number(g.end) }; });
    for (const l of out2) if (l.start != null && l.end != null && !(l.end > l.start)) throw new HttpError(400, `Line ${l.i + 1} ends before it starts.`);
    const t = { lyrics_id: ep.approved_lyrics_id, audio_id: ep.master_audio_id, approved: false, lines: out2 };
    saveTiming(epId, t);
    if (prev.approved) flagStages(epId, { shots: 'Lyric timing was edited', export: 'Timing changed after the last export' });
    touchEpisode(epId);
    return episodeFull(epId);
  }));
  app.post('/api/episodes/:id/timing/auto', h((req) => {
    const epId = +req.params.id;
    const ep = need(one('SELECT * FROM episodes WHERE id=?', epId), 'Project');
    const lines = approvedLines(epId);
    if (!lines) throw new HttpError(400, 'Approve the lyrics first.');
    const audio = ep.master_audio_id && one('SELECT * FROM assets WHERE id=?', ep.master_audio_id);
    const total = audio?.duration || ep.target_duration || lines.length * 4;
    const intro = Math.max(0, Number(req.body.intro ?? 0)), outro = Math.max(0, Number(req.body.outro ?? 0));
    const span = Math.max(1, total - intro - outro) / lines.length;
    saveTiming(epId, { lyrics_id: ep.approved_lyrics_id, audio_id: ep.master_audio_id, approved: false,
      lines: lines.map((l, i) => ({ i, text: l.text, start: +(intro + i * span).toFixed(2), end: +(intro + (i + 1) * span - 0.1).toFixed(2) })) });
    touchEpisode(epId);
    return episodeFull(epId);
  }));
  app.post('/api/episodes/:id/timing/approve', h((req) => {
    const epId = +req.params.id;
    const ep = need(one('SELECT * FROM episodes WHERE id=?', epId), 'Project');
    if (!ep.master_audio_id) throw new HttpError(400, 'Approve and set the final audio first.');
    const t = timingOf(epId);
    const lines = approvedLines(epId) || [];
    if (!t.lines || t.lines.length !== lines.length || t.lines.some((l) => l.start == null || l.end == null)) throw new HttpError(400, 'Mark a start and end time for every lyric line first.');
    const audio = one('SELECT duration FROM assets WHERE id=?', ep.master_audio_id);
    if (audio?.duration && t.lines.some((l) => l.end > audio.duration + 0.05)) throw new HttpError(400, `A line ends after the audio (${audio.duration.toFixed(1)}s).`);
    saveTiming(epId, { ...t, approved: true, lyrics_id: ep.approved_lyrics_id, audio_id: ep.master_audio_id });
    clearFlag(epId, 'timing');
    touchEpisode(epId);
    return episodeFull(epId);
  }));
  app.post('/api/episodes/:id/review/:key/clear', h((req) => { clearFlag(+req.params.id, req.params.key); return episodeFull(+req.params.id); }));

  // ================= Stage 4: animate & assemble =================
  const sceneAssets = (epId) => cardsFor(epId).filter((c) => c.status === 'approved' && c.model_path).map((c) => {
    const lib = c.item_id ? libraryPreview(c.item_id) : null;
    // body_rig: the kind of approved rig the engine animates ('biped' | 'quadruped'), or null = static model.
    const rig = (lib?.clips || []).find((a) => a.category === 'rig' && a.status === 'approved');
    let bodyRig = null;
    if (rig && c.kind === 'character') { try { bodyRig = JSON.parse(rig.notes || '{}').animation_type || null; } catch { /* no notes */ } bodyRig = bodyRig || c.rig_type || 'biped'; }
    return { card_id: c.id, name: c.name, kind: c.kind, model_url: c.model_url, saved: !!c.saved_at, item_id: c.item_id, rig_type: c.rig_type || null, body_rig: bodyRig, usages: c.usages || [],
      ...(c.kind === 'location' ? { landscape: landscapeOf(c) } : {}),
      clips: (lib?.clips || []).map((a) => ({ id: a.id, label: a.label, category: a.category, url: a.url, status: a.status, notes: a.notes })) };
  });
  app.get('/api/episodes/:id/scene', h((req) => {
    const epId = +req.params.id;
    const ep = need(one('SELECT * FROM episodes WHERE id=?', epId), 'Project');
    const audio = ep.master_audio_id ? one('SELECT * FROM assets WHERE id=?', ep.master_audio_id) : null;
    return { shots: sceneShotsFor(epId), assets: sceneAssets(epId), timing: timingOf(epId), lines: approvedLines(epId) || [], director: directorOf(ep),
      audio: audio ? { url: `/media/${audio.file_path}`, duration: audio.duration, label: audio.label } : null,
      look: { ...getSetting('world_look', {}), ...lookOf(ep) }, project_look: lookOf(ep), world_look: getSetting('world_look', {}), roles: currentProfile().roles, sections: sectionsOf(epId), title: ep.title, channel: { name: channel().name, colors: channel().colors, caption_style: channel().caption_style } };
  }));
  // ---- The project's look (landscape around the scenery, title/end cards, karaoke captions, default transition) ----
  const LOOK_KEYS = { sky: ['auto', 'clear', 'soft', 'storybook'], clouds: ['none', 'few', 'some', 'many'], hills: ['none', 'low', 'rolling', 'tall'], trees: ['none', 'few', 'some', 'many'], dressing: ['none', 'light', 'lush'], transition: ['auto', 'cut', 'dissolve', 'dip-white', 'iris', 'wipe'], river: ['none', 'behind', 'winding'], houses: ['none', 'few', 'some', 'many'], wind: ['calm', 'breezy', 'windy'], birds: ['none', 'few', 'some'] };
  const lookOf = (ep) => { try { return JSON.parse(ep.look || '{}'); } catch { return {}; } };
  const cleanLook = (b, prev = {}) => {
    const o = { ...prev };
    for (const [k, opts] of Object.entries(LOOK_KEYS)) if (k in b) { if (opts.includes(b[k])) o[k] = b[k]; else if (b[k] === '' || b[k] === null) delete o[k]; }
    for (const k of ['ground', 'hill_tint']) if (k in b) { if (/^#[0-9a-f]{6}$/i.test(b[k] || '')) o[k] = b[k]; else delete o[k]; }
    for (const k of ['title_card', 'end_card', 'karaoke', 'fade_in_out']) if (k in b) o[k] = !!b[k];
    for (const k of ['title_text', 'end_text']) if (k in b) o[k] = String(b[k] || '').slice(0, 120);
    return o;
  };
  app.put('/api/episodes/:id/look', h((req) => {
    const ep = need(one('SELECT * FROM episodes WHERE id=?', +req.params.id), 'Project');
    const look = cleanLook(req.body || {}, lookOf(ep));
    run('UPDATE episodes SET look=? WHERE id=?', JSON.stringify(look), ep.id);
    flagStages(ep.id, { export: 'The look changed after the last export' });
    touchEpisode(ep.id);
    return look;
  }));
  /** Verse / chorus sections of the approved lyrics as line ranges (for automatic transitions). */
  const sectionsOf = (epId) => {
    const ep = one('SELECT * FROM episodes WHERE id=?', epId);
    const l = ep?.approved_lyrics_id && one('SELECT sections FROM lyrics WHERE id=?', ep.approved_lyrics_id);
    if (!l) return [];
    let i = 0; const out = [];
    for (const sec of JSON.parse(l.sections)) {
      const n = sec.lines.filter((x) => sungLine(x, ep.language).trim() || x.en?.trim()).length;
      if (n) out.push({ type: sec.type, label: sec.label, from: i, to: i + n - 1 }); i += n;
    }
    return out;
  };
  // The animation direction is saved with the project, together with Claude's last response to it.
  const directorOf = (ep) => { try { return JSON.parse(ep.director || '{}'); } catch { return {}; } };
  app.put('/api/episodes/:id/director', h((req) => {
    const ep = need(one('SELECT * FROM episodes WHERE id=?', +req.params.id), 'Project');
    const d = { ...directorOf(ep), message: String(req.body.message ?? '').slice(0, 8000) };
    run('UPDATE episodes SET director=? WHERE id=?', JSON.stringify(d), ep.id);
    return d;
  }));
  const SKY = /\b(sun|sunny|moon|star|cloud|bird|rainbow|kite|balloon)/i;
  /** Offline rule-based plan: one shot per lyric line, motion picked from keywords. */
  const offlineShots = (lines, assets, cards) => {
    const settings = assets.filter((a) => a.kind === 'location');
    const actorsAll = assets.filter((a) => a.kind !== 'location');
    const cams = ['wide', 'tilt-up', 'pan', 'dolly-in', 'follow'];
    const nightSong = lines.filter((l) => /night|star|moon|sleep|dream/i.test(`${l.text} ${l.cue || ''}`)).length * 3 >= lines.length;
    return lines.map((l, i) => {
      const text = `${l.text} ${l.cue || ''}`.toLowerCase();
      const named = (a) => { const proper = a.name.split(/ the /i)[0].trim(); return proper.length > 2 && new RegExp(`\\b${proper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text); };
      const used = actorsAll.filter((a) => (cards[a.card_id]?.usages || []).includes(i) || named(a));
      const cast = (used.length ? used : actorsAll.slice(0, 1)).slice(0, 3);
      const setting = settings.find((s) => (cards[s.card_id]?.usages || []).includes(i)) || settings[0];
      const actors = cast.map((a, k) => {
        const sky = SKY.test(a.name);
        const name = a.name.toLowerCase();
        let motion = { type: 'sway', amount: 0.08, speed: 1.5 };
        if (/sun|sunny/.test(name) && /rise|up|morning|wake/.test(text)) motion = { type: 'rise', amount: 4, duration: 4, delay: 0.3 };
        else if (/cloud/.test(name) || /drift|float|fly/.test(text) && sky) motion = { type: 'drift', dx: 6, bob: 0.1 };
        else if (/star|diamond|firefly|glow/.test(name) || (sky && /twinkl|shine|sparkl/.test(text))) motion = { type: 'twinkle', amount: 0.15, speed: 3 };
        else if (/bounc|hop|jump/.test(text) && !sky) motion = { type: 'bounce', to: [2.5 + k, 0, 0.5], height: 0.7, hops: 4 };
        else if (/spin|turn|roll/.test(text)) motion = { type: 'spin', speed: 1.5 };
        const x = cast.length === 1 ? (sky ? 2 : 0) : -2.5 + (5 * k) / (cast.length - 1);
        const pos = sky ? [x, 3.2, -4] : [motion.type === 'bounce' ? -2.5 : x, 0, 0.5];
        return { card_id: a.card_id, pos, rot: [0, 0, 0], scale: 1, motion };
      });
      const lighting = setting?.landscape?.time_of_day || (/night|star|moon|sleep|dream/.test(text) ? 'night' : /morning|sunrise|wake/.test(text) ? 'morning' : /sunset|evening/.test(text) ? 'sunset' : nightSong ? 'night' : 'day');
      const bounceIdx = actors.findIndex((a) => a.motion.type === 'bounce');
      // Rhythm like a director: establish the place (wide), go closer (full, medium), a close-up on the singer,
      // then back out. A new setting always starts wide. Ground characters face the camera.
      const prevSetting = i > 0 ? (settings.find((s) => (cards[s.card_id]?.usages || []).includes(i - 1)) || settings[0]) : null;
      const newPlace = !prevSetting || prevSetting.card_id !== setting?.card_id;
      const RHYTHM = [{ preset: 'wide', size: 'wide' }, { preset: 'dolly-in', size: 'full' }, { preset: 'group', size: 'medium' }, { preset: 'closeup', size: 'closeup', target: 0 }, { preset: 'pan', size: 'full' }, { preset: 'orbit', size: 'full' }];
      const groundIdx = actors.findIndex((a) => a.pos[1] < 2);
      let camera = newPlace ? { preset: 'wide', size: 'wide' } : { ...RHYTHM[i % RHYTHM.length] };
      if (camera.target != null) { if (groundIdx < 0) camera = { preset: 'wide', size: 'wide' }; else camera.target = groundIdx; }
      if (bounceIdx >= 0) camera = { preset: 'follow', size: 'full', target: bounceIdx };
      return { title: `Line ${i + 1}: ${l.text.slice(0, 36)}`, line_from: i, line_to: i, setting: setting ? { card_id: setting.card_id } : {}, actors,
        camera, lighting: { preset: lighting }, notes: '' };
    });
  };

  /** Claude's plan, checked against the engine: known assets only, known motions/cameras/lighting, numbers clamped, lines covered in order. */
  const MOTION_TYPES = ['none', 'rise', 'drift', 'bounce', 'twinkle', 'spin', 'sway', 'path', 'circle'];
  const CAMERA_TYPES = ['wide', 'tilt-up', 'pan', 'dolly-in', 'closeup', 'follow', 'orbit', 'group'];
  const SHOT_SIZES = ['auto', 'extreme-wide', 'wide', 'full', 'medium', 'closeup'];
  const TRANSITIONS = ['auto', 'cut', 'dissolve', 'dip-white', 'iris', 'wipe'];
  /** Timed body actions, limited to what this character's rig can do. Unusable ones are reported, not silently dropped. */
  const cleanActions = (raw, rig, name, dropped) => {
    const ok = new Set(movesFor(rig).map((m) => m.id));
    return (Array.isArray(raw) ? raw : []).filter((x) => {
      if (!x?.move) return false;
      if (ok.has(x.move)) return true;
      dropped.push(`${name} can't do “${x.move}”${rig ? ` (it has a ${rig === 'quadruped' ? 'four-legged' : 'two-legged'} rig)` : ' (no approved rig, so its body can’t bend)'}.`);
      return false;
    }).slice(0, 10).map((x) => {
      const m = moveById(x.move);
      const out = { move: x.move, at: Math.round(num(x.at, 0, 300, 0) * 100) / 100, seconds: Math.round(num(x.seconds, 0.5, 10, m.seconds) * 100) / 100 };
      if (x.repeats != null) out.repeats = Math.round(num(x.repeats, 1, 6, 1));
      if (['left', 'right'].includes(x.hand)) out.hand = x.hand;
      return out;
    }).sort((p, q) => p.at - q.at);
  };
  /** No two characters start the same action at the same moment: stagger and vary the copies. */
  const destagger = (actors) => {
    const seen = [];
    actors.forEach((a, k) => (a.actions || []).forEach((x) => {
      for (const s of seen) if (s.k !== k && s.move === x.move && Math.abs(s.at - x.at) < 0.5) { x.at = Math.round((s.at + 0.45 + 0.15 * k) * 100) / 100; x.seconds = Math.round(x.seconds * (1.1 + 0.05 * k) * 100) / 100; }
      seen.push({ k, move: x.move, at: x.at });
    }));
    return actors;
  };
  const LIGHT_TYPES = ['morning', 'day', 'sunset', 'night'];
  const num = (v, lo, hi, d) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
  const vec = (v, d) => (Array.isArray(v) && v.length === 3 ? [num(v[0], -8, 8, d[0]), num(v[1], -1, 6, d[1]), num(v[2], -8, 4, d[2])] : d);
  const cleanMotion = (m, pos) => {
    const type = MOTION_TYPES.includes(m?.type) ? m.type : 'none';
    switch (type) {
      case 'rise': return { type, amount: num(m.amount, 0.5, 6, 3), duration: num(m.duration, 0.5, 20, 4), delay: num(m.delay, 0, 10, 0) };
      case 'drift': return { type, dx: num(m.dx, -10, 10, 4), bob: num(m.bob, 0, 0.4, 0.1), ...(num(m.start, 0, 60, 0) > 0 ? { start: num(m.start, 0, 60, 0) } : {}) };
      case 'bounce': return { type, to: vec(m.to, [pos[0] + 3, pos[1], pos[2]]), height: num(m.height, 0.1, 1.5, 0.7), hops: Math.round(num(m.hops, 1, 10, 4)), ...(num(m.start, 0, 60, 0) > 0 ? { start: num(m.start, 0, 60, 0) } : {}) };
      case 'twinkle': return { type, amount: num(m.amount, 0.02, 0.4, 0.15), speed: num(m.speed, 0.5, 6, 3) };
      case 'spin': return { type, speed: num(m.speed, 0.1, 4, 1) };
      case 'sway': return { type, amount: num(m.amount, 0.01, 0.3, 0.08), speed: num(m.speed, 0.3, 4, 1.5) };
      case 'path': return { type, to: vec(m.to, pos), ...(num(m.start, 0, 60, 0) > 0 ? { start: num(m.start, 0, 60, 0) } : {}) };
      case 'circle': return { type, center: vec(m.center, [pos[0] + 1.5, 0, pos[2]]), turns: num(m.turns, 0.25, 3, 1), ...(num(m.start, 0, 60, 0) > 0 ? { start: num(m.start, 0, 60, 0) } : {}) };
      default: return { type: 'none' };
    }
  };
  const cleanClaudeShots = (raw, lines, assets, dropped = []) => {
    const ids = new Set(assets.map((a) => a.card_id));
    const byId = Object.fromEntries(assets.map((a) => [a.card_id, a]));
    const locIds = new Set(assets.filter((a) => a.kind === 'location').map((a) => a.card_id));
    const last = lines.length - 1;
    const sorted = (Array.isArray(raw) ? raw : []).filter((x) => x && Number.isFinite(Number(x.line_from)))
      .map((x) => ({ ...x, line_from: Math.round(num(x.line_from, 0, last, 0)), line_to: Math.round(num(x.line_to ?? x.line_from, 0, last, 0)) }))
      .sort((p, q) => p.line_from - q.line_from);
    const shots = [];
    let next = 0;
    for (const x of sorted) {
      if (next > last || x.line_to < next) continue; // fully covered by an earlier shot
      const from = next, to = Math.max(from, x.line_to);
      next = to + 1;
      const rawActors = (Array.isArray(x.actors) ? x.actors : []).filter((a) => ids.has(Number(a?.card_id)) && !locIds.has(Number(a.card_id))).slice(0, 6);
      const actors = rawActors.map((a) => {
        const pos = vec(a.pos, [0, 0, 0.5]); const asset = byId[Number(a.card_id)];
        const out = { card_id: Number(a.card_id), pos, rot: [0, num(a.rot_y, -Math.PI, Math.PI, 0), 0], scale: num(a.scale, 0.2, 4, 1), motion: cleanMotion(a.motion, pos) };
        if (a.face_travel === false) out.face_travel = false;
        const actions = cleanActions(a.actions, asset.body_rig, asset.name, dropped);
        if (actions.length) out.actions = actions;
        return out;
      });
      // look_at / turn_to name another character in the same shot by card_id; stored as its index in this shot.
      const idxOf = (cid) => { const k = actors.findIndex((y) => y.card_id === Number(cid)); return k >= 0 ? k : null; };
      rawActors.forEach((a, k) => {
        const la = a.look_at_card_id != null ? idxOf(a.look_at_card_id) : null; if (la != null && la !== k && byId[actors[k].card_id].body_rig) actors[k].look_at = la;
        const tt = a.turn_to_card_id != null ? idxOf(a.turn_to_card_id) : null; if (tt != null && tt !== k) actors[k].turn_to = tt;
      });
      destagger(actors);
      const c = x.camera || {};
      const preset = CAMERA_TYPES.includes(c.preset) ? c.preset : 'wide';
      const camera = { preset };
      if (preset === 'pan') camera.amount = num(c.amount, 0.3, 4, 1.5);
      if (preset === 'closeup' || preset === 'follow') camera.target = Math.round(num(c.target, 0, Math.max(0, actors.length - 1), 0));
      if (c.distance != null) camera.distance = num(c.distance, 0.5, 2, 1);
      if (c.height != null) camera.height = num(c.height, -1, 3, 0);
      if (SHOT_SIZES.includes(c.size)) camera.size = c.size;
      if (TRANSITIONS.includes(c.transition)) camera.transition = c.transition;
      if ((preset === 'closeup' || preset === 'follow' || ['medium', 'closeup'].includes(camera.size)) && camera.target == null) camera.target = Math.round(num(c.target, 0, Math.max(0, actors.length - 1), 0));
      const light = typeof x.lighting === 'string' ? x.lighting : x.lighting?.preset;
      const look = {};
      for (const [k, opts] of Object.entries(LOOK_KEYS)) if (k !== 'transition' && opts.includes(x.landscape?.[k])) look[k] = x.landscape[k];
      const setting = locIds.has(Number(x.setting_card_id)) ? { card_id: Number(x.setting_card_id) } : {};
      if (setting.card_id) {
        if (x.setting_scale != null) setting.scale = num(x.setting_scale, 0.4, 3, 1);
        if (x.setting_rot_y != null) setting.rot_y = num(x.setting_rot_y, -Math.PI, Math.PI, 0);
        if (Array.isArray(x.setting_offset)) setting.offset = [num(x.setting_offset[0], -10, 10, 0), num(x.setting_offset[1], -6, 2, 0), num(x.setting_offset[2], -10, 10, 0)];
      }
      shots.push({ title: String(x.title || `Lines ${from + 1}-${to + 1}`).slice(0, 80), line_from: from, line_to: to,
        setting, actors, camera,
        lighting: { preset: LIGHT_TYPES.includes(light) ? light : 'day', ...(Object.keys(look).length ? { look } : {}) }, notes: String(x.notes || '').slice(0, 400) });
    }
    if (!shots.length) throw new HttpError(502, 'Claude did not return a usable shot plan. Try again, or use the offline proposal.');
    if (next <= last) shots[shots.length - 1].line_to = last; // never leave lines uncovered
    const fallbackSetting = assets.find((a) => a.kind === 'location');
    for (const s of shots) if (!s.setting.card_id && fallbackSetting) s.setting = { card_id: fallbackSetting.card_id };
    return shots;
  };

  app.post('/api/episodes/:id/scene/propose', h(async (req) => proposeShots(+req.params.id, req.body)));
  /**
   * Fixes Claude may PROPOSE when the direction needs something earlier stages don't have yet. Nothing here runs until
   * you tick it and click Approve: new characters/props are then generated (paid Meshy, with a rig for characters),
   * approved and saved to My World, and Claude plans the shots again with the bigger cast.
   */
  const PROPOSAL_TYPES = ['new_character', 'new_prop', 'manual'];
  const cleanProposals = (raw, assets) => {
    const have = new Set(assets.map((a) => a.name.toLowerCase()));
    return (Array.isArray(raw) ? raw : []).filter((p) => p && PROPOSAL_TYPES.includes(p.type)).slice(0, 8).map((p, i) => {
      const o = { id: `p${i + 1}`, type: p.type, title: String(p.title || '').slice(0, 160), why: String(p.why || '').slice(0, 400), state: 'proposed' };
      if (p.type === 'manual') { o.stage = [1, 2, 3].includes(Number(p.stage)) ? Number(p.stage) : 3; o.steps = String(p.steps || '').slice(0, 600); o.cost = 'You do this step'; }
      else {
        o.name = String(p.name || '').trim().slice(0, 60); o.description = String(p.description || '').trim().slice(0, 700);
        if (p.type === 'new_character') o.rig = p.rig === 'quadruped' ? 'quadruped' : 'biped';
        o.cost = p.type === 'new_character' ? `Paid Meshy generation: about 35 credits (3D model + ${o.rig === 'quadruped' ? 'four-legged' : 'two-legged'} rig with walk/run clips), about 5–10 minutes` : 'Paid Meshy generation: about 30 credits, about 5 minutes';
      }
      return o;
    }).filter((o) => o.type === 'manual' ? o.title : o.name && o.description && !have.has(o.name.toLowerCase()));
  };
  const directorGet = (epId) => { try { return JSON.parse(one('SELECT director FROM episodes WHERE id=?', epId)?.director || '{}'); } catch { return {}; } };
  const directorSet = (epId, d) => run('UPDATE episodes SET director=? WHERE id=?', JSON.stringify(d), epId);

  const proposeShots = async (epId, body) => {
    const req = { body };
    const lines = approvedLines(epId);
    if (!lines) throw new HttpError(400, 'Approve the lyrics first.');
    if (one('SELECT COUNT(*) n FROM scene_shots WHERE episode_id=?', epId).n && req.body.replace !== true) throw new HttpError(409, 'This project already has a shot plan. Confirm replacing it (your current plan is overwritten).');
    const assets = sceneAssets(epId);
    if (!assets.length) throw new HttpError(400, 'Approve at least one asset in Stage 2 first.');
    const cards = Object.fromEntries(cardsFor(epId).map((c) => [c.id, c]));
    const t = timingOf(epId);
    const audio = one('SELECT a.duration FROM episodes e JOIN assets a ON a.id=e.master_audio_id WHERE e.id=?', epId);
    let shots, source = 'offline', reply = '', did = [], cannot = [], proposals = [];
    const message = String(req.body.message || '').slice(0, 8000);
    if (req.body.mode === 'ai') {
      if (!providers.isActive('claude')) throw new HttpError(400, 'Claude is not connected. Connect it in AI Connections, or use the offline proposal.');
      const ep = one('SELECT * FROM episodes WHERE id=?', epId);
      const timed = lines.map((l, i) => ({ ...l, start: t.lines?.[i]?.start ?? null, end: t.lines?.[i]?.end ?? null }));
      if (req.body.revise === true && !message.trim()) throw new HttpError(400, 'Write what Claude should correct first.');
      const current = req.body.revise === true ? sceneShotsFor(epId).map((s) => ({ title: s.title, line_from: s.line_from, line_to: s.line_to,
        setting_card_id: s.setting?.card_id ?? null, setting_scale: s.setting?.scale, setting_rot_y: s.setting?.rot_y, setting_offset: s.setting?.offset,
        actors: (s.actors || []).map((a) => ({ card_id: a.card_id, pos: a.pos, rot_y: a.rot?.[1] || 0, scale: a.scale, motion: a.motion, actions: a.actions || [], ...(a.face_travel === false ? { face_travel: false } : {}),
          look_at_card_id: Number.isInteger(a.look_at) ? s.actors[a.look_at]?.card_id ?? null : null, turn_to_card_id: Number.isInteger(a.turn_to) ? s.actors[a.turn_to]?.card_id ?? null : null })),
        camera: s.camera, lighting: s.lighting?.preset, landscape: s.lighting?.look, notes: s.notes })) : null;
      const r = await providers.shotDirector({ channel: channel(), episode: ep, current, lines: timed, duration: audio?.duration || null, world: await worldFor(req.body.reference, { images: true }), message,
        assets: assets.map((a) => ({ card_id: a.card_id, name: a.name, kind: a.kind, body_rig: a.body_rig, moves: movesFor(a.body_rig).map((m) => m.id), walk: a.clips.some((c) => c.category === 'clip' && c.status === 'approved' && /walk|run/i.test(c.label)),
          usages: cards[a.card_id]?.usages || [], description: `${cards[a.card_id]?.description || ''}${a.landscape && Object.keys(a.landscape).length ? ` [landscape around this place: ${JSON.stringify(a.landscape)}; use its time_of_day as the lighting]` : ''}` })) });
      const dropped = [];
      shots = cleanClaudeShots(r.shots, lines, assets, dropped);
      source = 'claude';
      reply = String(r.reply || '');
      const list = (v) => (Array.isArray(v) ? v : []).map((x) => String(x).slice(0, 400)).filter(Boolean).slice(0, 30);
      did = list(r.did); cannot = [...list(r.cannot), ...dropped];
      proposals = cleanProposals(r.proposals, assets);
      // Keep the direction and Claude's response with the project, so it can be read again later.
      const prev = directorGet(epId);
      directorSet(epId, { ...prev, message, last: { mode: req.body.revise === true ? 'change' : 'new', message, reply, did, cannot, proposals, at: new Date().toISOString(), followup: !!req.body.followup } });
    } else shots = offlineShots(lines, assets, cards);
    tx(() => {
      run('DELETE FROM scene_shots WHERE episode_id=?', epId);
      shots.forEach((s, i) => run(`INSERT INTO scene_shots(episode_id,position,title,line_from,line_to,start_override,end_override,setting,actors,camera,lighting,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        epId, i, s.title, s.line_from, s.line_to, i === 0 ? 0 : null, null, // last shot ends with the audio automatically
        JSON.stringify(s.setting), JSON.stringify(s.actors), JSON.stringify(s.camera), JSON.stringify(s.lighting), s.notes || ''));
    });
    clearFlag(epId, 'shots');
    touchEpisode(epId);
    return { shots: sceneShotsFor(epId), timing_approved: !!t.approved, source, reply, did, cannot, proposals };
  };

  // ---- Approving Claude's proposed fixes, then carrying them out across the stages ----
  app.post('/api/episodes/:id/director/approve', h((req) => {
    if (req.get('X-User-Action') !== 'approve-director-fixes' || req.body.confirm !== true) throw new HttpError(400, 'Fixes can only be started with the “Approve selected” button.');
    const epId = +req.params.id;
    need(one('SELECT id FROM episodes WHERE id=?', epId), 'Project');
    const d = directorGet(epId);
    if (d.followup?.status === 'running') throw new HttpError(409, 'Approved fixes are still being carried out. Wait for them to finish.');
    const ids = new Set(Array.isArray(req.body.ids) ? req.body.ids.map(String) : []);
    const props = d.last?.proposals || [];
    const chosen = props.filter((p) => ids.has(p.id) && p.state === 'proposed');
    if (!chosen.length) throw new HttpError(400, 'Tick at least one proposed fix first.');
    const tasks = [];
    for (const p of props) {
      if (!ids.has(p.id) || p.state !== 'proposed') continue;
      p.state = 'approved';
      if (p.type === 'manual') { tasks.push({ id: p.id, type: 'manual', title: p.title, stage: p.stage, steps: p.steps, state: 'todo', message: `Your step in Stage ${p.stage}` }); continue; }
      const kind = p.type === 'new_character' ? 'character' : 'prop';
      const card = createCard(epId, { kind, name: p.name, description: p.description });
      if (kind === 'character') run(`UPDATE asset_cards SET rig_type=?, rig_note='Chosen when you approved Claude’s fix', usages=? WHERE id=?`, p.rig, JSON.stringify((approvedLines(epId) || []).map((_, i) => i)), card.id);
      tasks.push({ id: p.id, type: p.type, title: p.title || `Create ${p.name}`, name: p.name, card_id: card.id, rig: p.rig || null, state: 'queued', message: 'Waiting to start in Meshy…' });
    }
    const replan = req.body.replan !== false && tasks.some((t) => t.type !== 'manual');
    directorSet(epId, { ...d, last: { ...d.last, proposals: props }, followup: { status: tasks.some((t) => t.type !== 'manual') ? 'running' : 'waiting', replan, tasks, started: new Date().toISOString(), message: replan ? 'Making the new assets. Claude plans the shots again when they are ready.' : 'Your steps are listed below.' } });
    setImmediate(followupTick);
    return directorGet(epId);
  }));
  app.post('/api/episodes/:id/director/followup/clear', h((req) => { const d = directorGet(+req.params.id); if (d.followup?.status === 'running') throw new HttpError(409, 'Still running.'); delete d.followup; directorSet(+req.params.id, d); return d; }));

  /** Advances approved fixes: start Meshy jobs (respecting the concurrency limit), approve + save finished models, then re-plan once. */
  let ticking = false;
  const followupTick = async () => {
    if (ticking) return; ticking = true;
    try {
      for (const ep of all(`SELECT id FROM episodes WHERE director LIKE '%"status":"running"%'`)) {
        const d = directorGet(ep.id); const f = d.followup;
        if (!f || f.status !== 'running') continue;
        for (const t of f.tasks) {
          if (t.type === 'manual' || ['done', 'failed'].includes(t.state)) continue;
          const c = one('SELECT * FROM asset_cards WHERE id=?', t.card_id);
          if (!c) { Object.assign(t, { state: 'failed', message: 'The Stage 2 card was deleted.' }); continue; }
          if (t.state === 'queued') {
            // Have Claude write the Meshy prompt first (lyrics + World Style + your Stage 2 ideas), once per task.
            if (!t.drafted && providers.isActive('claude')) {
              t.drafted = true;
              try { await draftPromptFor(c); } catch (e) { console.error('director fix: draft prompt', c.id, e.message); }
            }
            try { meshyGenerate(getCard(c.id), { rig: c.kind === 'character', rig_type: t.rig || 'biped' }, `director fix ${t.id} (approved by you)`); Object.assign(t, { state: 'generating', message: 'Generating in Meshy…' }); }
            catch (e) { if (e.status === 409) t.message = `Waiting for a free Meshy slot: ${e.message}`; else Object.assign(t, { state: 'failed', message: e.message }); }
            continue;
          }
          // Wait for the WHOLE Meshy job (shape → textures → rig). The model appears on the card after step 2, before the rig.
          const j = c.job_id && one('SELECT status, progress, message FROM jobs WHERE id=?', c.job_id);
          if (c.status === 'generating' || (j && ['queued', 'running'].includes(j.status))) { if (j) t.message = `${Math.round((j.progress || 0) * 100)}% · ${j.message}`; continue; }
          if (c.status === 'failed' || !c.model_path) { Object.assign(t, { state: 'failed', message: c.error || 'Meshy generation failed. Open it in Stage 2 to try again.' }); continue; }
          try {
            if (c.status !== 'approved') approveCard(getCard(c.id));
            saveToWorld(getCard(c.id));
            syncRigToWorld(c.id);
            const fresh = one('SELECT revision_id FROM asset_cards WHERE id=?', c.id);
            const rigged = c.kind !== 'character' || !!(fresh?.revision_id && one('SELECT rig FROM card_revisions WHERE id=?', fresh.revision_id)?.rig);
            Object.assign(t, { state: 'done', message: rigged ? `Made${c.kind === 'character' ? ' with its rig and walk/run clips' : ''}, approved and saved to My World. You can review or replace it in Stage 2.` : 'Model made and saved, but Meshy’s rigging failed: it can move but not bend. Rig it from My World → Characters.' });
          } catch (e) { Object.assign(t, { state: 'failed', message: e.message }); }
        }
        const busy = f.tasks.some((t) => ['queued', 'generating'].includes(t.state));
        if (!busy) {
          const made = f.tasks.some((t) => t.state === 'done' && t.type !== 'manual');
          if (f.replan && made && d.message?.trim()) {
            f.message = 'New assets ready. Claude is planning the shots again with your direction…';
            directorSet(ep.id, d);
            try {
              await proposeShots(ep.id, { mode: 'ai', replace: true, message: d.message, followup: true });
              const d2 = directorGet(ep.id);
              Object.assign(d2.followup, { status: 'done', finished: new Date().toISOString(), message: 'Done: the new assets are in, and Claude re-planned the shots. Click Generate Preview to watch.' });
              directorSet(ep.id, d2);
            } catch (e) {
              const d2 = directorGet(ep.id); Object.assign(d2.followup, { status: 'failed', message: `Assets are ready, but re-planning failed: ${e.message}. Click “Make a new plan” to try again.` }); directorSet(ep.id, d2);
            }
            continue;
          }
          Object.assign(f, { status: f.tasks.some((t) => t.state === 'failed') ? 'failed' : 'done', finished: new Date().toISOString(),
            message: made ? 'Done. Click “Make a new plan from this direction” to use the new assets.' : 'Nothing could be made. See the messages below.' });
        }
        directorSet(ep.id, d);
      }
    } catch (e) { console.error('director follow-up:', e); } finally { ticking = false; }
  };
  setInterval(followupTick, 5000);
  const shotPatch = (s, b) => {
    const allowed = { title: String, line_from: Number, line_to: Number, start_override: (v) => (v === null || v === '' ? null : Number(v)), end_override: (v) => (v === null || v === '' ? null : Number(v)), notes: String };
    const sets = [], vals = [];
    for (const [k, f] of Object.entries(allowed)) if (k in b) { sets.push(`${k}=?`); vals.push(b[k] === null ? null : f(b[k])); }
    for (const k of ['setting', 'actors', 'camera', 'lighting']) if (k in b) { sets.push(`${k}=?`); vals.push(JSON.stringify(b[k])); }
    if (sets.length) run(`UPDATE scene_shots SET ${sets.join(',')} WHERE id=?`, ...vals, s.id);
  };
  const shotChanged = (epId) => { flagStages(epId, { export: 'Shots changed after the last export' }); touchEpisode(epId); };
  app.post('/api/episodes/:id/scene-shots', h((req) => {
    const epId = +req.params.id;
    const pos = one('SELECT COALESCE(MAX(position),-1)+1 p FROM scene_shots WHERE episode_id=?', epId).p;
    const last = one('SELECT * FROM scene_shots WHERE episode_id=? ORDER BY position DESC LIMIT 1', epId);
    const id = Number(run(`INSERT INTO scene_shots(episode_id,position,title,line_from,line_to,setting,actors,camera,lighting) VALUES(?,?,?,?,?,?,?,?,?)`,
      epId, pos, req.body.title || `Shot ${pos + 1}`, last?.line_to ?? 0, last?.line_to ?? 0, last?.setting || '{}', '[]', JSON.stringify({ preset: 'wide' }), JSON.stringify({ preset: 'day' })).lastInsertRowid);
    shotChanged(epId);
    return sceneShotOut(one('SELECT * FROM scene_shots WHERE id=?', id));
  }));
  app.put('/api/scene-shots/:id', h((req) => {
    const s = need(one('SELECT * FROM scene_shots WHERE id=?', +req.params.id), 'Shot');
    shotPatch(s, req.body);
    shotChanged(s.episode_id);
    return sceneShotOut(one('SELECT * FROM scene_shots WHERE id=?', s.id));
  }));
  app.delete('/api/scene-shots/:id', h((req) => {
    const s = need(one('SELECT * FROM scene_shots WHERE id=?', +req.params.id), 'Shot');
    run('DELETE FROM scene_shots WHERE id=?', s.id);
    shotChanged(s.episode_id);
    return sceneShotsFor(s.episode_id);
  }));
  app.post('/api/scene-shots/:id/merge-next', h((req) => {
    const s = need(one('SELECT * FROM scene_shots WHERE id=?', +req.params.id), 'Shot');
    const n = one('SELECT * FROM scene_shots WHERE episode_id=? AND (position>? OR (position=? AND id>?)) ORDER BY position, id LIMIT 1', s.episode_id, s.position, s.position, s.id);
    if (!n) throw new HttpError(400, 'This is the last shot.');
    tx(() => {
      run('UPDATE scene_shots SET line_to=?, end_override=? WHERE id=?', Math.max(s.line_to ?? 0, n.line_to ?? 0), n.end_override, s.id);
      run('DELETE FROM scene_shots WHERE id=?', n.id);
    });
    shotChanged(s.episode_id);
    return sceneShotsFor(s.episode_id);
  }));
  app.post('/api/scene-shots/:id/split', h((req) => {
    const s = need(one('SELECT * FROM scene_shots WHERE id=?', +req.params.id), 'Shot');
    if ((s.line_to ?? 0) <= (s.line_from ?? 0)) throw new HttpError(400, 'A shot needs at least two lyric lines to split.');
    const mid = Math.floor(((s.line_from ?? 0) + (s.line_to ?? 0)) / 2);
    tx(() => {
      run('UPDATE scene_shots SET position=position+1 WHERE episode_id=? AND position>?', s.episode_id, s.position);
      run('UPDATE scene_shots SET line_to=?, end_override=NULL WHERE id=?', mid, s.id);
      run(`INSERT INTO scene_shots(episode_id,position,title,line_from,line_to,end_override,setting,actors,camera,lighting) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        s.episode_id, s.position + 1, `${s.title} (part 2)`, mid + 1, s.line_to, s.end_override, s.setting, s.actors, s.camera, s.lighting);
    });
    shotChanged(s.episode_id);
    return sceneShotsFor(s.episode_id);
  }));
  app.post('/api/episodes/:id/scene-shots/reorder', h((req) => {
    const epId = +req.params.id;
    tx(() => (req.body.ids || []).forEach((id, i) => run('UPDATE scene_shots SET position=? WHERE id=? AND episode_id=?', i, id, epId)));
    shotChanged(epId);
    return sceneShotsFor(epId);
  }));

  // ---- Rigs & movement clips (Stage 4; stored in My World) ----
  app.get('/api/world/motion', h(() => all(`SELECT a.*, i.name AS item_name, i.id AS item_id, i.kind FROM assets a JOIN item_versions v ON v.id=a.owner_id AND a.owner_type='version'
    JOIN items i ON i.id=v.item_id WHERE a.category IN ('rig','clip') ORDER BY i.name, a.id`).map((a) => ({ ...a, url: `/media/${a.file_path}` }))));
  app.post('/api/items/:id/motion', upload.single('files'), h((req) => {
    const item = one('SELECT * FROM items WHERE id=?', +req.params.id);
    if (!item || !req.file || !/\.glb$/i.test(req.file.originalname)) { cleanupTmp([req.file].filter(Boolean)); throw new HttpError(400, 'Import one .glb (a rigged model or an animation clip).'); }
    const buf = fs.readFileSync(req.file.path); cleanupTmp([req.file]);
    let animations = [];
    try { animations = (parseGLB(buf).json.animations || []).map((a) => a.name); } catch (e) { throw new HttpError(400, `Not a valid .glb: ${e.message}`); }
    const category = req.body.category === 'rig' ? 'rig' : 'clip';
    if (category === 'clip' && !animations.length) throw new HttpError(400, 'That .glb contains no animation clips.');
    const v = one(`SELECT id FROM item_versions WHERE item_id=? AND status='approved' ORDER BY id DESC LIMIT 1`, item.id) || one('SELECT id FROM item_versions WHERE item_id=? ORDER BY id DESC LIMIT 1', item.id);
    const rel = writeRel(`world/${item.id}/${category}-${Date.now()}-${slug(path.basename(req.file.originalname, '.glb'))}.glb`, buf);
    // Clips made in the Animation Studio keep their recipe, so the move can be re-opened and adjusted later.
    let recipe = null; try { recipe = req.body.recipe ? JSON.parse(String(req.body.recipe).slice(0, 5000)) : null; } catch { recipe = null; }
    run(`INSERT INTO assets(owner_type,owner_id,category,label,file_path,mime,source,status,notes) VALUES('version',?,?,?,?, 'model/gltf-binary', ?, 'approved', ?)`,
      v.id, category, String(req.body.label || `${category === 'rig' ? 'Rig' : 'Clip'}: ${req.file.originalname}`).slice(0, 120), rel, recipe ? 'studio' : 'import', JSON.stringify({ animations, self_contained: true, ...(recipe ? { studio: recipe } : {}) }));
    return { ok: true, animations };
  }));
  app.post('/api/items/:id/meshy/rig', h((req) => {
    if (req.get('X-User-Action') !== 'request-rig' || req.body.confirm !== true) throw new HttpError(400, 'Rigging can only be requested with the “Request rig in Meshy” button.');
    const lib = need(libraryPreview(+req.params.id), 'My World item');
    const src = req.body.version_id ? versionModel(+req.params.id, +req.body.version_id) : lib.model && { file_path: lib.model.file_path, version_id: lib.version_id };
    if (!src) throw new HttpError(400, 'Save a 3D model of this asset to My World first.');
    const epId = Number(req.body.episode_id) || null;
    const height = Number(req.body.height_meters) > 0 ? Math.min(20, Number(req.body.height_meters)) : null;
    const permit = meshy.permit('rig', { episodeId: epId, ref: `item ${lib.id}` });
    const id = meshy.startJob('meshy-rig', epId, { item_id: lib.id, version_id: src.version_id, model_path: src.file_path, animation_type: req.body.animation_type === 'quadruped' ? 'quadruped' : 'biped', height_meters: height }, `Meshy rig for ${lib.name}`, permit);
    return jobOut(one('SELECT * FROM jobs WHERE id=?', id));
  }));
  /** The 3D model file of one version of an item. */
  const versionModel = (itemId, versionId) => {
    const v = one('SELECT id FROM item_versions WHERE id=? AND item_id=?', versionId, itemId);
    const a = v && one(`SELECT file_path FROM assets WHERE owner_type='version' AND owner_id=? AND category='model3d' ORDER BY status='approved' DESC, id DESC LIMIT 1`, v.id);
    return a ? { file_path: a.file_path, version_id: v.id } : null;
  };
  // A rigged character must be modelled in a stance that fits the skeleton (same rule as Stage 2's Generate).
  const BIPED_SHAPE = ' Standing upright on two hind legs like a cartoon person (bipedal), front paws as arms held slightly away from the body, legs apart with a clear gap, feet flat on the ground, facing forward.';
  const QUAD_SHAPE = ' Standing naturally on all four legs, four straight legs clearly separated with a visible gap under the belly, paws flat on the ground, head and body facing forward, tail clear of the legs.';
  const rigReadyPrompt = (text, rig, rigType) => {
    const t = String(text || '').replace(/\s{2,}/g, ' ').trim();
    if (!rig) return t.slice(0, 800);
    const shape = rigType === 'quadruped' ? QUAD_SHAPE : BIPED_SHAPE;
    return `${t.slice(0, 800 - shape.length)}${shape}`;
  };
  /** My World → "Change the model": a new Meshy model as a new draft version (optionally rigged, with walk/run clips). */
  app.post('/api/items/:id/meshy/model', h((req) => {
    if (req.get('X-User-Action') !== 'item-meshy-model' || req.body.confirm !== true) throw new HttpError(400, 'New models can only be requested with the “Send to Meshy” button.');
    const item = need(one('SELECT * FROM items WHERE id=?', +req.params.id), 'My World item');
    const prompt = String(req.body.prompt || '').trim();
    if (prompt.length < 10) throw new HttpError(400, 'Write a prompt describing the model first.');
    const rig = req.body.rig === true && item.kind === 'character';
    const rigType = req.body.rig_type === 'quadruped' ? 'quadruped' : 'biped';
    const height = rig && Number(req.body.height_meters) > 0 ? Math.min(20, Number(req.body.height_meters)) : null;
    const style = channel().world_style_summary ? ` Style: ${channel().world_style_summary}` : '';
    const full = rigReadyPrompt(`${prompt}${prompt.includes('Style:') ? '' : style}`, rig, rigType);
    const permit = meshy.permit('generate', { episodeId: null, ref: `item ${item.id} new model` });
    const id = meshy.startJob('meshy-item3d', null, { item_id: item.id, prompt: full, texture_prompt: String(req.body.texture_prompt || '').slice(0, 800), pose: rig && rigType === 'biped' ? 'a-pose' : 'none',
      rig, animation_type: rigType, height_meters: height, note: String(req.body.note || (rig ? 'New model + rig from Meshy' : 'New model from Meshy')).slice(0, 300) }, `Meshy new model${rig ? ' + rig' : ''} for ${item.name}`, permit);
    return jobOut(one('SELECT * FROM jobs WHERE id=?', id));
  }));
  /** My World → "Change colours & materials": keeps the shape, new textures (Meshy retexture) → a new draft version. */
  app.post('/api/items/:id/meshy/retexture', h((req) => {
    if (req.get('X-User-Action') !== 'item-meshy-retexture' || req.body.confirm !== true) throw new HttpError(400, 'Retexturing can only be requested with the “Send to Meshy” button.');
    const item = need(one('SELECT * FROM items WHERE id=?', +req.params.id), 'My World item');
    const prompt = String(req.body.prompt || '').trim();
    if (prompt.length < 5) throw new HttpError(400, 'Describe the new colours and materials first.');
    const src = req.body.version_id ? versionModel(item.id, +req.body.version_id) : (() => { const l = libraryPreview(item.id); return l?.model && { file_path: l.model.file_path, version_id: l.version_id }; })();
    if (!src) throw new HttpError(400, 'This item has no 3D model to change yet.');
    const permit = meshy.permit('generate', { episodeId: null, ref: `item ${item.id} retexture` });
    const id = meshy.startJob('meshy-retexture', null, { item_id: item.id, version_id: src.version_id, model_path: src.file_path, prompt }, `Meshy new colours & materials for ${item.name}`, permit);
    return jobOut(one('SELECT * FROM jobs WHERE id=?', id));
  }));
  /** Meshy work for one My World item (newest first), for the progress list on its page. */
  app.get('/api/items/:id/jobs', h((req) => all(`SELECT * FROM jobs WHERE type LIKE 'meshy-%' AND (json_extract(params,'$.item_id')=? OR json_extract(params,'$.card_id') IN (SELECT id FROM asset_cards WHERE item_id=?)) ORDER BY id DESC LIMIT 12`, +req.params.id, +req.params.id).map(jobOut)));
  app.post('/api/meshy/motions', h(async (req) => meshy.motionLibrary(meshy.permit('motion-library', { episodeId: req.body.episode_id || null, ref: 'browse motions click' }), req.body.search || '')));
  app.post('/api/items/:id/meshy/clip', h((req) => {
    if (req.get('X-User-Action') !== 'request-clip' || req.body.confirm !== true) throw new HttpError(400, 'Clips can only be requested with the “Request clip in Meshy” button.');
    const rig = need(one(`SELECT * FROM assets WHERE id=? AND category='rig'`, +req.body.rig_asset_id), 'Rig');
    const note = JSON.parse(rig.notes || '{}');
    if (!note.meshy_rig_task_id) throw new HttpError(400, 'Clips can only be requested for rigs made by Meshy (Meshy needs its own rig task).');
    if (Date.now() - (note.created || 0) > 3 * 24 * 3600 * 1000) throw new HttpError(400, 'Meshy deletes rig tasks after 3 days. Request a new rig first.');
    const epId = Number(req.body.episode_id);
    const permit = meshy.permit('animate', { episodeId: epId, ref: `item ${req.params.id}` });
    const id = meshy.startJob('meshy-anim', epId, { item_id: +req.params.id, rig_task_id: note.meshy_rig_task_id, action_id: req.body.action_id, action_name: req.body.action_name }, `Meshy clip “${req.body.action_name}”`, permit);
    return jobOut(one('SELECT * FROM jobs WHERE id=?', id));
  }));

  // ================= Stage 5: preview & export (frames rendered by the browser's 3D engine) =================
  const renderDir = (jobId) => path.join(TMP_DIR, `render-${jobId}`);
  app.post('/api/episodes/:id/render/start', h((req) => {
    const epId = +req.params.id;
    const ep = need(one('SELECT * FROM episodes WHERE id=?', epId), 'Project');
    if (!FFMPEG) throw new HttpError(400, 'FFmpeg is not installed (winget install Gyan.FFmpeg).');
    if (!ep.master_audio_id) throw new HttpError(400, 'Approve the final audio in Stage 3 first.');
    if (one(`SELECT id FROM jobs WHERE episode_id=? AND type='render' AND status IN ('queued','running')`, epId)) throw new HttpError(409, 'An export is already running for this project.');
    const width = Math.min(1920, Number(req.body.width) || 1280), height = Math.min(1080, Number(req.body.height) || 720);
    const fps = [24, 25, 30].includes(Number(req.body.fps)) ? Number(req.body.fps) : 30;
    const duration = Number(req.body.duration);
    if (!(duration > 0 && duration < 1200)) throw new HttpError(400, 'Invalid duration.');
    const frames = Math.ceil(duration * fps);
    const id = Number(run(`INSERT INTO jobs(type,episode_id,status,progress,message,params) VALUES('render',?, 'running', 0, 'Rendering frames in the browser…', ?)`, epId, JSON.stringify({ width, height, fps, duration, frames })).lastInsertRowid);
    fs.mkdirSync(renderDir(id), { recursive: true });
    return jobOut(one('SELECT * FROM jobs WHERE id=?', id));
  }));
  app.post('/api/render/:id/frames', upload.array('frames', 200), h((req) => {
    const job = one(`SELECT * FROM jobs WHERE id=? AND type='render'`, +req.params.id);
    if (!job || job.status !== 'running') { cleanupTmp(req.files); throw new HttpError(400, 'This export is not running.'); }
    const p = JSON.parse(job.params);
    for (const f of req.files) {
      if (!/^f\d{6}\.jpg$/.test(f.originalname)) { cleanupTmp([f]); continue; }
      fs.renameSync(f.path, path.join(renderDir(job.id), f.originalname));
    }
    const have = fs.readdirSync(renderDir(job.id)).length;
    run(`UPDATE jobs SET progress=?, message=?, updated_at=datetime('now') WHERE id=?`, Math.min(0.8, (have / p.frames) * 0.8), `Rendered ${have}/${p.frames} frames…`, job.id);
    return { received: have };
  }));
  app.post('/api/render/:id/fail', h((req) => {
    run(`UPDATE jobs SET status='error', message=? WHERE id=? AND type='render'`, `Export failed in the browser: ${String(req.body.message || 'unknown error').slice(0, 300)}`, +req.params.id);
    fs.rmSync(renderDir(+req.params.id), { recursive: true, force: true });
  }));
  app.post('/api/render/:id/finish', h((req) => {
    const job = need(one(`SELECT * FROM jobs WHERE id=? AND type='render'`, +req.params.id), 'Export');
    const p = JSON.parse(job.params);
    const dir = renderDir(job.id);
    const have = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
    if (have < p.frames) throw new HttpError(400, `Only ${have} of ${p.frames} frames arrived.`);
    run(`UPDATE jobs SET progress=0.82, message='Encoding MP4 with the approved audio…' WHERE id=?`, job.id);
    setImmediate(async () => {
      try {
        const ep = one('SELECT * FROM episodes WHERE id=?', job.episode_id);
        const audio = one('SELECT * FROM assets WHERE id=?', ep.master_audio_id);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const relDir = `exports/episode-${ep.id}/${stamp}-${p.height}p`;
        fs.mkdirSync(path.join(MEDIA_DIR, relDir), { recursive: true });
        const name = `${slug(ep.title)}-${p.height}p.mp4`;
        await runFfmpeg(['-framerate', String(p.fps), '-i', path.join(dir, 'f%06d.jpg'), '-i', path.join(MEDIA_DIR, audio.file_path),
          '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(p.fps),
          '-af', 'apad', '-c:a', 'aac', '-b:a', '192k', '-t', p.duration.toFixed(3), '-movflags', '+faststart', path.join(MEDIA_DIR, relDir, name)],
        { totalSeconds: p.duration, onProgress: (x) => run('UPDATE jobs SET progress=? WHERE id=?', 0.82 + 0.17 * x, job.id) });
        const t = JSON.parse(ep.timing || '{}');
        const caps = (t.lines || []).filter((l) => l.start != null && l.end != null).map((l) => ({ start: l.start, end: l.end, text: l.text }));
        fs.writeFileSync(path.join(MEDIA_DIR, relDir, 'captions.srt'), '﻿' + toSrt(caps), 'utf8');
        const meta = probe(path.join(MEDIA_DIR, relDir, name));
        run(`UPDATE jobs SET status='done', progress=1, message=?, output=?, updated_at=datetime('now') WHERE id=?`,
          `Exported ${p.width}×${p.height} · ${(meta.duration ?? p.duration).toFixed(1)}s with the approved audio.`,
          JSON.stringify({ mp4: `/media/${relDir}/${name}`, srt: `/media/${relDir}/captions.srt`, folder: path.join(MEDIA_DIR, relDir) }), job.id);
        clearFlag(ep.id, 'export');
      } catch (e) {
        run(`UPDATE jobs SET status='error', message=? WHERE id=?`, e.message || String(e), job.id);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    return jobOut(one('SELECT * FROM jobs WHERE id=?', job.id));
  }));
}
