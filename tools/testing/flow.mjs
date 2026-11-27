// Drive the app in headless Chrome: node flow.mjs <outDir> <route> <step> <step> ...
// step: "click:Text" | "wait:ms" | "built" (wait for preview + doctor) | "shot:name" (full-page screenshot) | "eval:js" (print result)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [out, route, ...steps] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const W = 1440, H = 900;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 10500 + Math.floor(Math.random() * 500);
const prof = path.join(path.resolve(out), '..', `chrome-prof-${port}`);
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`, ...(process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--mute-audio', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; let id = 0; const pending = new Map(); const logs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) { await sleep(500); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') logs.push(m.params.exceptionDetails?.exception?.description?.slice(0, 400)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(m.params.args.map((a) => a.value || a.description).join(' ').slice(0, 400)); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://localhost:5175/#/${route}` });
  await sleep(3500);
  for (const st of steps) {
    const [kind, ...rest] = st.split(':'); const arg = rest.join(':');
    if (kind === 'click') { const ok = await evalJs(`(()=>{const b=[...document.querySelectorAll('button'),...document.querySelectorAll('a,summary,label')].find(b=>b.textContent.includes(${JSON.stringify(arg)})); b&&b.click(); return !!b})()`); console.log('click', arg, ok); await sleep(800); }
    else if (kind === 'wait') await sleep(Number(arg));
    else if (kind === 'built') { for (let i = 0; i < 200; i++) { await sleep(500); if (await evalJs(`!document.querySelector('.scene-overlay') && !!window.__sceneEngine && !!document.querySelector('.doctor .section-head')`)) break; } await sleep(2000); console.log('built'); }
    else if (kind === 'save') { const i = arg.indexOf('|'); const file = arg.slice(0, i); const v = await evalJs(arg.slice(i + 1)); const m = String(v).match(new RegExp("^data:image/[a-z]+;base64,(.*)$")); fs.writeFileSync(path.join(out, file), m ? Buffer.from(m[1], 'base64') : JSON.stringify(v)); console.log('saved', file); }
    else if (kind === 'eval') console.log('eval:', JSON.stringify(await evalJs(arg)).slice(0, 3000));
    else if (kind === 'vshot') { const s2 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }); fs.writeFileSync(path.join(out, arg + '.jpg'), Buffer.from(s2.data, 'base64')); console.log('vshot', arg); }
    else if (kind === 'scroll') { await evalJs(`(()=>{const el=[...document.querySelectorAll('h3,h4,b,summary,button')].find(e=>e.textContent.includes(${JSON.stringify(arg)})); el&&el.scrollIntoView({block:'start'}); window.scrollBy(0,-70); return !!el})()`); await sleep(600); }
    else if (kind === 'shot') {
      const h = await evalJs(`Math.min(7000, document.documentElement.scrollHeight)`);
      await send('Emulation.setDeviceMetricsOverride', { width: W, height: Math.max(H, h), deviceScaleFactor: 1, mobile: false }); await sleep(600);
      const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80, captureBeyondViewport: true });
      fs.writeFileSync(path.join(out, `${arg}.jpg`), Buffer.from(s.data, 'base64'));
      await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
      console.log('shot', arg);
    }
  }
  if (logs.length) console.log('CONSOLE ERRORS:\n' + [...new Set(logs)].join('\n'));
} catch (e) { console.error('FAILED', e.message); process.exitCode = 1; }
finally { try { ws?.close(); } catch {} proc.kill(); await sleep(500); try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} }
