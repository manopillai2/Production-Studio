// Export the MP4 from Stage 5 in headless Chrome (GPU), and keep the page open until the export job is done.
// usage: GPU=1 node export.mjs <episodeId> <outDir> [720p|1080p]
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
  const res = process.argv[4] || '1080p';
  const doctor = await evalJs(`[...document.querySelectorAll('.doctor-list li')].map(x=>x.textContent)`);
  console.log('Shot Doctor:', doctor.length ? doctor.join(' | ') : 'no problems');
  await evalJs(`[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('${res}')).click(), 1`); await sleep(300);
  await evalJs(`[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Export MP4')).click(), 1`);
  const t0 = Date.now(); let last = '';
  for (;;) {
    await sleep(5000);
    const st = await evalJs(`(()=>{ const b=[...document.querySelectorAll('button')].find(b=>/Export MP4|Exporting/.test(b.textContent)); const p=document.querySelector('progress'); return { busy: /Exporting/.test(b?.textContent||''), done: p?.value, total: p?.max, phase: p?.previousElementSibling?.textContent || '' }; })()`);
    const line = `${Math.round((Date.now() - t0) / 1000)}s ${st.phase}`; if (line.split(' ').slice(1).join(' ') !== last) { console.log(line); last = line.split(' ').slice(1).join(' '); }
    if (!st.busy) break;
  }
  const err = await evalJs(`[...document.querySelectorAll('.error-text')].map(x=>x.textContent).join(' | ')`);
  console.log('finished in', Math.round((Date.now() - t0) / 1000), 's', err ? 'ERRORS: ' + err : '');
  if (globalThis.__errs.length) console.log('PAGE ERRORS:\n' + [...new Set(globalThis.__errs)].join('\n'));
} catch (e) { console.error('FAILED', e.message); process.exitCode = 1; }
finally { try { ws?.close(); } catch {} proc.kill(); await sleep(500); try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} }
