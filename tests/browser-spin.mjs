import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
const directory = await mkdtemp(join(tmpdir(), 'crokinole-spin-'));
const port = await freePort(), debugPort = await freePort();
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
let browser, socket;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await sleep(100); }
  browser = spawn(process.env.CHROME_BIN || 'google-chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${directory}/profile`, `http://127.0.0.1:${port}/`], { stdio: 'ignore' });
  let page;
  for (let i = 0; i < 100; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find(p => p.type === 'page' && p.url.includes(String(port))); if (page) break; } catch {}
    await sleep(100);
  }
  assert.ok(page, 'Chrome opened the app');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let requestId = 0; const pending = new Map(), exceptions = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  };
  async function call(method, params = {}) {
    const id = ++requestId;
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15000);
      pending.set(id, message => { clearTimeout(timer); resolve(message); });
      socket.send(JSON.stringify({ id, method, params }));
    });
    if (response.error) throw new Error(response.error.message);
    return response.result;
  }
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description);
    return result.result.value;
  }
  async function until(expression) {
    for (let i = 0; i < 120; i++) { try { if (await evaluate(expression)) return; } catch { /* A reload replaces the context. */ } await sleep(100); }
    throw new Error(`Condition not met: ${expression}`);
  }
  const state = () => evaluate('JSON.parse(localStorage.getItem("crokinole-match-spin-v2"))');
  await call('Page.enable'); await call('Runtime.enable');
  await until('!!document.getElementById("shot-clock")');
  async function reload() {
    await evaluate('window.__oldDocument=true'); await call('Page.reload', { ignoreCache: true });
    await until('!window.__oldDocument && !!document.getElementById("shot-clock")');
  }
  async function reset(view) {
    const { identifier } = await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.removeItem('crokinole-match-spin-v2'); localStorage.removeItem('crokinole-match'); localStorage.setItem('crokinole-clock','0'); localStorage.setItem('crokinole-table',JSON.stringify({view:${JSON.stringify(view)},zoom:1.2,muted:true,activeDiscHighlight:false}))` });
    try { await reload(); } finally { await call('Page.removeScriptToEvaluateOnNewDocument', { identifier }); }
    // A hidden independent scene supplies the exact production ray mapping;
    // no test/debug hooks are exposed by the actual game.
    await evaluate(`(async () => {
      const { createScene } = await import('/src/render/scene.ts');
      const rect = document.getElementById('board-canvas').getBoundingClientRect();
      const canvas = document.createElement('canvas');
      Object.assign(canvas.style,{position:'fixed',left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px',visibility:'hidden',pointerEvents:'none'});
      document.body.append(canvas); window.__calibration = createScene(canvas);
      window.__calibration.setView(${JSON.stringify(view)}); window.__calibration.setZoom(1.2);
      window.__calibrationCanvas = canvas;
    })()`);
    await until('!window.__calibration.isViewMoving() && !document.getElementById("view-center").disabled');
    await sleep(900); // The actual turn's gesture-readiness delay also has to expire.
  }
  async function project(points) {
    const screen = await evaluate(`(() => {
      const s=window.__calibration, r=window.__calibrationCanvas.getBoundingClientRect();
      return ${JSON.stringify(points)}.map(target => {
        let x=r.x+r.width/2,y=r.y+r.height/2;
        for(let i=0;i<12;i++) {
          const p=s.boardPoint(x,y), px=s.boardPoint(x+1,y), py=s.boardPoint(x,y+1);
          const a=px.x-p.x,b=py.x-p.x,c=px.y-p.y,d=py.y-p.y,det=a*d-b*c;
          const ex=target.x-p.x,ey=target.y-p.y;
          x+=(ex*d-b*ey)/det; y+=(a*ey-ex*c)/det;
        }
        return {x,y};
      });
    })()`);
    await evaluate('window.__calibration.dispose(); window.__calibrationCanvas.remove()');
    return screen;
  }
  async function flick(offset, touch, view = 'standing') {
    await reset(view);
    const positions = await project([12.8, 12.3, 11.7, 11.1, 10.5].map(y => ({ x: offset, y })));
    const rect = await evaluate('document.getElementById("board-canvas").getBoundingClientRect().toJSON()');
    for (const p of positions) assert.ok(p.x >= rect.x && p.x <= rect.right && p.y >= rect.y && p.y <= rect.bottom, 'Swipe stays on the visible canvas');
    await evaluate(`window.__gestureEvents=[]; document.getElementById('board-canvas').addEventListener('pointerdown',e=>window.__gestureEvents.push({type:e.type,t:performance.now(),x:e.clientX,y:e.clientY}),true); document.getElementById('board-canvas').addEventListener('pointermove',e=>window.__gestureEvents.push({type:e.type,t:performance.now(),x:e.clientX,y:e.clientY,classes:e.target.className}),false); document.getElementById('board-canvas').addEventListener('pointerup',e=>window.__gestureEvents.push({type:e.type,t:performance.now(),x:e.clientX,y:e.clientY}),true)`);
    // Defer animation frames during the native swipe only. Software WebGL can
    // spend >120ms painting and coalesce touch moves beyond the velocity window.
    // Input handlers stay untouched; actual rendering runs before and after,
    // and the resumed simulation still has to settle normally below.
    await evaluate('window.__nativeRAF=window.requestAnimationFrame; window.__frameCallbacks=[]; window.requestAnimationFrame=callback => (window.__frameCallbacks.push(callback),0)');
    await until('window.__frameCallbacks.length >= 2'); // Both scene-render and game-state loops are parked.
    const inputs = [];
    if (touch) {
      inputs.push(call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...positions[0], id: 1 }] }));
      for (const p of positions.slice(1)) { await sleep(20); inputs.push(call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, id: 1 }] })); }
      inputs.push(call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }));
    } else {
      inputs.push(call('Input.dispatchMouseEvent', { type: 'mousePressed', ...positions[0], button: 'left', buttons: 1, clickCount: 1 }));
      for (const p of positions.slice(1)) { await sleep(20); inputs.push(call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p, button: 'left', buttons: 1 })); }
      inputs.push(call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...positions.at(-1), button: 'left', buttons: 0, clickCount: 1 }));
    }
    await Promise.all(inputs);
    await until('window.__gestureEvents.some(e => e.type === "pointerup")');
    await evaluate('document.getElementById("pause-button").click(); window.requestAnimationFrame=window.__nativeRAF; for(const callback of window.__frameCallbacks) window.requestAnimationFrame(callback); delete window.__nativeRAF; delete window.__frameCallbacks');
    const s = await state();
    if (s.phase !== 'moving') {
      console.log('Gesture diagnostics', JSON.stringify({ offset, touch, view, positions, rect, state: s, events: await evaluate('window.__gestureEvents'), prefs: await evaluate('localStorage.getItem("crokinole-table")'), banner: await evaluate('document.getElementById("turn-banner").textContent') }));
      await evaluate('document.getElementById("pause-dialog").close()');
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(process.env.TMPDIR || tmpdir(), 'crokinole-gesture-debug.png'), Buffer.from(shot.data, 'base64'));
    }
    assert.equal(s.version, 2); assert.equal(s.phase, 'moving'); assert.equal(s.used[0], 1);
    assert.equal(s.paused, true); assert.ok(Math.abs(s.discs[0].vx) < 0.001, 'Offset contact does not introduce fake sideways launch');
    if (Math.abs(offset) <= 0.15) assert.equal(s.discs[0].spin, 0, 'Neutral zone protects centered/small-error flicks');
    else assert.ok(s.discs[0].spin * offset < -0.1, 'Deliberate left/right contact produces the correct signed spin');
    return s;
  }
  const legacy = await state(); legacy.version = 1;
  legacy.discs = legacy.discs.map(({ spin, angle, ...d }) => d);
  const legacyRaw = JSON.stringify(legacy);
  const migration = await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.removeItem('crokinole-match-spin-v2'); localStorage.setItem('crokinole-match',${JSON.stringify(legacyRaw)})` });
  try { await reload(); } finally { await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: migration.identifier }); }
  assert.equal((await state()).version, 2, 'Old table migrates to the spin save schema');
  assert.equal((await state()).discs[0].spin, 0);
  assert.equal(await evaluate('localStorage.getItem("crokinole-match")'), legacyRaw, 'Stable-version table remains byte-for-byte intact for rollback');
  await reload();
  assert.equal(await evaluate('localStorage.getItem("crokinole-match")'), legacyRaw, 'Subsequent spin saves do not overwrite the stable table');
  console.log('Migration: legacy table copied to version 2; original save preserved for rollback.');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await flick(0, false);
  await flick(0.3, false); // Moderate contact must work, not just near-rim swipes.
  const left = await flick(-0.45, false), right = await flick(0.45, false);
  assert.ok(left.discs[0].spin > 0 && right.discs[0].spin < 0);
  console.log('Desktop: actual centered and mirrored offset mouse flicks passed.');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await flick(0.12, true);
  await flick(0.3, true, 'seated');
  const mobile = await flick(0.45, true, 'seated');
  await sleep(250); assert.deepEqual((await state()).discs, mobile.discs, 'Pause freezes axial motion');
  await reload(); assert.deepEqual((await state()).discs, mobile.discs, 'Paused spin survives an actual reload exactly');
  if (process.env.SCREENSHOT_DIR) {
    await evaluate('document.getElementById("resume-game").click()');
    const shot = await call('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(process.env.SCREENSHOT_DIR, 'crokinole-spin-mobile.png'), Buffer.from(shot.data, 'base64'));
  } else await evaluate('document.getElementById("resume-game").click()');
  await until('document.getElementById("board-mode").textContent !== "Shot in motion"');
  await evaluate('document.getElementById("pause-button").click()');
  const settled = await state();
  assert.equal(settled.discs[0].spin, 0, 'Angular motion settles before handover');
  assert.equal((await evaluate('document.querySelectorAll("#board-canvas").length')), 1);
  assert.deepEqual(exceptions, [], 'No uncaught runtime errors');
  console.log('Mobile: neutral touch zone, deliberate seated-view spin, pause/reload, and resumed settlement passed; no runtime errors.');
} finally {
  socket?.close(); browser?.kill('SIGTERM'); server.kill('SIGTERM');
  await sleep(300); await rm(directory, { recursive: true, force: true });
}
