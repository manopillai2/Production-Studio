import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useStudio, useAction, Badge, Confirm, Assistant, DurationPicker, mmss } from '../ui.jsx';
import { isEnglish, langName, sungLine } from '../langs.jsx';

const TYPES = ['intro', 'verse', 'chorus', 'bridge', 'outro'];
const SEC_PER_LINE = 4;

export default function StageLyrics() {
  const { episode, setEpisode, refreshEpisode } = useStudio();
  const [selId, setSelId] = useState(episode.approved_lyrics_id || episode.lyrics.at(-1)?.id || null);
  const [compare, setCompare] = useState(null);
  const [act] = useAction();

  useEffect(() => {
    if (selId && !episode.lyrics.some((l) => l.id === selId)) setSelId(episode.approved_lyrics_id || episode.lyrics.at(-1)?.id || null);
  }, [episode, selId]);
  const sel = episode.lyrics.find((l) => l.id === selId);
  const newDraft = (body, msg) => act(async () => { const l = await api.post(`/api/episodes/${episode.id}/lyrics`, body); await refreshEpisode(); setSelId(l.id); setCompare(null); }, msg);
  const lines = sel ? sel.sections.flatMap((s) => s.lines).filter((l) => sungLine(l, episode.language).trim()).length : 0;
  const langLabel = isEnglish(episode.language) ? 'English' : `${langName(episode.language)} (with English meanings for you)`;
  const est = lines * SEC_PER_LINE, target = episode.target_duration || 60;

  return (
    <div className="stage-grid">
      <div className="stack">
        <div className="card">
          <div className="row wrap">
            <b>Target video length</b>
            <DurationPicker value={target} onChange={(target_duration) => act(async () => setEpisode(await api.put(`/api/episodes/${episode.id}`, { target_duration })), `Target length ${mmss(target_duration)}`)} />
          </div>
          <small className="muted">{episode.master_audio ? <>Planning target only — the approved audio in Stage 3 is <b>{mmss(episode.master_audio.duration)}</b> and sets the real length.</> : 'A planning target until the final audio is approved in Stage 3.'}</small>
          {sel && (
            <div className="length-meter">
              <div className="meter"><span style={{ width: `${Math.min(100, (est / target) * 100)}%` }} className={est > target * 1.15 ? 'over' : est < target * 0.7 ? 'under' : ''} /></div>
              <small className="muted">{lines} sung lines × ~{SEC_PER_LINE}s ≈ <b>{mmss(est)}</b> of {mmss(target)} target{est > target * 1.15 ? ' — too long' : est < target * 0.7 ? ' — add verses or repeat the chorus' : ' — good fit'}</small>
            </div>
          )}
        </div>

        {episode.lyrics.length > 0 && (
          <div className="row wrap version-bar">
            <label className="row">Version
              <select value={selId || ''} onChange={(e) => { setSelId(Number(e.target.value)); setCompare(null); }}>
                {[...episode.lyrics].reverse().map((l) => <option key={l.id} value={l.id}>{l.status === 'approved' ? '🔒 ' : ''}{l.title}{l.source !== 'manual' ? ` (${l.source})` : ''}</option>)}
              </select>
            </label>
            <span className="muted small">{episode.lyrics.length} version(s) — the assistant never overwrites; every change is a new version.</span>
            <span className="grow" />
            {episode.lyrics.length > 1 && <button className={`btn small ${compare ? 'on' : ''}`} onClick={() => setCompare(compare ? null : [episode.lyrics.at(-2).id, selId || episode.lyrics.at(-1).id])}>⇆ Compare</button>}
            <button className="btn small" onClick={() => newDraft({ title: `Draft ${episode.lyrics.length + 1}` }, 'New blank version')}>+ Blank</button>
          </div>
        )}

        {compare ? <Compare ids={compare} setIds={setCompare} lyrics={episode.lyrics} />
          : sel ? <Editor key={sel.id} lyric={sel} prev={sel.source === 'assistant' ? [...episode.lyrics].filter((l) => l.id < sel.id).at(-1) : null} onDuplicate={() => newDraft({ copy_from: sel.id }, 'Duplicated as a new version')} />
            : (
              <div className="empty start-box">
                <h3>Start your song</h3>
                <p>Paste lyrics you already have, or describe the idea to the assistant on the right and it will write them.</p>
                <button className="btn primary" onClick={() => newDraft({ title: 'My lyrics' }, 'Blank version created — type or paste below')}>✍ Write / paste lyrics</button>
              </div>
            )}
      </div>

      <Assistant
        scope="lyrics" episodeId={episode.id} title="Lyrics assistant"
        intro={<>Describe your idea (“an elephant and a monkey playing by the river, teaching counting to 5”) and I'll write the lyrics in {langLabel} for a {mmss(target)} video. Then ask for tweaks: “make the chorus catchier”, “simpler words”, “add a verse about the mountain”.</>}
        chips={['Write a rhyme about…', `Fit it to ${mmss(target)}`, 'Make the chorus catchier', 'Simpler words for toddlers', 'Add a counting verse', 'Add action cues for every line']}
        refAction="lyrics.assistant"
        send={async (message, reference) => {
          const r = await api.post(`/api/episodes/${episode.id}/assistant/lyrics`, { message, lyrics_id: selId, reference });
          setEpisode(r.episode);
          if (r.lyrics_id) { setSelId(r.lyrics_id); setCompare(null); }
          return r;
        }}
        renderRef={(m) => m.ref?.lyrics_id && (
          <button className="btn tiny" onClick={() => { setSelId(m.ref.lyrics_id); setCompare(null); }}>{m.ref.lyrics_id === selId ? '● Showing this version' : 'View this version'}</button>
        )}
      />
    </div>
  );
}

function Editor({ lyric, prev, onDuplicate }) {
  // Lines the assistant changed compared with the version before (shown highlighted for review).
  const prevLines = prev ? prev.sections.flatMap((s) => s.lines) : null;
  const flatIndex = (si, li) => lyric.sections.slice(0, si).reduce((n, s) => n + s.lines.length, 0) + li;
  const changed = (si, li, l) => { if (!prevLines) return false; const p = prevLines[flatIndex(si, li)]; return !p || p.ta !== l.ta || p.en !== l.en || p.cue !== l.cue; };
  const { refreshEpisode, toast, episode, setEpisode } = useStudio();
  const en = isEnglish(episode.language);
  const L = langName(episode.language);
  const [act, busy] = useAction();
  const [title, setTitle] = useState(lyric.title);
  const [sections, setSections] = useState(lyric.sections);
  const [saveState, setSaveState] = useState('saved');
  const [paste, setPaste] = useState(null);
  const locked = lyric.status === 'approved';
  const timer = useRef();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (locked) return;
    setSaveState('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSaveState('saving');
      try { await api.put(`/api/lyrics/${lyric.id}`, { title, sections }); setSaveState('saved'); refreshEpisode(); }
      catch (e) { setSaveState('error'); toast(e.message, 'error'); }
    }, 700);
    return () => clearTimeout(timer.current);
  }, [title, sections]); // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (si, fn) => setSections(sections.map((s, i) => (i === si ? fn(s) : s)));
  const updLine = (si, li, k, v) => upd(si, (s) => ({ ...s, lines: s.lines.map((l, j) => (j === li ? { ...l, [k]: v } : l)) }));

  const importPaste = () => {
    // Blank line = new section; "[Chorus]" names it; "Tamil | English | cue" splits columns.
    const blocks = paste.text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    const add = blocks.map((b, i) => {
      let rows = b.split('\n');
      let label = `Verse ${i + 1}`, type = 'verse';
      const head = /^\[(.+)\]$/.exec(rows[0].trim());
      if (head) { label = head[1]; type = TYPES.find((t) => label.toLowerCase().includes(t)) || 'verse'; rows = rows.slice(1); }
      return { type, label, lines: rows.map((ln) => {
        const [a = '', b2 = '', c = ''] = ln.split('|').map((x) => x.trim());
        return en ? { ta: '', en: a, cue: b2 } : { ta: a, en: b2, cue: c };
      }) };
    });
    setSections([...sections.filter((s) => s.lines.some((l) => l.ta || l.en)), ...add]);
    setPaste(null);
  };

  return (
    <div className="card">
      <div className="row">
        <input className="title-input grow" value={title} disabled={locked} onChange={(e) => setTitle(e.target.value)} />
        <Badge status={lyric.status} text={locked ? 'Approved' : 'Draft'} />
        {!locked && <span className={`save-state ${saveState}`}>{{ saved: 'Saved', pending: 'Editing…', saving: 'Saving…', error: 'Not saved' }[saveState]}</span>}
      </div>
      {locked && (
        <div className="locked">
          ✓ These are the approved lyrics. Stage 2 analyzes them, and Stages 3–5 use them for timing, shots and captions.
          <Confirm className="btn small" text="Unlock to edit? The project will have no final lyrics until you finalize again." onYes={() => act(async () => setEpisode(await api.post(`/api/lyrics/${lyric.id}/unlock`)), 'Lyrics unlocked — you can edit them now')}>Unlock to edit</Confirm>
        </div>
      )}
      <div className="row wrap">
        {!locked && <button className="btn approve" disabled={busy || saveState !== 'saved'} onClick={() => act(async () => { await api.post(`/api/lyrics/${lyric.id}/approve`); await refreshEpisode(); }, 'Lyrics approved — Stage 2 will analyze this version')}>✓ Approve Lyrics</button>}
        <button className="btn" onClick={onDuplicate}>⧉ Duplicate</button>
        {!locked && <button className="btn" onClick={() => setPaste({ text: '', lang: 'both' })}>📋 Paste lyrics</button>}
        {!locked && <Confirm text="Delete this version?" onYes={() => act(async () => { await api.del(`/api/lyrics/${lyric.id}`); await refreshEpisode(); }, 'Version deleted')}>Delete version</Confirm>}
      </div>

      {paste && (
        <div className="paste-box">
          <p className="muted small">One line per row. Blank line = new section. Optional heading like <code>[Chorus]</code>.
            Format: <code>{en ? 'English line | action cue' : `${L} line | English meaning | action cue`}</code> (only the first part is required).</p>
          <textarea rows={8} value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })}
            placeholder={en ? '[Chorus]\nJump, jump, little elephant | elephant bounces\n…' : `[Chorus]\n(${L} line) | Jump, jump, little elephant | elephant bounces\n…`} />
          <div className="row"><button className="btn primary" onClick={importPaste} disabled={!paste.text.trim()}>Add to lyrics</button><button className="btn ghost" onClick={() => setPaste(null)}>Cancel</button></div>
        </div>
      )}

      {sections.map((s, si) => (
        <div key={si} className={`lyric-section ${s.type}`}>
          <div className="row">
            <select value={s.type} disabled={locked} onChange={(e) => upd(si, (x) => ({ ...x, type: e.target.value }))}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            <input value={s.label} disabled={locked} onChange={(e) => upd(si, (x) => ({ ...x, label: e.target.value }))} />
            {!locked && <button className="btn ghost small" onClick={() => setSections(sections.filter((_, i) => i !== si))}>Remove section</button>}
          </div>
          <table className="lyric-table">
            <thead><tr>{en ? <th>English (sung)</th> : <><th>{L} (sung)</th><th>English meaning (for you)</th></>}<th>Action cue (what happens on screen)</th><th /></tr></thead>
            <tbody>
              {s.lines.map((l, li) => (
                <tr key={li} className={changed(si, li, lyric.sections[si]?.lines[li] || l) ? 'changed' : ''} title={changed(si, li, lyric.sections[si]?.lines[li] || l) ? 'Changed by the assistant — review it' : ''}>
                  {!en && <td><input className="ta" value={l.ta} disabled={locked} onChange={(e) => updLine(si, li, 'ta', e.target.value)} /></td>}
                  <td><input className={en ? '' : 'meaning'} value={l.en} disabled={locked} onChange={(e) => updLine(si, li, 'en', e.target.value)} /></td>
                  <td><input className="cue" value={l.cue} disabled={locked} placeholder="e.g. monkey swings on the tree" onChange={(e) => updLine(si, li, 'cue', e.target.value)} /></td>
                  <td>{!locked && <button className="btn ghost tiny" onClick={() => upd(si, (x) => ({ ...x, lines: x.lines.filter((_, j) => j !== li) }))}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!locked && <button className="btn ghost small" onClick={() => upd(si, (x) => ({ ...x, lines: [...x.lines, { ta: '', en: '', cue: '' }] }))}>+ Line</button>}
        </div>
      ))}
      {!locked && <button className="btn" onClick={() => setSections([...sections, { type: 'verse', label: `Verse ${sections.length + 1}`, lines: [{ ta: '', en: '', cue: '' }] }])}>+ Section</button>}
    </div>
  );
}

function Compare({ ids, setIds, lyrics }) {
  const pick = (side) => (e) => { const n = [...ids]; n[side] = Number(e.target.value); setIds(n); };
  const [a, b] = ids.map((id) => lyrics.find((l) => l.id === id));
  const flat = (l) => l?.sections.flatMap((s) => s.lines.map((x) => ({ ...x, sec: s.label }))) || [];
  const fa = flat(a), fb = flat(b);
  const same = (x, y) => x && y && x.ta === y.ta && x.en === y.en && x.cue === y.cue;
  return (
    <div className="card">
      <div className="compare-head">
        {[a, b].map((l, side) => (
          <div key={side} className="row">
            <select value={ids[side]} onChange={pick(side)}>{lyrics.map((x) => <option key={x.id} value={x.id}>{x.title} ({x.status === 'approved' ? 'final' : 'draft'})</option>)}</select>
          </div>
        ))}
      </div>
      <table className="table compare-table">
        <tbody>
          {Array.from({ length: Math.max(fa.length, fb.length) }, (_, i) => (
            <tr key={i} className={same(fa[i], fb[i]) ? '' : 'changed'}>
              {[fa[i], fb[i]].map((x, side) => (
                <td key={side}>{x ? <><small className="muted">{x.sec}</small><div className="ta">{x.ta}</div><div>{x.en}</div>{x.cue && <div className="cue">🎬 {x.cue}</div>}</> : <span className="muted">—</span>}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Highlighted rows differ.</p>
    </div>
  );
}
