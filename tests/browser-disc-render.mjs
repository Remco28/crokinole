import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() { const s=createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r)); const port=s.address().port; await new Promise(r=>s.close(r)); return port; }
const directory=await mkdtemp(join(tmpdir(),'crokinole-disc-designs-'));
const screenshots=process.env.SCREENSHOT_DIR || join(directory,'screenshots'); await mkdir(screenshots,{recursive:true});
const port=await freePort(), debugPort=await freePort();
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore'});
let browser,socket;
try {
  for(let i=0;i<100;i++){ try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{} await sleep(100); }
  browser=spawn(process.env.CHROME_BIN || 'google-chrome',['--headless','--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${directory}/profile`,`http://127.0.0.1:${port}/`],{stdio:'ignore'});
  let page;
  for(let i=0;i<100;i++){try{page=(await(await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find(p=>p.type==='page'&&p.url.includes(String(port)));if(page)break;}catch{}await sleep(100);}
  assert.ok(page,'Chrome opened candidate'); socket=new WebSocket(page.webSocketDebuggerUrl); await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  let requestId=0; const pending=new Map(),exceptions=[];
  socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
  async function call(method,params={},timeoutMs=15000){const id=++requestId;const r=await new Promise((resolve,reject)=>{const t=setTimeout(()=>{pending.delete(id);reject(new Error(`Timeout: ${method}`));},timeoutMs);pending.set(id,m=>{clearTimeout(t);resolve(m);});socket.send(JSON.stringify({id,method,params}));});if(r.error)throw new Error(r.error.message);return r.result;}
  async function evaluate(expression,timeoutMs=15000){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},timeoutMs);if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);return r.result.value;}
  async function until(expression){const deadline=Date.now()+15000;let error;while(Date.now()<deadline){try{if(await evaluate(expression,Math.max(1,deadline-Date.now())))return;}catch(e){error=e;}await sleep(100);}throw new Error(`Not ready: ${expression}; ${error || ''}`);}
  await call('Page.enable');await call('Runtime.enable'); await call('Page.setInterceptFileChooserDialog',{enabled:true});

  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await until('!!document.getElementById("disc-design-note") && !document.querySelector("[data-disc-style=wood]").disabled');
  await evaluate(`(async()=>{
    document.getElementById('pause-button').click();
    document.getElementById('pause-dialog').close(); // Keep the game paused without a top-layer backdrop obscuring the fixture.
    const {createScene}=await import('/src/render/scene.ts');
    const source=await(await fetch('/src/render/scene.ts')).text();
    const path=source.match(/from ["']([^"']*three[^"']*)["']/)?.[1];if(!path)throw new Error('Missing actual Three dependency');
    const THREE=await import(path);window.__three=THREE;
    const original=THREE.Scene.prototype.onBeforeRender;
    THREE.Scene.prototype.onBeforeRender=function(renderer,scene,camera,target){if(renderer.domElement===window.__faceCanvas)window.__faceRender={scene,camera,renderer};return original.call(this,renderer,scene,camera,target)};
    const canvas=document.createElement('canvas');window.__faceCanvas=canvas;
    Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',zIndex:'9999'});document.body.append(canvas);
    window.__faceScene=createScene(canvas);window.__faceScene.setTheme('light');window.__faceScene.setZoom(1.6);
    const {makeDisc}=await import('/src/sim/physics.ts');window.__faceDiscs=[[-3.8,-4.8],[3.8,-4.8],[-3.8,4.8],[3.8,4.8]].map(([x,y],owner)=>makeDisc(owner+1,owner,x,y));
    window.__faceScene.syncDiscs(window.__faceDiscs);
    const c=document.createElement('canvas');c.width=150;c.height=240;const x=c.getContext('2d');x.fillStyle='#197f87';x.fillRect(0,0,75,240);x.fillStyle='#e9b94e';x.fillRect(75,0,75,240);x.fillStyle='#fff';x.font='bold 110px sans-serif';x.fillText('R',30,160);
    const photo=new Image();photo.src=c.toDataURL('image/png');await photo.decode();window.__facePhoto=photo;
  })()`);
  const rows=[];
  for(const [width,height,mobile]of[[1280,900,false],[390,844,true]]){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
    await until('!!window.__faceRender && !window.__faceScene.isViewMoving()');
    assert.equal(await evaluate('document.elementFromPoint(innerWidth/2,innerHeight/2)===window.__faceCanvas && !document.querySelector("dialog[open]")'),true,'Actual rendered fixture is visible, not behind a modal/backdrop');
    await evaluate("window.__faceScene.setDiscAppearance({version:1,style:'wood',palette:'classic',emblems:['none','none','none','none']})");await sleep(100);
    const defaultShot=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(screenshots,`disc-board-default-${mobile?'phone':'desktop'}.png`),Buffer.from(defaultShot.data,'base64'));
    for(const style of ['wood','poker'])for(const palette of ['classic','jewel','pastel','earth']){
      await evaluate(`window.__faceScene.setDiscAppearance({version:1,style:${JSON.stringify(style)},palette:${JSON.stringify(palette)},emblems:['star','spade','leaf','bolt']});window.__faceDiscs.forEach(d=>d.angle=0);window.__faceScene.syncDiscs(window.__faceDiscs)`);
      await sleep(100);
      const initial=await evaluate(`(()=>{const meshes=window.__faceRender.scene.children.filter(o=>o.userData.owner!==undefined);return{count:meshes.length,textures:new Set(meshes.map(m=>m.children[0].material.map.uuid)).size,memory:window.__faceRender.renderer.info.memory.textures,faces:meshes.map(m=>({owner:m.userData.owner,textureSize:m.children[0].material.map.image.width,flat:m.children[0].position.y,offset:m.children[0].material.polygonOffset}))}})()`);
      assert.equal(initial.count,4);assert.equal(initial.textures,4);assert.ok(initial.faces.every(f=>f.textureSize===256&&f.offset&&f.flat>0));assert.ok(initial.memory<=10,'GPU texture allocation remains bounded');
      await evaluate('window.__faceDiscs.forEach(d=>d.angle=.63);window.__faceScene.syncDiscs(window.__faceDiscs)');await sleep(100);
      const rotation=await evaluate(`(()=>{const meshes=window.__faceRender.scene.children.filter(o=>o.userData.owner!==undefined),T=window.__three;return meshes.map(m=>({owner:m.userData.owner,error:m.quaternion.angleTo(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-.63)),parent:m.children[0].parent===m}))})()`);
      assert.ok(rotation.every(r=>r.parent&&r.error<1e-7),'Actual WebGL face follows disc axial rotation');
      const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(screenshots,`disc-board-${style}-${palette}-${mobile?'phone':'desktop'}.png`),Buffer.from(shot.data,'base64'));
      rows.push({width,height,style,palette,initial,rotation});
    }
    for(const style of ['wood','poker']){
      await evaluate(`window.__faceScene.setDiscAppearance({version:1,style:${JSON.stringify(style)},palette:'classic',emblems:['photo','spade','leaf','bolt']},[window.__facePhoto]);window.__faceScene.setView('seated')`);await until('!window.__faceScene.isViewMoving()');await sleep(100);
      const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(screenshots,`disc-board-photo-${style}-${mobile?'phone':'desktop'}.png`),Buffer.from(shot.data,'base64'));rows.push({width,height,style,photo:true,seated:true});
      await evaluate("window.__faceScene.setView('standing')");await until('!window.__faceScene.isViewMoving()');
    }
  }
  assert.equal(rows.length,20);assert.deepEqual(exceptions,[]);
  await writeFile(join(screenshots,'disc-render-results.json'),JSON.stringify({count:rows.length,rows,exceptions},null,2)+'\n');
  await evaluate('window.__faceScene.dispose();window.__faceCanvas.remove()');
  console.log('COMPLETE 20 actual WebGL disc checks: desktop/phone, wood/poker, all palettes, owner faces, axial rotation, seated photos and bounded texture allocation.');
}catch(error){console.error('DISC RENDER FAILURE:',error);throw error;}
finally{
  if(socket)socket.close();
  if(browser){browser.kill();await new Promise(resolve=>{if(browser.exitCode!==null)resolve();else{browser.once('exit',resolve);setTimeout(resolve,2000);}});}
  server.kill();await rm(directory,{recursive:true,force:true,maxRetries:8,retryDelay:150}).catch(error=>console.error('Temporary profile cleanup:',error.message));
}
