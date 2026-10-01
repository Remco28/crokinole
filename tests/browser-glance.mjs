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
  async function call(method, params = {}, timeoutMs = 15000) {
    const id = ++requestId;
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, timeoutMs);
      pending.set(id, message => { clearTimeout(timer); resolve(message); });
      socket.send(JSON.stringify({ id, method, params }));
    });
    if (response.error) throw new Error(response.error.message);
    return response.result;
  }
  async function evaluate(expression, timeoutMs = 15000) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description);
    return result.result.value;
  }
  async function until(expression) {
    const deadline = Date.now() + 12000;
    let lastError;
    while (Date.now() < deadline) {
      try { if (await evaluate(expression, Math.max(1, deadline - Date.now()))) return; }
      catch (error) { lastError = error; /* A reload replaces the context. */ }
      await sleep(100);
    }
    throw new Error(`Condition not met: ${expression}${lastError ? '; ' + lastError.message : ''}`);
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
      document.body.append(canvas);
      const sceneSource = await (await fetch('/src/render/scene.ts')).text();
      const threePath = sceneSource.match(/from ["']([^"']*three[^"']*)["']/)?.[1];
      if (!threePath) throw new Error('Cannot locate the scene renderer dependency');
      const THREE = await import(threePath);
      window.__three = THREE;
      const lookAt = THREE.Object3D.prototype.lookAt;
      THREE.Object3D.prototype.lookAt = function(...args) {
        if (this.isPerspectiveCamera) window.__calibrationCamera = this;
        return lookAt.apply(this,args);
      };
      try { window.__calibration = createScene(canvas); }
      finally { THREE.Object3D.prototype.lookAt = lookAt; }
      window.__discHeight = (await import('/src/sim/constants.ts')).DISC.height;
      window.__calibration.setView(${JSON.stringify(view)}); window.__calibration.setZoom(1.2);
      window.__calibrationCanvas = canvas;
    })()`);
    await until('!window.__calibration.isViewMoving() && !document.getElementById("view-center").disabled');
    await sleep(900); // The actual turn's gesture-readiness delay also has to expire.
  }
  async function project(points) {
    const screen = await evaluate(`(() => {
      const s=window.__calibration, r=window.__calibrationCanvas.getBoundingClientRect();
      const camera=window.__calibrationCamera, THREE=window.__three;
      if (!camera) throw new Error('Calibration camera was not captured');
      return ${JSON.stringify(points)}.map(target => {
        // Independent projection of the visible top face, not inversion of picking.
        const ndc=new THREE.Vector3(target.x,window.__discHeight,target.y).project(camera);
        const x=r.x+(ndc.x+1)*r.width/2, y=r.y+(1-ndc.y)*r.height/2;
        const picked=s.boardPoint(x,y);
        if (Math.hypot(picked.x-target.x,picked.y-target.y)>0.0001)
          throw new Error('Visible disc surface does not match the flick picking plane');
        return {x,y};
      });
    })()`);
    await evaluate('window.__calibration.dispose(); window.__calibrationCanvas.remove()');
    return screen;
  }
  async function flick(offset, touch, view = 'standing', options = {}) {
    await reset(view);
    const points = options.points || [12.8, 12.3, 11.7, 11.1, 10.5].map(y => ({ x: offset, y }));
    const positions = await project(points);
    const rect = await evaluate('document.getElementById("board-canvas").getBoundingClientRect().toJSON()');
    for (const p of positions) assert.ok(p.x >= rect.x && p.x <= rect.right && p.y >= rect.y && p.y <= rect.bottom, 'Swipe stays on the visible canvas');
    await evaluate(`window.__gestureEvents=[]; for(const type of ['pointerdown','pointermove','pointerup','pointercancel']) document.getElementById('board-canvas').addEventListener(type,e=>window.__gestureEvents.push({type:e.type,t:e.timeStamp,x:e.clientX,y:e.clientY,id:e.pointerId,pointerType:e.pointerType,raw:(e.getCoalescedEvents?.()??[]).map(p=>({t:p.timeStamp,x:p.clientX,y:p.clientY}))}),true)`);
    // Native event timestamps carry the intended gesture time even if software
    // WebGL delays delivery. Rendering and game-state loops remain running.
    await evaluate(`window.__initialLaunch=null;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='crokinole-match-spin-v2'&&!window.__initialLaunch){const s=JSON.parse(v);if(s.phase==='moving')window.__initialLaunch=s;}return original.call(this,k,v);}`);
    const inputs = [], timestamp = Date.now() / 1000;
    let elapsed = 0;
    const delays = options.delays || positions.slice(1).map(() => 20);
    if (touch) {
      inputs.push(call('Input.dispatchTouchEvent', { type: 'touchStart', timestamp, touchPoints: [{ ...positions[0], id: 1 }] }));
      for (const [i, p] of positions.slice(1).entries()) {
        await sleep(delays[i]); elapsed += delays[i];
        if(options.injectStationary && p.x===positions[i].x && p.y===positions[i].y) {
          // Chromium/CDP suppresses unchanged-coordinate touch moves here.
          // Inject only this observed stop; the surrounding motion stays native.
          await until(`window.__gestureEvents.some(e=>e.type==='pointermove')`);
          await evaluate(`(()=>{const m=window.__gestureEvents.findLast(e=>e.type==='pointermove');const e=new PointerEvent('pointermove',{pointerId:m.id,pointerType:m.pointerType,clientX:m.x,clientY:m.y,buttons:1});Object.defineProperty(e,'timeStamp',{value:m.t+${delays[i]}});document.getElementById('board-canvas').dispatchEvent(e)})()`);
        } else inputs.push(call('Input.dispatchTouchEvent', { type: 'touchMove', timestamp: timestamp + elapsed / 1000, touchPoints: [{ ...p, id: 1 }] }));
      }
      inputs.push(call('Input.dispatchTouchEvent', { type: options.cancel ? 'touchCancel' : 'touchEnd', timestamp: timestamp + (elapsed + 5) / 1000, touchPoints: [] }));
    } else {
      inputs.push(call('Input.dispatchMouseEvent', { type: 'mousePressed', timestamp, ...positions[0], button: 'left', buttons: 1, clickCount: 1 }));
      for (const [i, p] of positions.slice(1).entries()) {
        await sleep(delays[i]); elapsed += delays[i];
        inputs.push(call('Input.dispatchMouseEvent', { type: 'mouseMoved', timestamp: timestamp + elapsed / 1000, ...p, button: 'left', buttons: 1 }));
      }
      inputs.push(call('Input.dispatchMouseEvent', { type: 'mouseReleased', timestamp: timestamp + (elapsed + 5) / 1000, ...positions.at(-1), button: 'left', buttons: 0, clickCount: 1 }));
    }
    await Promise.all(inputs);
    await until(`window.__gestureEvents.some(e => e.type === '${options.cancel ? 'pointercancel' : 'pointerup'}')`);
    if(options.injectStationary) {
      const moves=(await evaluate('window.__gestureEvents')).filter(e=>e.type==='pointermove').flatMap(e=>e.raw.length?e.raw:[e]);
      assert.ok(moves.some((e,i)=>i&&e.x===moves[i-1].x&&e.y===moves[i-1].y&&e.t>moves[i-1].t),'Controlled stationary movement with advancing time actually reached the handler');
    }
    await evaluate('document.getElementById("pause-button").click()');
    const s = await state();
    return {state:s,launch:await evaluate('window.__initialLaunch'),positions,events:await evaluate('window.__gestureEvents')};
  }
  const rows=[];
  for(const [touch,view,width,height,mobile] of [[false,'standing',1280,800,false],[true,'standing',1280,800,false],[true,'seated',390,844,true]]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
    await call('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:2});
    for(const offset of [-.99,-.9,0,.5,.9,.99,1.01]) {
      const result=await flick(offset*.625,touch,view);
      const disc=result.launch?.discs[0],heading=disc?Math.atan2(disc.vx,-disc.vy)*180/Math.PI:null;
      if(offset>1) assert.equal(disc,undefined,'Outside swipes remain misses');
      else {
        assert.ok(disc,'Eligible native stroke launched');
        if(offset===0) assert.ok(Math.abs(heading)<.01,'Centered heading is unchanged');
        if(Math.abs(offset)===.99) assert.ok(Math.abs(heading)>50,'Near-rim native strike veers sharply');
        if(Math.abs(offset)===.9) assert.ok(Math.abs(heading)>33,'Outer native contact gets stronger deflection');
        if(offset) assert.ok(disc.vx*offset<0,'Deflection mirrors away from finger');
        assert.ok(Math.abs(disc.spin)<=18);
      }
      rows.push({touch,view,offset,kind:'long',launched:!!disc,heading,speed:disc?Math.hypot(disc.vx,disc.vy):null,spin:disc?.spin});
    }
    for(const offset of [-.99,.99]) {
      const result=await flick(offset*.625,touch,view,{points:[12.15,12,11.85].map(y=>({x:offset*.625,y})),delays:[5,5]});
      const disc=result.launch?.discs[0];assert.ok(disc,'Short native edge clip launches');
      const heading=Math.atan2(disc.vx,-disc.vy)*180/Math.PI;
      assert.ok(Math.abs(heading)>50);assert.ok(disc.vx*offset<0);
      rows.push({touch,view,offset,kind:'short',launched:true,heading,speed:Math.hypot(disc.vx,disc.vy),spin:disc.spin});
    }
  }
  assert.equal(rows.length,27);assert.deepEqual(exceptions,[],'No runtime exceptions');
  console.log(JSON.stringify({count:rows.length,rows},null,2));
} finally {
  socket?.close(); browser?.kill('SIGTERM'); server.kill('SIGTERM');
  await sleep(300);await rm(directory,{recursive:true,force:true});
}
