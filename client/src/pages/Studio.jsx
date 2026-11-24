import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { api, fmtTime, resLabel } from '../api.js';
import { useStudio, useAction, NeedEpisode, JobList, Field, EditField } from '../ui.jsx';
import { isEnglish, langName } from '../langs.jsx';

export default function Studio() { return <NeedEpisode><StudioInner /></NeedEpisode>; }

export function StudioInner() {
  const { episode, setEpisode, refreshEpisode, channel } = useStudio();
  const [act, busy] = useAction();
  const [selShot, setSelShot] = useState(null);
  const [caps, setCaps] = useState(episode.captions);
  const [capsDirty, setCapsDirty] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const playerRef = useRef();

  useEffect(() => { if (!capsDirty) setCaps(episode.captions); }, [episode.captions, capsDirty]);
  const total = episode.timeline.at(-1)?.end || 0;
  const style = { ...(channel?.caption_style || {}), ...(episode.caption_style || {}) };

  const reorder = (ids) => act(async () => setEpisode(await api.post(`/api/episodes/${episode.id}/shots/reorder`, { ids })), 'Shots reordered');
  const saveCaps = () => act(async () => { setEpisode(await api.put(`/api/episodes/${episode.id}/captions`, { captions: caps })); setCapsDirty(false); }, 'Captions saved');
  const editCaps = (next) => { setCaps(next); setCapsDirty(true); };

  return (
    <div className="studio">
      <div className="studio-top">
        <Player ref={playerRef} episode={episode} captions={caps} style={style} fonts={channel?.fonts} total={total} onTime={setPlayhead} />
        <ExportPanel episode={episode} refreshEpisode={refreshEpisode} capsDirty={capsDirty} />
      </div>

      <div className="card">
        <div className="section-head">
          <h3>Timeline <span className="muted small">· drag shots to reorder · click a shot to trim</span></h3>
          <span className="muted">{fmtTime(playhead)} / {fmtTime(total)}{episode.master_audio && ` · song ${fmtTime(episode.master_audio.duration)}`}</span>
        </div>
        <Timeline episode={episode} total={total} caps={caps} playhead={playhead} selShot={selShot} setSelShot={setSelShot}
          onReorder={reorder} onSeek={(t) => playerRef.current?.seek(t)} />
        {selShot && episode.shots.find((s) => s.id === selShot) && (
          <TrimPanel shot={episode.shots.find((s) => s.id === selShot)} seg={episode.timeline.find((s) => s.shot_id === selShot)} act={act} refresh={refreshEpisode}
            onPreview={(t) => playerRef.current?.seek(t, true)} />
        )}
      </div>

      <CaptionEditor episode={episode} caps={caps} editCaps={editCaps} dirty={capsDirty} save={saveCaps} busy={busy} playhead={playhead}
        onSeek={(t) => playerRef.current?.seek(t)}
        fromLyrics={(language) => act(async () => { setEpisode(await api.post(`/api/episodes/${episode.id}/captions/from-lyrics`, { language })); setCapsDirty(false); }, 'Captions rebuilt from approved lyrics')} />

      <div className="grid2">
        <Thumbnail episode={episode} channel={channel} act={act} setEpisode={setEpisode} />
        <YouTubeMeta episode={episode} act={act} setEpisode={setEpisode} />
      </div>
    </div>
  );
}

// ---------------- Player ----------------
const Player = forwardRef(function Player({ episode, captions, style, fonts, total, onTime }, ref) {
  const audioRef = useRef();
  const vids = useRef({});
  const clock = useRef({ start: 0, offset: 0 });
  const raf = useRef();
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const segs = episode.timeline;

  const sync = useCallback((now, isPlaying) => {
    const active = segs.find((s) => now >= s.start && now < s.end) || (now >= total ? segs.at(-1) : null);
    for (const s of segs) {
      const v = vids.current[s.shot_id];
      if (!v) continue;
      if (s === active) {
        v.style.visibility = 'visible';
        const target = Math.min(s.trim_in + (now - s.start), s.trim_out - 0.02);
        if (isPlaying) { if (Math.abs(v.currentTime - target) > 0.25) v.currentTime = target; if (v.paused) v.play().catch(() => {}); }
        else { v.pause(); if (Math.abs(v.currentTime - target) > 0.03) v.currentTime = target; }
      } else { v.style.visibility = 'hidden'; if (!v.paused) v.pause(); }
    }
    const a = audioRef.current;
    if (a) {
      if (isPlaying && now < (a.duration || Infinity)) { if (Math.abs(a.currentTime - now) > 0.15) a.currentTime = now; if (a.paused) a.play().catch(() => {}); }
      else { a.pause(); if (!isPlaying) a.currentTime = Math.min(now, a.duration || now); }
    }
  }, [segs, total]);

  const tick = useCallback(() => {
    const now = clock.current.offset + (performance.now() - clock.current.start) / 1000;
    if (now >= total) { setPlaying(false); setT(total); onTime(total); sync(total, false); return; }
    setT(now); onTime(now); sync(now, true);
    raf.current = requestAnimationFrame(tick);
  }, [total, sync, onTime]);

  const play = () => {
    const from = t >= total - 0.05 ? 0 : t;
    clock.current = { start: performance.now(), offset: from };
    setPlaying(true);
    sync(from, true);
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
  };
  const pause = () => { cancelAnimationFrame(raf.current); setPlaying(false); sync(t, false); };
  const seek = (x, andPlay) => {
    const nt = Math.max(0, Math.min(total, x));
    setT(nt); onTime(nt);
    if (playing || andPlay) { clock.current = { start: performance.now(), offset: nt }; sync(nt, true); if (!playing) { setPlaying(true); raf.current = requestAnimationFrame(tick); } }
    else sync(nt, false);
  };
  useImperativeHandle(ref, () => ({ seek }));
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => { if (!playing) sync(t, false); }, [segs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); playing ? pause() : play(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const cap = captions.find((c) => t >= c.start && t < c.end);
  const missing = segs.filter((s) => !s.clip_url).length;

  return (
    <div className="card player">
      <div className="stage">
        {segs.map((s) => s.clip_url && (
          <video key={s.shot_id} ref={(el) => { if (el) vids.current[s.shot_id] = el; else delete vids.current[s.shot_id]; }}
            src={s.clip_url} muted playsInline preload="auto" style={{ visibility: 'hidden' }}
            onLoadedData={() => !playing && sync(t, false)} />
        ))}
        {!segs.length && <div className="stage-empty">Add shots with approved clips in Animation.</div>}
        {cap && (
          <div className={`stage-caption pos-${style.position || 'bottom'}`}>
            <span style={{
              fontFamily: `'${fonts?.tamil}', '${fonts?.english}', 'Nirmala UI', sans-serif`,
              fontSize: `${(style.fontSize || 54) / 19.2}cqw`, color: style.color,
              WebkitTextStroke: `${((style.outlineWidth ?? 4) / 19.2) * 0.9}cqw ${style.outline}`, paintOrder: 'stroke fill',
              background: style.background ? 'rgba(0,0,0,.55)' : 'none',
            }}>{cap.text}</span>
          </div>
        )}
      </div>
      <div className="transport">
        <button className="btn primary" onClick={playing ? pause : play} disabled={!segs.length}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button className="btn ghost" onClick={() => seek(0)}>⏮</button>
        <input type="range" min="0" max={total || 0} step="0.01" value={t} onChange={(e) => seek(Number(e.target.value))} className="grow" />
        <span className="mono">{fmtTime(t)} / {fmtTime(total)}</span>
      </div>
      {episode.master_audio ? <audio ref={audioRef} src={episode.master_audio.url} preload="auto" /> : <div className="warn small">No master audio — preview is silent.</div>}
      {missing > 0 && <div className="warn small">{missing} shot(s) have no approved clip and show black.</div>}
      <div className="muted small">Space = play/pause. Preview syncs clips to the song clock in the browser; the export renders the exact same cut.</div>
    </div>
  );
});

// ---------------- Timeline ----------------
function Timeline({ episode, total, caps, playhead, selShot, setSelShot, onReorder, onSeek }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const width = (len) => `${Math.max(4, (len / Math.max(total, 0.01)) * 100)}%`;
  const ids = episode.shots.map((s) => s.id);
  const pct = (x) => `${(x / Math.max(total, 0.01)) * 100}%`;
  const audioDur = episode.master_audio?.duration || 0;

  const drop = (targetId) => {
    if (drag == null || drag === targetId) return;
    const next = ids.filter((i) => i !== drag);
    next.splice(next.indexOf(targetId) + (ids.indexOf(drag) < ids.indexOf(targetId) ? 1 : 0), 0, drag);
    onReorder(next);
  };

  return (
    <div className="timeline" onClick={(e) => {
      if (e.target.classList.contains('tl-ruler')) { const r = e.target.getBoundingClientRect(); onSeek(((e.clientX - r.left) / r.width) * total); }
    }}>
      <div className="tl-ruler" title="Click to seek">
        {Array.from({ length: Math.floor(total) + 1 }, (_, i) => <span key={i} style={{ left: pct(i) }}>{i % 2 === 0 ? `${i}s` : ''}</span>)}
        <div className="tl-playhead" style={{ left: pct(Math.min(playhead, total)) }} />
      </div>
      <div className="tl-track shots">
        {episode.shots.map((s, i) => {
          const seg = episode.timeline[i];
          return (
            <div key={s.id} className={`tl-shot ${selShot === s.id ? 'sel' : ''} ${over === s.id ? 'over' : ''} ${s.approved_clip ? '' : 'missing'}`}
              style={{ width: width(seg.length), backgroundImage: s.ref_asset ? `url(${s.ref_asset.url})` : undefined }}
              draggable onDragStart={() => setDrag(s.id)} onDragEnd={() => { setDrag(null); setOver(null); }}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id); }} onDrop={() => { drop(s.id); setOver(null); }}
              onClick={() => { setSelShot(selShot === s.id ? null : s.id); onSeek(seg.start); }}>
              <span>{i + 1}. {s.title}</span><small>{fmtTime(seg.length)}{s.approved_clip ? '' : ' · no clip'}</small>
            </div>
          );
        })}
      </div>
      <div className="tl-track captions">
        {caps.map((c, i) => <div key={i} className="tl-cap" style={{ left: pct(c.start), width: pct(Math.max(0.05, c.end - c.start)) }} title={c.text} onClick={() => onSeek(c.start)}>{c.text.split('\n')[0]}</div>)}
      </div>
      {audioDur > 0 && (
        <div className="tl-track audio">
          <div className="tl-audio" style={{ width: pct(Math.min(audioDur, total)) }}>♪ {episode.master_audio.label}</div>
          {audioDur < total - 0.1 && <span className="warn small"> song ends at {fmtTime(audioDur)}</span>}
        </div>
      )}
      {audioDur > total + 0.1 && <div className="warn small">The song ({fmtTime(audioDur)}) is longer than the shots ({fmtTime(total)}); the export ends with the last shot.</div>}
    </div>
  );
}

function TrimPanel({ shot, seg, act, refresh, onPreview }) {
  const clip = shot.approved_clip;
  const D = clip?.duration || seg.length;
  const [tin, setTin] = useState(seg.trim_in);
  const [tout, setTout] = useState(seg.trim_out);
  useEffect(() => { setTin(seg.trim_in); setTout(seg.trim_out); }, [seg.trim_in, seg.trim_out]);
  const commit = (a = tin, b = tout) => act(async () => { await api.put(`/api/shots/${shot.id}`, { trim_in: +a.toFixed(2), trim_out: +b.toFixed(2) }); await refresh(); }, 'Trim saved');
  if (!clip) return <div className="trim muted">Shot “{shot.title}” has no approved clip yet — approve one in Animation.</div>;
  return (
    <div className="trim">
      <b>Trim “{shot.title}”</b> <span className="muted small">{resLabel(clip)} · source {fmtTime(D)}</span>
      <div className="trim-bar">
        <div className="trim-sel" style={{ left: `${(tin / D) * 100}%`, width: `${((tout - tin) / D) * 100}%` }} />
        <input type="range" min="0" max={D} step="0.05" value={tin} onChange={(e) => setTin(Math.min(Number(e.target.value), tout - 0.1))} onPointerUp={() => commit()} onKeyUp={() => commit()} />
        <input type="range" min="0" max={D} step="0.05" value={tout} onChange={(e) => setTout(Math.max(Number(e.target.value), tin + 0.1))} onPointerUp={() => commit()} onKeyUp={() => commit()} />
      </div>
      <div className="row wrap">
        <label>In <input type="number" step="0.05" value={tin} onChange={(e) => setTin(Number(e.target.value))} onBlur={() => commit()} /></label>
        <label>Out <input type="number" step="0.05" value={tout} onChange={(e) => setTout(Number(e.target.value))} onBlur={() => commit()} /></label>
        <span className="muted">Length {fmtTime(tout - tin)}</span>
        <button className="btn small" onClick={() => onPreview(seg.start)}>▶ Preview shot</button>
        <button className="btn ghost small" onClick={() => { setTin(0); setTout(D); commit(0, D); }}>Reset trim</button>
      </div>
    </div>
  );
}

// ---------------- Captions ----------------
function CaptionEditor({ episode, caps, editCaps, dirty, save, busy, playhead, onSeek, fromLyrics }) {
  const [lang, setLang] = useState(['native', 'en', 'both'].includes(episode.caption_language) ? episode.caption_language : 'native');
  const L = langName(episode.language);
  const set = (i, k, v) => editCaps(caps.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const nudge = (i, d) => editCaps(caps.map((c, j) => (j === i ? { ...c, start: +Math.max(0, c.start + d).toFixed(2), end: +Math.max(0.1, c.end + d).toFixed(2) } : c)));
  const add = () => editCaps([...caps, { start: +playhead.toFixed(2), end: +(playhead + 3).toFixed(2), text: 'New caption' }].sort((a, b) => a.start - b.start));
  return (
    <div className="card">
      <div className="section-head">
        <h3>Captions {dirty && <span className="warn small">· unsaved</span>}</h3>
        <div className="row wrap">
          {!isEnglish(episode.language) && (
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="native">{L} (sung)</option><option value="en">English meaning</option><option value="both">{L} + English below</option>
            </select>
          )}
          <button className="btn" onClick={() => fromLyrics(lang)}>↻ From approved lyrics</button>
          <button className="btn" onClick={add}>+ At playhead</button>
          <a className="btn ghost" href={`/api/episodes/${episode.id}/captions.srt`} download>⬇ SRT</a>
          <button className="btn primary" disabled={!dirty || busy} onClick={save}>Save captions</button>
        </div>
      </div>
      <table className="table captions-table">
        <thead><tr><th>Start</th><th>End</th><th>Text</th><th /></tr></thead>
        <tbody>
          {caps.map((c, i) => {
            const active = playhead >= c.start && playhead < c.end;
            return (
              <tr key={i} className={active ? 'active' : ''}>
                <td><input type="number" step="0.1" value={c.start} onChange={(e) => set(i, 'start', Number(e.target.value))} />
                  <button className="btn ghost tiny" title="Set start to playhead" onClick={() => set(i, 'start', +playhead.toFixed(2))}>⇤</button></td>
                <td><input type="number" step="0.1" value={c.end} onChange={(e) => set(i, 'end', Number(e.target.value))} />
                  <button className="btn ghost tiny" title="Set end to playhead" onClick={() => set(i, 'end', +playhead.toFixed(2))}>⇥</button></td>
                <td><textarea rows={2} className="ta" value={c.text} onChange={(e) => set(i, 'text', e.target.value)} /></td>
                <td className="actions">
                  <button className="btn ghost tiny" onClick={() => onSeek(c.start)}>▶</button>
                  <button className="btn ghost tiny" title="Earlier 0.1s" onClick={() => nudge(i, -0.1)}>−.1</button>
                  <button className="btn ghost tiny" title="Later 0.1s" onClick={() => nudge(i, 0.1)}>+.1</button>
                  <button className="btn ghost tiny" onClick={() => editCaps(caps.filter((_, j) => j !== i))}>✕</button>
                  {c.end <= c.start && <span className="error-text small">end ≤ start</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!caps.length && <p className="muted">No captions. Build them from the approved lyrics, then fine-tune timing while previewing.</p>}
    </div>
  );
}

// ---------------- Export ----------------
function ExportPanel({ episode, refreshEpisode, capsDirty }) {
  const { toast } = useStudio();
  const [res, setRes] = useState('1080p');
  const [burn, setBurn] = useState(true);
  const [jobs, setJobs] = useState(episode.jobs);
  const [act, busy] = useAction();
  useEffect(() => setJobs(episode.jobs), [episode.jobs]);
  const active = jobs.some((j) => j.status === 'queued' || j.status === 'running');

  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      const list = await api.get(`/api/jobs?episode_id=${episode.id}`).catch(() => null);
      if (!list) return;
      setJobs(list);
      if (!list.some((j) => j.status === 'queued' || j.status === 'running')) {
        clearInterval(t);
        const j = list[0];
        toast(j.status === 'done' ? 'Export finished — download below' : `Export failed: ${j.message}`, j.status === 'done' ? 'ok' : 'error');
        refreshEpisode();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [active, episode.id, refreshEpisode, toast]);

  const problems = [
    ...episode.shots.filter((s) => !s.approved_clip).map((s) => `Shot “${s.title}” has no approved clip`),
    ...(episode.master_audio ? [] : ['No master audio selected']),
  ];
  const sources = episode.shots.filter((s) => s.approved_clip).map((s) => s.approved_clip);
  const lowRes = sources.filter((c) => c.height && c.height < (res === '4k' ? 2160 : 1080)).length;

  return (
    <div className="card export">
      <h3>📺 Export for YouTube</h3>
      <Field label="Resolution">
        <div className="seg">
          <button className={res === '1080p' ? 'on' : ''} onClick={() => setRes('1080p')}>1080p HD<small>1920×1080</small></button>
          <button className={res === '4k' ? 'on' : ''} onClick={() => setRes('4k')}>4K UHD<small>3840×2160</small></button>
        </div>
      </Field>
      <label className="check"><input type="checkbox" checked={burn} onChange={(e) => setBurn(e.target.checked)} /> Burn captions into the video</label>
      <p className="muted small">{burn ? 'Captions are drawn onto the picture.' : 'Captions are added as a selectable track.'} An .srt file is always saved for YouTube upload.</p>
      {lowRes > 0 && <div className="hint warn">{lowRes} clip(s) are below {res === '4k' ? '2160p' : '1080p'} and will be upscaled.</div>}
      {capsDirty && <div className="hint warn">Save captions first — the export uses saved captions.</div>}
      {problems.length > 0 && <ul className="error-text small">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <button className="btn primary block" disabled={busy || active || problems.length > 0 || capsDirty}
        onClick={() => act(async () => { const j = await api.post(`/api/episodes/${episode.id}/export`, { resolution: res, burn_captions: burn }); setJobs([j, ...jobs]); }, 'Export started')}>
        {active ? 'Rendering…' : `Export MP4 (${res === '4k' ? '4K' : '1080p'})`}
      </button>
      <JobList jobs={jobs.slice(0, 4)} />
    </div>
  );
}

// ---------------- Thumbnail ----------------
function Thumbnail({ episode, channel, act, setEpisode }) {
  const canvas = useRef();
  const sources = useMemo(() => [
    ...episode.shots.filter((s) => s.approved_clip).map((s, i) => ({ id: `clip${s.id}`, label: `Shot ${i + 1} frame: ${s.title}`, url: s.approved_clip.url, video: true, dur: s.approved_clip.duration })),
    ...episode.cast.flatMap((c) => (c.version?.assets || []).filter((a) => a.mime.startsWith('image/')).map((a) => ({ id: `a${a.id}`, label: `${c.name}: ${a.label}`, url: a.url }))),
  ], [episode]);
  const [src, setSrc] = useState(sources[0]?.id);
  const [frac, setFrac] = useState(0.4);
  const [title, setTitle] = useState(episode.title);
  const [titleTa, setTitleTa] = useState(episode.title_ta);
  const tpl = channel?.thumbnail_template || {};
  const logo = channel?.assets?.find((a) => a.id === channel.logo_asset_id);

  useEffect(() => { setTitle(episode.title); setTitleTa(episode.title_ta); }, [episode.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    const cv = canvas.current, ctx = cv.getContext('2d');
    const W = 1280, H = 720;
    const loadImg = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const loadFrame = (s) => new Promise((res, rej) => {
      const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = s.url;
      v.onloadeddata = () => { v.currentTime = (s.dur || v.duration || 1) * frac; };
      v.onseeked = () => res(v); v.onerror = rej;
    });
    (async () => {
      const s = sources.find((x) => x.id === src);
      await document.fonts.load(`700 80px '${channel?.fonts?.english}'`).catch(() => {});
      await document.fonts.load(`700 60px '${channel?.fonts?.tamil}'`, 'தமிழ்').catch(() => {});
      ctx.fillStyle = channel?.colors?.background || '#fff'; ctx.fillRect(0, 0, W, H);
      if (s) {
        try {
          const img = s.video ? await loadFrame(s) : await loadImg(s.url);
          if (cancelled) return;
          const iw = img.videoWidth || img.naturalWidth, ih = img.videoHeight || img.naturalHeight;
          const k = Math.max(W / iw, H / ih);
          ctx.drawImage(img, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
        } catch { /* keep background */ }
      }
      const layout = tpl.layout || 'title-bottom';
      const bandH = 230;
      ctx.fillStyle = tpl.band || '#ff7a59';
      ctx.globalAlpha = 0.92;
      if (layout === 'title-left') ctx.fillRect(0, 0, 560, H);
      else ctx.fillRect(0, layout === 'title-top' ? 0 : H - bandH, W, bandH);
      ctx.globalAlpha = 1;
      const textBlock = (txt, font, size, x, y, maxW) => {
        if (!txt) return;
        ctx.font = `700 ${size}px '${font}', 'Nirmala UI', sans-serif`;
        while (ctx.measureText(txt).width > maxW && size > 24) { size -= 4; ctx.font = `700 ${size}px '${font}', 'Nirmala UI', sans-serif`; }
        ctx.lineJoin = 'round'; ctx.lineWidth = size / 6; ctx.strokeStyle = tpl.stroke || '#000'; ctx.strokeText(txt, x, y);
        ctx.fillStyle = tpl.titleColor || '#fff'; ctx.fillText(txt, x, y);
      };
      ctx.textBaseline = 'middle';
      if (layout === 'title-left') {
        ctx.textAlign = 'left';
        textBlock(title, channel?.fonts?.english, 76, 40, 300, 490);
        textBlock(titleTa, channel?.fonts?.tamil, 56, 40, 420, 490);
      } else {
        ctx.textAlign = 'center';
        const y0 = layout === 'title-top' ? 0 : H - bandH;
        textBlock(title, channel?.fonts?.english, 86, W / 2, y0 + (titleTa ? 80 : bandH / 2), W - 80);
        textBlock(titleTa, channel?.fonts?.tamil, 62, W / 2, y0 + 165, W - 80);
      }
      if (tpl.showLogo && logo) {
        try { const li = await loadImg(logo.url); if (!cancelled) ctx.drawImage(li, W - 170, layout === 'title-top' ? H - 170 : 24, 146, 146); } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
  }, [src, frac, title, titleTa, sources, channel, tpl, logo]);

  return (
    <div className="card">
      <h3>🖼️ Thumbnail</h3>
      <canvas ref={canvas} width="1280" height="720" className="thumb-canvas" />
      <div className="grid2">
        <Field label="Background"><select value={src} onChange={(e) => setSrc(e.target.value)}>{sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></Field>
        {sources.find((s) => s.id === src)?.video && <Field label="Frame position"><input type="range" min="0.02" max="0.98" step="0.02" value={frac} onChange={(e) => setFrac(Number(e.target.value))} /></Field>}
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Tamil title"><input className="ta" value={titleTa} onChange={(e) => setTitleTa(e.target.value)} /></Field>
      </div>
      <div className="row">
        <button className="btn primary" onClick={() => act(async () => setEpisode(await api.post(`/api/episodes/${episode.id}/thumbnail`, { dataUrl: canvas.current.toDataURL('image/png') })), 'Thumbnail saved (1280×720 PNG)')}>Save thumbnail</button>
        {episode.thumbnail_url && <a className="btn ghost" href={episode.thumbnail_url} download>⬇ Saved thumbnail</a>}
      </div>
      <p className="muted small">Uses the channel thumbnail template (Channel Identity). Saved as 1280×720 PNG for YouTube.</p>
    </div>
  );
}

// ---------------- YouTube metadata ----------------
function YouTubeMeta({ episode, act, setEpisode }) {
  const { toast } = useStudio();
  const save = (patch) => act(async () => setEpisode(await api.put(`/api/episodes/${episode.id}`, patch)), 'Saved');
  const copy = (txt) => navigator.clipboard?.writeText(txt).then(() => toast('Copied'), () => toast('Copy failed — select and copy manually', 'error'));
  const doneExport = episode.jobs.find((j) => j.status === 'done');
  return (
    <div className="card">
      <h3>▶️ YouTube upload pack</h3>
      <Field label={`Title (${episode.youtube_title.length}/100)`}>
        <EditField value={episode.youtube_title} onSave={(youtube_title) => save({ youtube_title })} maxLength={100} />
      </Field>
      <button className="btn ghost small" onClick={() => copy(episode.youtube_title)}>Copy title</button>
      <Field label={`Description (${episode.youtube_description.length}/5000)`}>
        <EditField multiline value={episode.youtube_description} onSave={(youtube_description) => save({ youtube_description })} rows={8} maxLength={5000} />
      </Field>
      <button className="btn ghost small" onClick={() => copy(episode.youtube_description)}>Copy description</button>
      <h4>Manual upload checklist</h4>
      <ul className="steps">
        <li className={doneExport ? 'done' : ''}>{doneExport ? '✔' : '○'} MP4 exported {doneExport && <a href={doneExport.output.mp4} download>download</a>}</li>
        <li className={episode.captions.length ? 'done' : ''}>{episode.captions.length ? '✔' : '○'} Captions (.srt) <a href={`/api/episodes/${episode.id}/captions.srt`} download>download</a></li>
        <li className={episode.thumbnail_url ? 'done' : ''}>{episode.thumbnail_url ? '✔' : '○'} Thumbnail saved</li>
        <li>○ In YouTube Studio set “Made for kids: Yes”, paste title/description, upload SRT under Subtitles.</li>
      </ul>
    </div>
  );
}
