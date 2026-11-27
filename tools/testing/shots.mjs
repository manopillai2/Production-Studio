// Screenshot the Stage 5 preview at the middle of every shot, via headless Chrome + CDP (no deps).
// usage: node shots.mjs <episodeId> <outDir> [fractions e.g. 0.5 or 0.15,0.85]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [ep = '15', out = 'shots', fr = '0.5'] = process.argv.slice(2);
const fracs = fr.split(',').map(Number);
fs.mkdirSync(out, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333 + Math.floor(Math.random() * 500);
const prof = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), `chrome-prof-${port}`);
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1600,1200',
  ...(process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']), '--autoplay-policy=no-user-gesture-required', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) { await sleep(500); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const errs=[]; globalThis.__errs=errs; ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method==='Runtime.exceptionThrown') errs.push(m.params.exceptionDetails?.exception?.description?.slice(0,400)); if (m.method==='Runtime.consoleAPICalled' && ['error','warn'].includes(m.params.type)) errs.push(m.params.args.map(a=>a.value||a.description).join(' ').slice(0,400)); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1200, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://localhost:5175/#/project/${ep}/export` });
  for (let i = 0; i < 60; i++) { await sleep(500); if (await evalJs(`!![...document.querySelectorAll('button')].find(b=>b.textContent.includes('Generate Preview'))`)) break; }
  await evalJs(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Generate Preview')).click(), 1`);
  for (let i = 0; i < 400; i++) { await sleep(500); if (await evalJs(`!!window.__sceneEngine && !document.querySelector('.scene-overlay')`)) break; }
  await sleep(800);
  const times = await evalJs(`window.__sceneEngine.times.map(x=>({start:x.start,end:x.end,title:x.shot.title}))`);
  const warnings = await evalJs(`[...document.querySelectorAll('.scene-player ul.warn li')].map(x=>x.textContent)`);
  fs.writeFileSync(path.join(out, 'times.json'), JSON.stringify({ times, warnings }, null, 1));
  const rect = await evalJs(`(()=>{const r=document.querySelector('.scene-canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);
  const extra = process.env.TIMES ? process.env.TIMES.split(',').map(Number) : [];
  for (const t of extra) { await evalJs(`(()=>{ window.__scenePlayer.seek(${t}); return 1})()`); await sleep(150); const sh = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85, clip: { ...rect, scale: 1 } }); fs.writeFileSync(path.join(out, `t${String(t).replace('.','_')}.jpg`), Buffer.from(sh.data, 'base64')); }
  const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
  for (let k = 0; k < times.length; k++) {
    if (only && !only.includes(k)) continue;
    for (const f of fracs) {
      const t = times[k].start + (times[k].end - times[k].start) * f;
      await evalJs(`(()=>{ if (window.__scenePlayer) window.__scenePlayer.seek(${t}); else window.__sceneEngine.renderAt(${t}); return 1})()`); await sleep(120);
      // set caption by seeking the player slider? the overlay caption follows React state; render twice to be safe
      const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85, clip: { ...rect, scale: 1 } });
      fs.writeFileSync(path.join(out, `s${String(k + 1).padStart(2, '0')}-${Math.round(f * 100)}.jpg`), Buffer.from(shot.data, 'base64'));
    }
  }
  console.log(JSON.stringify({ shots: times.length, rect, warnings })); if (globalThis.__errs.length) console.log('ERRORS:\n' + [...new Set(globalThis.__errs)].join('\n'));
} catch (e) { console.error('FAILED', e.message); process.exitCode = 1; }
finally { try { ws?.close(); } catch {} proc.kill(); await sleep(500); try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} }
