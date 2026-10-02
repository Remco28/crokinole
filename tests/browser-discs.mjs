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
let browser,socket,otherSocket;
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
  const {identifier}=await call('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('crokinole-clock','0');"});
  async function reload(){await evaluate('window.__oldDocument=true');await call('Page.reload',{ignoreCache:true});await until('!window.__oldDocument && !!document.getElementById("disc-design-note") && !document.querySelector("[data-disc-style=wood]").disabled');}
  await until('!!document.getElementById("disc-design-note") && !document.querySelector("[data-disc-style=wood]").disabled');await reload();
  const appearance=()=>evaluate('JSON.parse(localStorage.getItem("crokinole-disc-appearance-v1"))');
  const images=()=>evaluate('import("/src/storage/disc-images.ts").then(m=>m.loadDiscImages())');
  async function open(){await evaluate('document.getElementById("settings-button").click()');}
  async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);const b=await evaluate(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',x:b.x+b.width/2,y:b.y+b.height/2,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:b.x+b.width/2,y:b.y+b.height/2,button:'left',clickCount:1});}
  async function key(key,code,n){await call('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:n});await call('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:n});}
  async function screenshot(name){const r=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(screenshots,name),Buffer.from(r.data,'base64'));}
  await open();
  const before=await evaluate('JSON.parse(localStorage.getItem("crokinole-match-spin-v2"))');
  assert.equal(await evaluate('document.querySelectorAll("[data-disc-owner]").length'),4);
  assert.equal(await evaluate('document.querySelectorAll("[data-disc-palette]").length'),4);
  assert.equal(await evaluate('document.querySelectorAll("[data-disc-emblem]").length'),6);
  for(const style of ['wood','poker'])for(const palette of ['classic','jewel','pastel','earth']){
    await click(`[data-disc-style=${style}]`);await click(`[data-disc-palette=${palette}]`);
    assert.equal((await appearance()).style,style);assert.equal((await appearance()).palette,palette);
  }
  for(let owner=0;owner<4;owner++){
    await click(`[data-disc-owner="${owner}"]`);await click(`[data-disc-emblem=${['star','spade','leaf','bolt'][owner]}]`);
  }
  assert.deepEqual((await appearance()).emblems,['star','spade','leaf','bolt']);
  const after=await evaluate('JSON.parse(localStorage.getItem("crokinole-match-spin-v2"))');assert.deepEqual(after.discs,before.discs);assert.deepEqual(after.scores,before.scores);assert.equal(after.phase,before.phase);
  await evaluate('document.querySelector(".disc-settings").scrollIntoView({block:"start"})');await screenshot('disc-settings-desktop.png');await reload();
  assert.deepEqual((await appearance()).emblems,['star','spade','leaf','bolt']);assert.equal((await appearance()).style,'poker');assert.equal((await appearance()).palette,'earth');
  console.log('Built-ins: both styles, four palettes, per-player emblems, reload and unchanged match passed.');
  await open();await click('[data-disc-owner="0"]');
  const png=await evaluate(`(()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d');x.fillStyle='#167a86';x.fillRect(0,0,400,600);x.fillStyle='#e4b951';x.fillRect(400,0,400,600);x.fillStyle='#fff';x.font='bold 170px sans-serif';x.fillText('R',190,360);return c.toDataURL('image/png');})()`);
  const png2=await evaluate(`(()=>{const c=document.createElement('canvas');c.width=500;c.height=900;const x=c.getContext('2d');x.fillStyle='#9f516c';x.fillRect(0,0,500,900);x.fillStyle='#fff';x.font='bold 130px sans-serif';x.fillText('B',70,270);return c.toDataURL('image/png');})()`);
  const file=join(directory,'synthetic-red.png'),file2=join(directory,'synthetic-blue.png');await writeFile(file,Buffer.from(png.split(',')[1],'base64'));await writeFile(file2,Buffer.from(png2.split(',')[1],'base64'));
  // Load a genuine second tab before either owner has a picture: its UI snapshot is stale after Red saves.
  const {targetId}=await call('Target.createTarget',{url:`http://127.0.0.1:${port}/`});
  let otherPage;for(let i=0;i<100;i++){otherPage=(await(await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find(p=>p.id===targetId);if(otherPage)break;await sleep(100);}assert.ok(otherPage);
  otherSocket=new WebSocket(otherPage.webSocketDebuggerUrl);await new Promise((r,j)=>{otherSocket.onopen=r;otherSocket.onerror=j});
  let otherId=0;const otherPending=new Map();
  otherSocket.onmessage=({data})=>{const m=JSON.parse(data);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(otherPending.has(m.id)){otherPending.get(m.id)(m);otherPending.delete(m.id)}};
  async function otherCall(method,params={}){const id=++otherId;const m=await new Promise((r,j)=>{const t=setTimeout(()=>j(new Error(`Second tab timeout: ${method}`)),15000);otherPending.set(id,m=>{clearTimeout(t);r(m)});otherSocket.send(JSON.stringify({id,method,params}))});if(m.error)throw new Error(m.error.message);return m.result;}
  async function otherEval(expression){const r=await otherCall('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
  async function otherUntil(expression){for(let i=0;i<100;i++){if(await otherEval(expression))return;await sleep(100);}throw new Error(`Second tab not ready: ${expression}`);}
  async function otherClick(selector){await otherEval(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);const b=await otherEval(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);await otherCall('Input.dispatchMouseEvent',{type:'mousePressed',x:b.x+b.width/2,y:b.y+b.height/2,button:'left',clickCount:1});await otherCall('Input.dispatchMouseEvent',{type:'mouseReleased',x:b.x+b.width/2,y:b.y+b.height/2,button:'left',clickCount:1});}
  await otherCall('Page.enable');await otherCall('Runtime.enable');await otherCall('Page.setInterceptFileChooserDialog',{enabled:true});
  await otherUntil('!!document.getElementById("disc-design-note") && !document.querySelector("[data-disc-style=wood]").disabled');
  assert.deepEqual(await otherEval('import("/src/storage/disc-images.ts").then(m=>m.loadDiscImages())'),[]);
  await call('Page.bringToFront');
  async function upload(path){await click('#disc-add-picture');const {root}=await call('DOM.getDocument');const {nodeId}=await call('DOM.querySelector',{nodeId:root.nodeId,selector:'#disc-picture-input'});await call('DOM.setFileInputFiles',{nodeId,files:[path]});await until('!document.getElementById("disc-crop-editor").hidden || /Choose|could not/.test(document.getElementById("disc-design-note").textContent)');}
  await upload(file);assert.equal(await evaluate('document.getElementById("disc-crop-editor").hidden'),false);
  await evaluate('document.getElementById("disc-crop-zoom").focus()');await key('End','End',35);assert.equal(await evaluate('document.getElementById("disc-crop-zoom").value'),'4');
  await click('#disc-crop-preview');await key('ArrowRight','ArrowRight',39);await key('ArrowDown','ArrowDown',40);
  const cropRect=await evaluate('document.getElementById("disc-crop-preview").getBoundingClientRect().toJSON()');
  const px=cropRect.x+cropRect.width/2,py=cropRect.y+cropRect.height/2;
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:px,y:py,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:px+22,y:py+12,button:'left',buttons:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:px+22,y:py+12,button:'left',clickCount:1});
  await screenshot('disc-crop-desktop.png');await click('#disc-crop-save');await until('document.getElementById("disc-crop-editor").hidden && !document.getElementById("disc-add-picture").disabled');
  let stored=await images();assert.equal(stored.length,1);assert.equal(stored[0].owner,0);assert.equal(stored[0].crop.zoom,4);assert.ok(stored[0].crop.x>0 && stored[0].crop.y>0,'Native keyboard/drag changed pan');assert.equal((await appearance()).emblems[0],'photo');
  await otherCall('Page.bringToFront');await otherEval('document.getElementById("settings-button").click()');await otherClick('[data-disc-owner="1"]');await otherClick('#disc-add-picture');
  const otherDoc=await otherCall('DOM.getDocument'),otherInput=await otherCall('DOM.querySelector',{nodeId:otherDoc.root.nodeId,selector:'#disc-picture-input'});await otherCall('DOM.setFileInputFiles',{nodeId:otherInput.nodeId,files:[file2]});await otherUntil('!document.getElementById("disc-crop-editor").hidden');await otherClick('#disc-crop-save');await otherUntil('document.getElementById("disc-crop-editor").hidden && !document.getElementById("disc-add-picture").disabled');
  await call('Target.closeTarget',{targetId});otherSocket.close();await call('Page.bringToFront');
  const old=await images();assert.deepEqual(old.map(i=>i.owner),[0,1]);
  assert.equal(old[0].data,stored[0].data,'A stale second tab preserves Red while saving Blue');
  await evaluate('import("/src/storage/disc-images.ts").then(async m=>{const a=await m.loadDiscImages();await Promise.all([m.updateDiscImage(2,{...a[0],owner:2}),m.updateDiscImage(3,{...a[1],owner:3})]);})');assert.deepEqual((await images()).map(i=>i.owner),[0,1,2,3]);
  await evaluate('import("/src/storage/disc-images.ts").then(m=>Promise.all([m.updateDiscImage(2),m.updateDiscImage(3)]))');assert.deepEqual(await images(),old,'Concurrent scoped removal preserves the other owners');
  await reload();assert.deepEqual(await images(),old);assert.deepEqual((await appearance()).emblems,['photo','photo','leaf','bolt']);
  await open();await click('[data-disc-owner="0"]');await click('#disc-edit-picture');await until('!document.getElementById("disc-crop-editor").hidden');assert.equal(await evaluate('document.getElementById("disc-crop-zoom").value'),'4');await key('Escape','Escape',27);assert.equal(await evaluate('document.getElementById("settings").open'),true);assert.equal(await evaluate('document.getElementById("disc-crop-editor").hidden'),true);assert.deepEqual(await images(),old);
  await upload(file2);await evaluate('window.__oldPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException("Full","QuotaExceededError")};');await click('#disc-crop-save');await until('/Could not save/.test(document.getElementById("disc-design-note").textContent)');assert.deepEqual(await images(),old);assert.equal(await evaluate('document.getElementById("disc-crop-editor").hidden'),false);await evaluate('IDBObjectStore.prototype.put=window.__oldPut');await click('#disc-crop-cancel');
  await click('#disc-edit-picture');await until('!document.getElementById("disc-crop-editor").hidden');
  await evaluate('window.__oldSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==="crokinole-disc-appearance-v1")throw new DOMException("Full","QuotaExceededError");return window.__oldSet.call(this,k,v)}');
  await click('#disc-crop-save');await until('document.getElementById("disc-crop-editor").hidden && !document.getElementById("disc-add-picture").disabled');
  assert.match(await evaluate('document.getElementById("disc-design-note").textContent'),/could not save the preference/);assert.deepEqual(await images(),old);
  await click('[data-disc-style=wood]');await click('[data-disc-palette=classic]');assert.equal(await evaluate('document.querySelector("[data-disc-style=wood]").getAttribute("aria-pressed")'),'true','Unsaved visit choices survive later choices');
  await evaluate('Storage.prototype.setItem=window.__oldSet');await click('[data-disc-style=poker]');await click('[data-disc-palette=earth]');
  await click('[data-disc-emblem=moon]');assert.equal((await appearance()).emblems[0],'moon');assert.deepEqual(await images(),old,'Choosing an emblem keeps saved pictures');await click('#disc-use-picture');assert.equal((await appearance()).emblems[0],'photo');
  await click('#disc-remove-picture');await until('!document.getElementById("disc-add-picture").disabled');assert.deepEqual((await images()).map(i=>i.owner),[1]);assert.equal((await images())[0].data,old[1].data);assert.equal((await appearance()).emblems[0],'none');
  console.log('Pictures: real chooser, native zoom/pan, independent owners, reframe/cancel, quota failure, reuse/remove and reload passed.');
  for(const [width,height]of[[390,844],[320,568],[640,360]]){
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await sleep(300);await evaluate('document.querySelector(".disc-settings").scrollIntoView({block:"start"})');
    const layout=await evaluate('(()=>{const s=document.getElementById("settings");return{client:s.clientWidth,scroll:s.scrollWidth,width:s.getBoundingClientRect().width,inner:innerWidth};})()');assert.ok(layout.scroll<=layout.client+1 && layout.width<=layout.inner,'No dialog horizontal overflow');await screenshot(`disc-settings-${width}x${height}.png`);
  }
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await click('[data-disc-owner="1"]');await click('#disc-edit-picture');await until('!document.getElementById("disc-crop-editor").hidden');await evaluate('document.getElementById("disc-crop-zoom").value="2";document.getElementById("disc-crop-zoom").dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("disc-crop-preview").scrollIntoView({block:"center"})');
  const mobileRect=await evaluate('document.getElementById("disc-crop-preview").getBoundingClientRect().toJSON()');const tx=mobileRect.x+mobileRect.width/2,ty=mobileRect.y+mobileRect.height/2;
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty,id:1}]});await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx-15,y:ty-20,id:1}]});await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await screenshot('disc-crop-mobile.png');await click('#disc-crop-save');await until('document.getElementById("disc-crop-editor").hidden && !document.getElementById("disc-add-picture").disabled');assert.ok((await images())[0].crop.x<0 || (await images())[0].crop.y<0,'Native touch moved crop');
  console.log('Responsive: narrow, short, landscape controls and native touch cropping passed.');
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await call('Emulation.setTouchEmulationEnabled',{enabled:false,maxTouchPoints:1});
  const badFile=join(directory,'unsupported.svg');await writeFile(badFile,'<svg xmlns="http://www.w3.org/2000/svg"/>');await upload(badFile);assert.match(await evaluate('document.getElementById("disc-design-note").textContent'),/Choose a PNG/);assert.equal((await images()).length,1);
  await evaluate('import("/src/storage/disc-images.ts").then(m=>m.saveDiscImages([]))');
  await evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('crokinole-disc-images',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('images','readwrite');t.objectStore('images').put([{owner:9}],'faces');t.oncomplete=()=>{db.close();resolve()};t.onerror=reject};r.onerror=reject;})`);
  await reload();await open();assert.equal(await evaluate('document.getElementById("disc-add-picture").disabled'),true);await click('[data-disc-style=wood]');assert.equal((await appearance()).style,'wood');
  const raw=await evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('crokinole-disc-images',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('images').objectStore('images').get('faces');q.onsuccess=()=>{const data=q.result;db.close();resolve(data)};q.onerror=reject};r.onerror=reject;})`);assert.deepEqual(raw,[{owner:9}],'Unreadable saved data is not overwritten');
  assert.equal(await evaluate('import("/src/storage/disc-images.ts").then(m=>m.updateDiscImage(0).then(()=>false,()=>true))'),true,'Atomic writes reject corrupt stored records without clearing them');
  assert.deepEqual(exceptions,[],'No runtime exceptions');await call('Page.removeScriptToEvaluateOnNewDocument',{identifier});
  console.log('Error safety: unsupported image and corrupt saved-picture fallback preserve storage; no runtime errors.');
  console.log('COMPLETE disc-design browser verification');
}catch(error){console.error('DISC CHECK FAILURE:',error);throw error;}
finally{
  if(otherSocket)otherSocket.close();
  if(socket)socket.close();
  if(browser){browser.kill();await new Promise(resolve=>{if(browser.exitCode!==null)resolve();else{browser.once('exit',resolve);setTimeout(resolve,2000);}});}
  server.kill();
  await rm(directory,{recursive:true,force:true,maxRetries:8,retryDelay:150}).catch(error=>console.error('Temporary profile cleanup:',error.message));
}
