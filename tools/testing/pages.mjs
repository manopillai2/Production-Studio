// Full-page screenshots of app routes via headless Chrome + CDP. usage: node pages.mjs outDir route1 route2 ...
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [out, ...routes] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9900 + Math.floor(Math.random() * 500);
const prof = path.join(path.resolve(out), `..`, `chrome-prof-${port}`);
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) { await sleep(500); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {} }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const logs = [];
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') logs.push(m.params.exceptionDetails?.exception?.description?.slice(0, 300)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(m.params.args.map((a) => a.value || a.description).join(' ').slice(0, 300)); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  for (const r of routes) {
    const [route, clickText] = r.split('@');
    await send('Page.navigate', { url: `http://localhost:5175/#/${route}` });
    await sleep(Number(process.env.WAIT || 3500));
    if (clickText) { await evalJs(`(()=>{const b=[...document.querySelectorAll('button'),...document.querySelectorAll('a,summary')].find(b=>b.textContent.includes(${JSON.stringify(clickText)})); b&&b.click(); return !!b})()`); for (let i=0;i<150;i++){ await sleep(500); if (await evalJs(`!document.querySelector('.scene-overlay') && !!document.querySelector('.doctor')`)) break; } await sleep(2500); }
    const h = await evalJs(`Math.min(6000, Math.max(document.documentElement.scrollHeight, ...[...document.querySelectorAll('main,.main,.content')].map(e=>e.scrollHeight)))`);
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: Math.max(H, h), deviceScaleFactor: 1, mobile: false });
    await sleep(700);
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80, captureBeyondViewport: true });
    const name = r.replace(/[^\w]+/g, '_');
    fs.writeFileSync(path.join(out, `${name}.jpg`), Buffer.from(shot.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    console.log(name, h);
  }
  if (logs.length) console.log('CONSOLE ERRORS:\n' + [...new Set(logs)].join('\n'));
} catch (e) { console.error('FAILED', e.message); process.exitCode = 1; }
finally { try { ws?.close(); } catch {} proc.kill(); await sleep(500); try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} }
