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
    // Capture production launch before friction can stop a weak skim. Each
    // flick reloads the document, so this observer cannot stack across shots.
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
      inputs.push(call('Input.dispatchTouchEvent', { type: options.cancel ? 'touchCancel' : 'touchEnd', timestamp: timestamp + (elapsed + (options.releaseDelay ?? 5)) / 1000, touchPoints: [] }));
    } else {
      inputs.push(call('Input.dispatchMouseEvent', { type: 'mousePressed', timestamp, ...positions[0], button: 'left', buttons: 1, clickCount: 1 }));
      for (const [i, p] of positions.slice(1).entries()) {
        await sleep(delays[i]); elapsed += delays[i];
        inputs.push(call('Input.dispatchMouseEvent', { type: 'mouseMoved', timestamp: timestamp + elapsed / 1000, ...p, button: 'left', buttons: 1 }));
      }
      inputs.push(call('Input.dispatchMouseEvent', { type: 'mouseReleased', timestamp: timestamp + (elapsed + (options.releaseDelay ?? 5)) / 1000, ...positions.at(-1), button: 'left', buttons: 0, clickCount: 1 }));
    }
    await Promise.all(inputs);
    await until(`window.__gestureEvents.some(e => e.type === '${options.cancel ? 'pointercancel' : 'pointerup'}')`);
    if(options.injectStationary) {
      const moves=(await evaluate('window.__gestureEvents')).filter(e=>e.type==='pointermove').flatMap(e=>e.raw.length?e.raw:[e]);
      assert.ok(moves.some((e,i)=>i&&e.x===moves[i-1].x&&e.y===moves[i-1].y&&e.t>moves[i-1].t),'Controlled stationary movement with advancing time actually reached the handler');
    }
    await evaluate('document.getElementById("pause-button").click()');
    const s = await state();
    if (options.miss || options.cancel) {
      assert.equal(s.phase, 'pass'); assert.equal(s.used[0], 0);
      assert.equal(s.discs[0].spin, 0, 'Misses and cancellations never launch');
      if(options.unchangedPlacement) {
        assert.ok(Math.hypot(s.discs[0].x,s.discs[0].y-12)<0.0001,'Held powered strokes do not accidentally relocate the staged disc');
      }
      return s;
    }
    if (s.phase !== 'moving') {
      console.log('Gesture diagnostics', JSON.stringify({ offset, touch, view, positions, rect, state: s, events: await evaluate('window.__gestureEvents'), prefs: await evaluate('localStorage.getItem("crokinole-table")'), banner: await evaluate('document.getElementById("turn-banner").textContent') }));
      await evaluate('document.getElementById("pause-dialog").close()');
      const shot = await call('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(process.env.TMPDIR || tmpdir(), 'crokinole-gesture-debug.png'), Buffer.from(shot.data, 'base64'));
    }
    assert.equal(s.version, 2); assert.equal(s.phase, 'moving'); assert.equal(s.used[0], 1);
    assert.equal(s.paused, true);
    const launch = await evaluate('window.__initialLaunch');
    assert.ok(launch, 'Eligible native stroke persisted its initial launch');
    const d = launch.discs[0];
    if (options.maxHeadingDegrees) {
      assert.ok(Math.abs(Math.atan2(d.vx,-d.vy)*180/Math.PI)<options.maxHeadingDegrees, 'Near-contact aim stays within its requested heading bound');
      assert.ok(Math.abs(d.spin)<=18);
    } else {
      if (Math.abs(offset)<=0.125) assert.ok(Math.abs(Math.atan2(d.vx,-d.vy)*180/Math.PI)<0.1, 'Small central positioning error preserves the incoming heading');
      else assert.ok(d.vx * offset < 0, 'Side impact deflects away from the finger');
      if (Math.abs(offset) <= 0.05) assert.equal(d.spin, 0, 'Only a small neutral spin zone remains');
      else assert.ok(d.spin * offset < -0.1, 'Deliberate left/right contact produces signed spin');
    }
    if (Math.abs(offset) >= 0.3) assert.ok(Math.atan2(Math.abs(d.vx), -d.vy) * 180 / Math.PI > 8, 'Moderate side contact visibly changes launch direction');
    return s;
  }
  async function checkPicking(view) {
    for (const angle of [-Math.PI/4,0,Math.PI/2,Math.PI]) {
      await reset(view);
      await evaluate(`window.__calibration.setYawTarget(${angle})`);
      await until('!window.__calibration.isViewMoving()');
      const points=[];
      for(const delta of [-0.6,0,0.6]) {
        const a=angle+delta, x=12*Math.sin(a), y=12*Math.cos(a);
        points.push({x,y},{x:x+0.5,y},{x:x-0.5,y},{x,y:y+0.5});
      }
      await project(points); // Projects the real top surface and checks default picking.
    }
  }
  async function checkAimForgiveness(touch, view) {
    const neutral=[];
    for(const offset of [-0.11,-0.05,0.05,0.11]) for(const dt of [5,50]) {
      const d=(await flick(offset,touch,view,{delays:[dt,dt,dt,dt],maxHeadingDegrees:0.1})).discs[0];
      neutral.push({offset,sampleMs:dt,heading:Math.atan2(d.vx,-d.vy)*180/Math.PI});
    }
    const ramp=[];
    for(const offset of [0.15,0.2,0.25,0.3]) {
      const d=(await flick(offset,touch,view,{maxHeadingDegrees:45})).discs[0];
      ramp.push(Math.atan2(-d.vx,-d.vy)*180/Math.PI);
    }
    for(let i=1;i<ramp.length;i++) assert.ok(ramp[i]>ramp[i-1],'Outside the central corridor, deliberate deflection increases smoothly');
    console.log('Central directional forgiveness',JSON.stringify({touch,view,neutral,ramp}));
  }
  async function checkShortGrazes(touch, view) {
    for (const offset of [-0.9,0.9]) {
      const x=offset*0.625;
      await flick(x,touch,view,{points:[12.15,12,11.85].map(y=>({x,y})),delays:[5,5]});
      await flick(x,touch,view,{points:[12.4,12.2,12,11.8].map(y=>({x,y})),delays:[20,20,20]});
      await flick(x,touch,view,{miss:true,points:[12.15,12,11.85].map(y=>({x,y})),delays:[50,50]});
      if(touch) await flick(x,touch,view,{cancel:true,points:[12.15,12,11.85].map(y=>({x,y})),delays:[5,5]});
    }
    await flick(0,touch,view,{miss:true,points:[{x:0,y:12.15},{x:0,y:12}],delays:[5]});
    await flick(0.64,touch,view,{miss:true,points:[12.15,12,11.85].map(y=>({x:0.64,y})),delays:[5,5]});
    await flick(0,touch,view,{miss:true,unchangedPlacement:true,points:[{x:0,y:12.2},{x:0,y:11.8}],delays:[10],releaseDelay:200});
    for(const offset of [-0.99,0.99]) {
      const x=offset*0.625;
      await flick(x,touch,view,{points:[12.15,11.85].map(y=>({x,y})),delays:[10]});
      for(const divisions of [1,5]) {
        const points=Array.from({length:2*divisions+1},(_,i)=>({x,y:12.15-0.3*i/(2*divisions)}));
        await flick(x,touch,view,{points,delays:Array(2*divisions).fill(5/divisions)});
      }
    }
    console.log('Short grazing contact: mirrored fast clips and sub-pixel-threshold powered shots launch; taps, slow brushes, outside misses and cancellations do not.',JSON.stringify({touch,view}));
  }
  function wobbleGesture(dx, dense=false) {
    const samples=[{x:0,y:12.6,t:0},{x:dx,y:12.59,t:5},{x:0,y:12.3,t:20},{x:0,y:11.7,t:40},{x:0,y:11.1,t:60},{x:0,y:10.5,t:80}];
    const path=[samples[0]];
    for(let i=1;i<samples.length;i++) {
      const a=samples[i-1],b=samples[i];
      if(!dense) { path.push(b); continue; }
      for(let t=a.t+1;t<=b.t;t++) {
        const f=(t-a.t)/(b.t-a.t); path.push({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,t});
      }
    }
    return {points:path.map(({x,y})=>({x,y})),delays:path.slice(1).map((s,i)=>s.t-path[i].t),...(dense?{maxHeadingDegrees:8}:{})};
  }
  async function checkWobbles(touch,view) {
    for(const dense of [false,true]) {
      const headings=[];
      for(const dx of [-0.05,0.05]) {
        const s=await flick(0,touch,view,wobbleGesture(dx,dense));
        headings.push(Math.atan2(s.discs[0].vx,-s.discs[0].vy)*180/Math.PI);
      }
      assert.ok(Math.abs(headings[0]+headings[1])<1,'Wobble response remains mirrored');
      console.log('Wobble regression',JSON.stringify({touch,view,dense,headings}));
    }
  }
  async function checkSpeedAim(touch,view) {
    const points=[{x:0,y:12.6},{x:0.06,y:12.59},{x:0.12,y:12.57},{x:0,y:12.4},{x:0,y:12.1},{x:0,y:11.5},{x:0,y:10.5}];
    const results=[];
    for(const dt of [5,20,25,40,50,80,100]) for(const mirror of [-1,1]) {
      const s=await flick(0,touch,view,{points:points.map(p=>({...p,x:p.x*mirror})),delays:points.slice(1).map(()=>dt),maxHeadingDegrees:2});
      const d=s.discs[0], heading=Math.atan2(d.vx,-d.vy)*180/Math.PI;
      assert.equal(d.spin,0,'Small setup irregularities do not become accidental spin');
      results.push({sampleMs:dt,mirror,heading,speed:Math.hypot(d.vx,d.vy)});
    }
    const hard=results.filter(r=>r.sampleMs===5),gentle=results.filter(r=>r.sampleMs===50);
    assert.ok(Math.min(...hard.map(r=>r.speed))>Math.max(...gentle.map(r=>r.speed))+10,'Different speed still gives different power');
    console.log('Speed/aim regression',JSON.stringify({touch,view,results}));
    for(const mirror of [-1,1]) {
      const dense=[{...points[0]}];
      for(let i=1;i<points.length;i++) for(let j=1;j<=5;j++) {
        const a=points[i-1],b=points[i],f=j/5;
        dense.push({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f});
      }
      const d=(await flick(0,touch,view,{points:dense.map(p=>({...p,x:p.x*mirror})),delays:dense.slice(1).map(()=>16),maxHeadingDegrees:2})).discs[0];
      assert.equal(d.spin,0,'Subdividing the same 480ms preparation does not create spin');
    }
    for(const offset of [-0.4,0.4]) await flick(offset,touch,view,{delays:[50,50,50,50]});
  }
  async function checkAuditInput(touch,view) {
    for(const mirror of [-1,1]) {
      const coarse={points:[{x:mirror*0.5,y:13.5},{x:0,y:12.8},{x:0,y:11.5}],delays:[20,40],maxHeadingDegrees:20};
      const dense={points:[...coarse.points.slice(0,2),{x:0,y:12},coarse.points[2]],delays:[20,40*0.8/1.3,40*0.5/1.3],maxHeadingDegrees:20};
      const a=(await flick(0,touch,view,coarse)).discs[0],b=(await flick(0,touch,view,dense)).discs[0];
      const heading=d=>Math.atan2(d.vx,-d.vy)*180/Math.PI;
      assert.ok(Math.abs(heading(a)-heading(b))<1,'Coarse overshoot retains the same incoming approach as a collinear subdivision');
      console.log('Coarse approach regression',JSON.stringify({touch,view,mirror,headings:[heading(a),heading(b)]}));
    }
    await flick(0,touch,view,{points:Array.from({length:17},(_,i)=>({x:0,y:11.6-i*0.05})),delays:Array(16).fill(3)});
    // Leave clearance for independent calibration-camera convergence; 11.37
    // can pick inside the 11.375 rim and invalidate this outside-stop fixture.
    await flick(0,touch,view,{miss:true,injectStationary:true,points:[{x:0,y:11.6},{x:0,y:11.34},{x:0,y:11.34},{x:0,y:11.1}],delays:[14,10,16]});
    console.log('Audit input: coarse/dense approach agrees and front-face touch launches without orbiting.');
  }
  const focused = process.env.CROKINOLE_INPUT_SMOKE === '1';
  if (!focused) {
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
  await checkPicking('standing');
  await checkPicking('seated');
  await checkAimForgiveness(false,'standing');
  await checkShortGrazes(false,'standing');
  await checkWobbles(false,'standing');
  await checkSpeedAim(false,'standing');
  // Laptop touchscreen uses desktop layout, not phone emulation.
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await checkAimForgiveness(true,'standing');
  await checkShortGrazes(true,'standing');
  await checkSpeedAim(true,'standing');
  await checkAuditInput(true,'standing');
  console.log('Picking: visible top centers and rims align across views, placements and player quadrants.');
  await flick(0, false);
  await flick(0.3, false); // Moderate contact must work, not just near-rim swipes.
  const left = await flick(-0.45, false), right = await flick(0.45, false);
  assert.ok(left.discs[0].spin > 0 && right.discs[0].spin < 0);
  const brush = { points: [{x:0,y:12.7},{x:0,y:12.55},{x:0.4,y:12.3},{x:0.4,y:11.5},{x:0.4,y:10.5}], delays:[200,130,20,20] };
  await flick(0.4, false, 'standing', brush);
  await flick(0.4, false, 'standing', { points:[{x:0.4,y:12.8},{x:0.4,y:12.3},{x:0.4,y:11.7},{x:0.7,y:11.1},{x:1,y:10.5}] });
  await flick(0.8, false, 'standing', { miss:true });
  const brushMiss = { miss:true, points:[{x:0,y:12.6},{x:0,y:12.55},{x:1,y:12.55},{x:1,y:10}], delays:[50,200,50] };
  await flick(1, false, 'standing', brushMiss);
  await flick(0, false, 'standing', { miss:true, points:[{x:0,y:12.6},{x:0,y:11.3},{x:0,y:9}], delays:[500,50] });
  console.log('Desktop: centered/mirrored deflection and spin, slow-brush registration, fixed impact direction, and missed swipes passed.');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await checkWobbles(true,'seated');
  await checkAimForgiveness(true,'seated');
  await checkShortGrazes(true,'seated');
  await checkSpeedAim(true,'seated');
  await checkAuditInput(true,'seated');
  await flick(0.03, true);
  await flick(0.3, true, 'seated');
  await flick(0.4, true, 'seated', brush);
  await flick(1, true, 'seated', brushMiss);
  await flick(0.4, true, 'seated', { cancel:true });
  await flick(0, true, 'seated');
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
  console.log('Mobile: small neutral spin zone, side deflection, slow-brush registration, cancellation, pause/reload, and resumed settlement passed; no runtime errors.');
  } else {
    // Bounded regression pass for the latest long-gentle-stroke change. The full
    // migration/picking/artwork/round suite remains the default above.
    const points=[{x:0,y:12.6},{x:0.06,y:12.59},{x:0.12,y:12.57},{x:0,y:12.4},{x:0,y:12.1},{x:0,y:11.5},{x:0,y:10.5}];
    for(const [touch,view,width,height,mobile] of [[false,'standing',1280,800,false],[true,'standing',1280,800,false],[true,'seated',390,844,true]]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
      await call('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:2});
      await checkAimForgiveness(touch,view);
      await checkShortGrazes(touch,view);
      const headings=[];
      for(const mirror of [-1,1]) for(const divisions of [1,5]) {
        const path=[{...points[0]}];
        for(let i=1;i<points.length;i++) for(let j=1;j<=divisions;j++) {
          const a=points[i-1],b=points[i],f=j/divisions;
          path.push({x:mirror*(a.x+(b.x-a.x)*f),y:a.y+(b.y-a.y)*f});
        }
        const d=(await flick(0,touch,view,{points:path,delays:path.slice(1).map(()=>80/divisions),maxHeadingDegrees:2})).discs[0];
        assert.equal(d.spin,0);
        headings.push({mirror,divisions,heading:Math.atan2(d.vx,-d.vy)*180/Math.PI});
      }
      await flick(0,touch,view,{points,delays:points.slice(1).map(()=>5),maxHeadingDegrees:2});
      await flick(0.4,touch,view);
      if(touch) {
        await flick(0,touch,view,{points:Array.from({length:17},(_,i)=>({x:0,y:11.6-i*0.05})),delays:Array(16).fill(3)});
        await flick(0,touch,view,{miss:true,injectStationary:true,points:[{x:0,y:11.6},{x:0,y:11.34},{x:0,y:11.34},{x:0,y:11.1}],delays:[14,10,16]});
      }
      console.log('Focused native input regression',JSON.stringify({touch,view,headings}));
    }
    assert.deepEqual(exceptions,[],'No uncaught runtime errors');
    console.log('Focused native mouse/laptop-touch/phone-touch checks passed; full suite was not selected.');
  }
} finally {
  socket?.close(); browser?.kill('SIGTERM'); server.kill('SIGTERM');
  await sleep(300); await rm(directory, { recursive: true, force: true });
}
