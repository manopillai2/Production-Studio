// Editable procedural recipe: template parameters, part colours, and (for scenery) individual objects.
import { useEffect, useState } from 'react';

function ParamInput({ p, value, onChange }) {
  if (p.type === 'bool') return <label className="check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {p.label}</label>;
  if (p.type === 'select') return <label className="field"><span>{p.label}</span><select value={value} onChange={(e) => onChange(e.target.value)}>{p.options.map((o) => <option key={o}>{o}</option>)}</select></label>;
  return (
    <label className="field"><span>{p.label} <em className="mono muted">{Number(value).toFixed(p.step >= 1 ? 0 : 2)}</em></span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function TemplateFields({ tpl, recipe, onChange }) {
  if (!tpl) return null;
  return (
    <>
      <div className="param-grid">
        {tpl.params.map((p) => <ParamInput key={p.key} p={p} value={recipe.params?.[p.key] ?? p.default} onChange={(v) => onChange({ ...recipe, params: { ...recipe.params, [p.key]: v } })} />)}
      </div>
      <h4>Part colours</h4>
      <div className="swatches">
        {tpl.parts.map((pt) => (
          <label key={pt.key} className="swatch" title={pt.label}>
            <input type="color" value={recipe.parts?.[pt.key] || pt.default} onChange={(e) => onChange({ ...recipe, parts: { ...recipe.parts, [pt.key]: e.target.value } })} />
            <span>{pt.label}</span>
          </label>
        ))}
      </div>
    </>
  );
}

export default function RecipeEditor({ templates, recipe, onChange }) {
  const tpl = templates.find((t) => t.key === recipe?.template);
  const [objId, setObjId] = useState(null);
  useEffect(() => { if (recipe?.objects?.length && !recipe.objects.some((o) => o.id === objId)) setObjId(recipe.objects[0].id); }, [recipe, objId]);
  if (!recipe || !tpl) return <p className="muted">No recipe yet — pick a template.</p>;
  const objects = recipe.objects || [];
  const obj = objects.find((o) => o.id === objId);
  const setObj = (patch) => onChange({ ...recipe, objects: objects.map((o) => (o.id === objId ? { ...o, ...patch } : o)) });
  const objTpl = obj && templates.find((t) => t.key === obj.template);
  const sceneryTemplates = templates.filter((t) => ['tree', 'hill', 'cloud', 'sun', 'moon', 'star', 'bunny'].includes(t.key));

  return (
    <div className="recipe-editor">
      <TemplateFields tpl={tpl} recipe={recipe} onChange={onChange} />
      {tpl.scenery && (
        <div className="scenery-objects">
          <div className="section-head">
            <h4 style={{ margin: 0 }}>Objects in this scenery <span className="muted">· each one is edited on its own</span></h4>
            <select value="" onChange={(e) => {
              if (!e.target.value) return;
              const id = `obj${Date.now().toString(36)}`;
              onChange({ ...recipe, objects: [...objects, { id, name: templates.find((t) => t.key === e.target.value).label, template: e.target.value, params: {}, parts: {}, position: [0, e.target.value === 'cloud' || e.target.value === 'star' || e.target.value === 'sun' ? 4 : 0, -4], rotation_y: 0, scale: 1 }] });
              setObjId(id);
            }}>
              <option value="">+ Add object…</option>{sceneryTemplates.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className="obj-chips">
            {objects.map((o) => <button key={o.id} className={`chip ${o.id === objId ? 'on' : ''}`} onClick={() => setObjId(o.id)}>{o.name}</button>)}
          </div>
          {obj && objTpl && (
            <div className="obj-editor">
              <div className="row wrap">
                <input value={obj.name} onChange={(e) => setObj({ name: e.target.value })} />
                <span className="muted small">{objTpl.label}</span>
                <span className="grow" />
                <button className="btn ghost small" onClick={() => onChange({ ...recipe, objects: objects.filter((o) => o.id !== objId) })}>Remove object</button>
              </div>
              <div className="param-grid">
                {['X (left/right)', 'Y (height)', 'Z (depth)'].map((label, i) => (
                  <label key={label} className="field"><span>{label} <em className="mono muted">{obj.position[i].toFixed(1)}</em></span>
                    <input type="range" min={i === 1 ? -3 : -15} max={i === 1 ? 10 : 15} step="0.1" value={obj.position[i]} onChange={(e) => { const p = [...obj.position]; p[i] = Number(e.target.value); setObj({ position: p }); }} />
                  </label>
                ))}
                <label className="field"><span>Turn <em className="mono muted">{(obj.rotation_y * 57.3).toFixed(0)}°</em></span><input type="range" min={-3.14} max={3.14} step="0.05" value={obj.rotation_y} onChange={(e) => setObj({ rotation_y: Number(e.target.value) })} /></label>
                <label className="field"><span>Scale <em className="mono muted">{obj.scale.toFixed(2)}</em></span><input type="range" min="0.2" max="4" step="0.05" value={obj.scale} onChange={(e) => setObj({ scale: Number(e.target.value) })} /></label>
              </div>
              <TemplateFields tpl={objTpl} recipe={obj} onChange={(r) => setObj({ params: r.params, parts: r.parts })} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
