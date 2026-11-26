import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStudio, useAction, Field, ImportButton, MediaPreview, Confirm } from '../ui.jsx';

const TAMIL_FONTS = ['Baloo Thambi 2', 'Noto Sans Tamil', 'Mukta Malar', 'Nirmala UI', 'Latha'];
const EN_FONTS = ['Fredoka', 'Baloo Thambi 2', 'Comic Sans MS', 'Segoe UI', 'Arial Rounded MT Bold'];

export function CaptionSample({ style, fonts, text = 'குதி குதி குட்டி முயலே!\nHop, hop, little bunny, hop!' }) {
  const s = style || {};
  return (
    <div className={`caption-sample pos-${s.position || 'bottom'}`}>
      <span style={{
        fontFamily: `'${fonts?.tamil}', '${fonts?.english}', sans-serif`,
        fontSize: `${(s.fontSize || 54) / 3}px`, color: s.color,
        WebkitTextStroke: `${(s.outlineWidth ?? 4) / 4}px ${s.outline}`, paintOrder: 'stroke fill',
        background: s.background ? 'rgba(0,0,0,.5)' : 'none',
      }}>{text}</span>
    </div>
  );
}

export default function Channel() {
  const { channel, refreshChannel, episode, setEpisode } = useStudio();
  const [c, setC] = useState(channel);
  const [act, busy] = useAction();
  useEffect(() => setC(channel), [channel]);
  if (!c) return <div className="muted">Loading…</div>;

  const dirty = JSON.stringify({ ...c, assets: 0 }) !== JSON.stringify({ ...channel, assets: 0 });
  const set = (path, v) => {
    const [a, b] = path.split('.');
    setC(b ? { ...c, [a]: { ...c[a], [b]: v } } : { ...c, [a]: v });
  };
  const save = () => act(async () => { await api.put('/api/channel', c); await refreshChannel(); }, 'Channel identity saved — new episodes will use these defaults');
  const upload = (category) => (files) => act(async () => { await api.upload('/api/channel/assets', files, { category }); await refreshChannel(); }, 'Imported');
  const logo = c.assets?.find((a) => a.id === c.logo_asset_id);
  const sounds = c.assets?.filter((a) => (c.signature_sound_ids || []).includes(a.id)) || [];

  return (
    <div className="stack">
      <div className="sticky-actions">
        {dirty ? <span className="warn">Unsaved changes</span> : <span className="muted">All changes saved</span>}
        <button className="btn primary" disabled={!dirty || busy} onClick={save}>Save channel identity</button>
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Channel</h3>
          <Field label="Channel name"><input value={c.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Tagline"><input value={c.tagline} onChange={(e) => set('tagline', e.target.value)} /></Field>
          <h4>Logo</h4>
          <div className="row">
            {logo ? <img src={logo.url} alt="logo" className="logo-preview" /> : <div className="media-empty">No logo</div>}
            <ImportButton label="Import logo" accept="image/*" multiple={false} onFiles={upload('logo')} />
          </div>
          <h4>Brand colors</h4>
          <div className="swatches">
            {Object.entries(c.colors).map(([k, v]) => (
              <label key={k} className="swatch"><input type="color" value={v} onChange={(e) => set(`colors.${k}`, e.target.value)} /><span>{k}</span></label>
            ))}
          </div>
          <h4>Fonts</h4>
          <div className="grid2">
            <Field label="Tamil font">
              <input list="ta-fonts" value={c.fonts.tamil} onChange={(e) => set('fonts.tamil', e.target.value)} />
              <datalist id="ta-fonts">{TAMIL_FONTS.map((f) => <option key={f} value={f} />)}</datalist>
            </Field>
            <Field label="English font">
              <input list="en-fonts" value={c.fonts.english} onChange={(e) => set('fonts.english', e.target.value)} />
              <datalist id="en-fonts">{EN_FONTS.map((f) => <option key={f} value={f} />)}</datalist>
            </Field>
          </div>
          <div className="font-preview">
            <span style={{ fontFamily: `'${c.fonts.tamil}'` }}>குட்டி முயல் பாடல்</span>
            <span style={{ fontFamily: `'${c.fonts.english}'` }}>Little Bunny Song</span>
          </div>
        </div>

        <div className="card">
          <h3>Caption style</h3>
          <div className="grid2">
            <Field label="Size (px at 1080p)"><input type="number" value={c.caption_style.fontSize} onChange={(e) => set('caption_style.fontSize', Number(e.target.value))} /></Field>
            <Field label="Position">
              <select value={c.caption_style.position} onChange={(e) => set('caption_style.position', e.target.value)}>
                <option value="bottom">Bottom</option><option value="middle">Middle</option><option value="top">Top</option>
              </select>
            </Field>
            <Field label="Text color"><input type="color" value={c.caption_style.color} onChange={(e) => set('caption_style.color', e.target.value)} /></Field>
            <Field label="Outline color"><input type="color" value={c.caption_style.outline} onChange={(e) => set('caption_style.outline', e.target.value)} /></Field>
            <Field label="Outline width"><input type="number" value={c.caption_style.outlineWidth} onChange={(e) => set('caption_style.outlineWidth', Number(e.target.value))} /></Field>
            <label className="check"><input type="checkbox" checked={!!c.caption_style.background} onChange={(e) => set('caption_style.background', e.target.checked)} /> Dark box behind text</label>
          </div>
          <div className="caption-stage"><CaptionSample style={c.caption_style} fonts={c.fonts} /></div>
          {episode && (
            <Confirm className="btn small" text={`Replace #${episode.number}'s caption style with the channel default?`}
              onYes={() => act(async () => setEpisode(await api.put(`/api/episodes/${episode.id}`, { caption_style: c.caption_style })), 'Applied to episode')}>
              Apply caption style to #{episode.number} {episode.title}…
            </Confirm>
          )}

          <h3>Thumbnail template</h3>
          <div className="grid2">
            <Field label="Layout">
              <select value={c.thumbnail_template.layout} onChange={(e) => set('thumbnail_template.layout', e.target.value)}>
                <option value="title-bottom">Title band at bottom</option><option value="title-top">Title band at top</option><option value="title-left">Title on the left</option>
              </select>
            </Field>
            <Field label="Band color"><input type="color" value={c.thumbnail_template.band} onChange={(e) => set('thumbnail_template.band', e.target.value)} /></Field>
            <Field label="Title color"><input type="color" value={c.thumbnail_template.titleColor} onChange={(e) => set('thumbnail_template.titleColor', e.target.value)} /></Field>
            <Field label="Title outline"><input type="color" value={c.thumbnail_template.stroke} onChange={(e) => set('thumbnail_template.stroke', e.target.value)} /></Field>
            <label className="check"><input type="checkbox" checked={c.thumbnail_template.showLogo} onChange={(e) => set('thumbnail_template.showLogo', e.target.checked)} /> Show logo</label>
          </div>

          <h3>World Style</h3>
          <p className="small muted">Your world's visual rules now live in one place: <a href="#/world">My World → World Style</a>.</p>

          <h3>YouTube description template</h3>
          <Field label="Used for new episodes. {title} is replaced with the episode title.">
            <textarea rows={4} value={c.description_template} onChange={(e) => set('description_template', e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="card">
        <div className="section-head"><h3>Signature sounds</h3><ImportButton label="Import sound" accept="audio/*" onFiles={upload('sound')} /></div>
        <div className="media-grid">{sounds.map((a) => <MediaPreview key={a.id} asset={a} />)}</div>
        {!sounds.length && <p className="muted">Intro jingles, "boing" effects, outro stingers…</p>}
      </div>
    </div>
  );
}
