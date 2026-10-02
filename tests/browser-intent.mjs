import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
const evidence=process.env.CROKINOLE_INTENT_EVIDENCE || join(tmpdir(),'crokinole-intent-evidence'); await mkdir(evidence,{recursive:true});
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

  const heading=(dx,dy)=>Math.atan2(dx,-dy)*180/Math.PI;
  async function runCase(spec,touch,view,label) {
    await reset(view);
    const geom=await evaluate(`(() => {
      const s=window.__calibration,r=window.__calibrationCanvas.getBoundingClientRect(),camera=window.__calibrationCamera,T=window.__three;
      const project=(x,y)=>{const n=new T.Vector3(x,window.__discHeight,y).project(camera);return{x:r.x+(n.x+1)*r.width/2,y:r.y+(1-n.y)*r.height/2}};
      window.__project=project;
      const c=project(0,12),a=project(.625,12),b=project(0,12.625),z=project(0,11.375);
      const rx=Math.hypot(a.x-c.x,a.y-c.y),ry=(Math.hypot(b.x-c.x,b.y-c.y)+Math.hypot(z.x-c.x,z.y-c.y))/2;
      const theta=${spec.clock}*${spec.mirror || 1}*Math.PI/6,dir={x:Math.sin(theta),y:-Math.cos(theta)};
      const start=${spec.control?'true':'false'}?{x:c.x-dir.x*ry*1.5,y:c.y-dir.y*ry*1.5}:{x:c.x-${spec.left}*${spec.mirror || 1}*rx,y:c.y+${spec.down}*ry};
      const length=3.5*rx;
      const prep=${JSON.stringify(spec.prep||null)};
      const first=prep?{x:start.x+(prep==='leftup'?-${spec.prepLeft||.15}*${spec.mirror || 1}*rx:0),y:start.y-${spec.prepUp||.15}*ry}:start;
      const positions=prep?[start,first,...Array.from({length:8},(_,i)=>({x:first.x+dir.x*length*(i+1)/8,y:first.y+dir.y*length*(i+1)/8}))]:Array.from({length:9},(_,i)=>({x:start.x+dir.x*length*i/8,y:start.y+dir.y*length*i/8}));
      const picks=positions.map(p=>s.boardPoint(p.x,p.y));
      return{center:c,rx,ry,positions,picks,rect:r.toJSON()};
    })()`);
    for(const p of geom.positions) assert.ok(p.x>=geom.rect.x&&p.x<=geom.rect.right&&p.y>=geom.rect.y&&p.y<=geom.rect.bottom,'Canvas bounds');
    await evaluate(`window.__probe=[];window.__gestureEvents=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.getElementById('board-canvas').addEventListener(type,e=>window.__gestureEvents.push({type:e.type,t:e.timeStamp,x:e.clientX,y:e.clientY,id:e.pointerId,pointerType:e.pointerType,trusted:e.isTrusted,raw:(e.getCoalescedEvents?.()??[]).map(p=>({t:p.timeStamp,x:p.clientX,y:p.clientY}))}),true);window.__initialLaunch=null;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='crokinole-match-spin-v2'&&!window.__initialLaunch){const s=JSON.parse(v);if(s.phase==='moving')window.__initialLaunch=s;}return original.call(this,k,v);}`);
    const inputs=[],timestamp=Date.now()/1000;let elapsed=0;
    const positions=geom.positions;
    if(touch){
      inputs.push(call('Input.dispatchTouchEvent',{type:'touchStart',timestamp,touchPoints:[{...positions[0],id:1}]}));
      for(const p of positions.slice(1)){await sleep(12);elapsed+=12;inputs.push(call('Input.dispatchTouchEvent',{type:'touchMove',timestamp:timestamp+elapsed/1000,touchPoints:[{...p,id:1}]}));}
      if (spec.noise) {
        await sleep(5); elapsed += 5;
        const end=positions.at(-1);
        inputs.push(call('Input.dispatchTouchEvent',{type:'touchMove',timestamp:timestamp+elapsed/1000,touchPoints:[{x:end.x+.001*geom.rx,y:end.y-.001*geom.ry,id:1}]}));
      }
      inputs.push(call('Input.dispatchTouchEvent',{type:'touchEnd',timestamp:timestamp+(elapsed+(spec.liftMs||5))/1000,touchPoints:[]}));
    }else{
      inputs.push(call('Input.dispatchMouseEvent',{type:'mousePressed',timestamp,...positions[0],button:'left',buttons:1,clickCount:1}));
      for(const p of positions.slice(1)){await sleep(12);elapsed+=12;inputs.push(call('Input.dispatchMouseEvent',{type:'mouseMoved',timestamp:timestamp+elapsed/1000,...p,button:'left',buttons:1}));}
      inputs.push(call('Input.dispatchMouseEvent',{type:'mouseReleased',timestamp:timestamp+(elapsed+(spec.liftMs||5))/1000,...positions.at(-1),button:'left',buttons:0,clickCount:1}));
    }
    await Promise.all(inputs);await until(`window.__gestureEvents.some(e=>e.type==='pointerup')`);
    const releasePower = await evaluate(`(async () => {
      const { releaseVelocity } = await import('/src/game/flick.ts');
      const samples=window.__gestureEvents.flatMap(e=>e.type==='pointermove'&&e.raw.length?e.raw:[e])
        .filter(e=>['pointerdown','pointermove','pointerup'].includes(e.type)||!e.type)
        .map(e=>({...window.__calibration.boardPoint(e.x,e.y),t:e.t}));
      const end=samples.at(-1);
      return releaseVelocity(samples.filter(p=>end.t-p.t<=120),{x:0,y:12});
    })()`);
    await evaluate('document.getElementById("pause-button").click()');
    const result=await evaluate(`(() => {const launch=window.__initialLaunch,disc=launch?.discs[0];let out=null;if(disc){const a=window.__project(disc.x,disc.y),b=window.__project(disc.x+disc.vx*.001,disc.y+disc.vy*.001);out={a,b};}return {state:JSON.parse(localStorage.getItem('crokinole-match-spin-v2')),launch,events:window.__gestureEvents,out};})()`);
    const disc=result.launch?.discs[0];
    const p0=geom.picks[0],p1=geom.picks.at(-1);
    const row={id:`${label}-m${spec.mirror || 1}-${spec.control?'center':'L'+spec.left+'D'+spec.down}-clock${spec.clock}${spec.prep?'-'+spec.prep+'-'+spec.prepLeft:''}-lift${spec.liftMs||5}-noise${!!spec.noise}`,label,view,touch,...spec,screenIncoming:heading(positions.at(-1).x-positions[0].x,positions.at(-1).y-positions[0].y),worldIncoming:heading(p1.x-p0.x,p1.y-p0.y),screenOutgoing:result.out?heading(result.out.b.x-result.out.a.x,result.out.b.y-result.out.a.y):null,worldOutgoing:disc?heading(disc.vx,disc.vy):null,launched:!!disc,phase:result.state?.phase,speed:disc?Math.hypot(disc.vx,disc.vy):null,spin:disc?.spin,geometry:geom,...result};
    await writeFile(join(evidence,row.id+'.json'),JSON.stringify(row,null,2));
    if(spec.liftMs===100 && !releasePower) {
      assert.equal(disc,undefined,'A hold with insufficient remaining release power cancels, rather than launching with stale aim');
      assert.equal(result.state.phase,'pass');
      assert.ok(Math.hypot(result.state.discs[0].x,result.state.discs[0].y-12)<.0001,'Cancelled powered hold does not relocate the disc');
    } else assert.ok(disc, 'Eligible seated touch stroke launches');
    assert.ok(result.events.every(e=>e.trusted),'Native trusted pointer events');
    if (disc && !process.env.CROKINOLE_INTENT_DIAGNOSTIC) {
      const signed=row.screenOutgoing*(spec.mirror||1);
      if(spec.edge) assert.ok(Math.abs(row.worldOutgoing)>50,'Deliberate radial edge glance remains sharp');
      else if(spec.control) assert.ok(Math.abs(signed-spec.clock*30)<.25,'Centered diagonal remains accurate');
      else {
        const minimum = spec.left === .1 && spec.down === 1.5 ? 20 : spec.clock === 1 ? 10 : 30;
        assert.ok(signed>minimum,'Main diagonal intent is not cancelled or reversed');
        assert.ok(signed<spec.clock*30+20,'A small onset must not create an extreme reinforcing turn');
      }
    }
    console.log(JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k])=>!['geometry','state','launch','probe','events','out'].includes(k)))));
    await evaluate('window.__calibration.dispose();window.__calibrationCanvas.remove()');return row;
  }
  const rows=[];
  for(const [touch,view,width,height,mobile,label]of[[true,'seated',1280,800,false,'laptop-touch'],[true,'seated',390,844,true,'phone-touch']]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
    await call('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:2});
    const specs=[];
    for (const mirror of [-1,1]) for (const clock of [1,2]) {
      specs.push({left:.3,down:.5,clock,prep:'leftup',prepLeft:.4,mirror});
      if (!process.env.CROKINOLE_INTENT_QUICK) specs.push({left:.3,down:.5,clock,mirror},{left:0,down:0,clock,mirror,control:true});
    }
    if (!process.env.CROKINOLE_INTENT_QUICK) for(const mirror of [-1,1]) {
      specs.push({left:.99,down:1.3,clock:0,mirror,edge:true});
      for(const liftMs of [17,50,100]) specs.push({left:.3,down:.5,clock:1,prep:'leftup',prepLeft:.4,mirror,liftMs});
      specs.push({left:.3,down:.5,clock:1,prep:'leftup',prepLeft:.4,mirror,noise:true});
    }
    if(label==='phone-touch'&&!process.env.CROKINOLE_INTENT_QUICK) for(const mirror of [-1,1]) specs.push({left:.1,down:1.5,clock:2,mirror});
    for(const spec of specs) {
      rows.push(await runCase(spec,touch,view,label));
      await writeFile(join(evidence,'results.json'),JSON.stringify({count:rows.length,rows,exceptions},null,2));
    }
  }
  const expected=process.env.CROKINOLE_INTENT_QUICK?8:46;
  assert.equal(rows.length,expected);assert.deepEqual(exceptions,[]);console.log('COMPLETE '+rows.length);
}finally{socket?.close();browser?.kill('SIGTERM');server.kill('SIGTERM');await sleep(300);await rm(directory,{recursive:true,force:true});}
