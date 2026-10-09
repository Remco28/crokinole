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
const directory = await mkdtemp(join(tmpdir(), 'crokinole-round-'));
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
  let requestId = 0; const pending = new Map();
  socket.onmessage = ({ data }) => { const message = JSON.parse(data); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } };
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
    for (let i = 0; i < 80; i++) { try { if (await evaluate(expression)) return; } catch { /* Navigation may replace the context. */ } await sleep(100); }
    throw new Error(`Condition not met: ${expression}`);
  }
  async function reload() { await evaluate('window.__oldDocument=true'); await call('Page.reload', { ignoreCache: true }); await until('!window.__oldDocument && !!document.getElementById("artwork-gallery") && document.querySelectorAll(".artwork-preview").length === 4 && !document.getElementById("use-finish").disabled'); }
  await call('Page.enable');
  async function restoreMatch(match) {
    const { identifier } = await call('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('crokinole-match-spin-v2', ${JSON.stringify(JSON.stringify(match))})` });
    try { await reload(); } finally { await call('Page.removeScriptToEvaluateOnNewDocument', { identifier }); }
  }
  const state = () => evaluate('JSON.parse(localStorage.getItem("crokinole-match-spin-v2"))');
  const library = () => evaluate('import("/src/storage/artwork.ts").then(m => m.loadArtworkLibrary())');
  await until('document.querySelectorAll(".artwork-preview").length === 4 && !document.getElementById("use-finish").disabled');
  const png = await evaluate('(() => { const c=document.createElement("canvas"); c.width=c.height=32; const x=c.getContext("2d"); x.fillStyle="#845f92"; x.fillRect(0,0,32,32); return c.toDataURL("image/png"); })()');
  await evaluate(`localStorage.setItem('crokinole-art', ${JSON.stringify(png)})`);
  await reload();
  assert.equal((await library()).artworks.length, 1, 'Legacy image migrated');
  assert.equal((await library()).selectedId, 1);
  assert.equal(await evaluate('localStorage.getItem("crokinole-art")'), null, 'Legacy copy removed after successful save');
  await call('Page.setInterceptFileChooserDialog', { enabled: true });
  await evaluate('document.getElementById("settings").showModal()');
  async function upload(slot, name, replace = false) {
    const path = join(directory, name); await writeFile(path, Buffer.from(png.split(',')[1], 'base64'));
    await evaluate(replace ? `document.querySelector('[aria-label="Replace artwork in slot ${slot}"]').click()` : `document.querySelector('.artwork-preview[data-slot="${slot}"]').click()`);
    const { root } = await call('DOM.getDocument');
    const { nodeId } = await call('DOM.querySelector', { nodeId: root.nodeId, selector: '#art' });
    await call('DOM.setFileInputFiles', { nodeId, files: [path] });
    await until('!document.getElementById("use-finish").disabled');
  }
  for (const slot of [2, 3, 4]) await upload(slot, `board-${slot}.png`);
  assert.equal((await library()).artworks.length, 4, 'All four slots persist');
  assert.equal((await library()).selectedId, 4);
  if (process.env.SCREENSHOT_DIR) {
    await evaluate('document.getElementById("artwork-gallery").scrollIntoView({block:"center"})');
    const shot=await call('Page.captureScreenshot', { format:'png' });
    await writeFile(join(process.env.SCREENSHOT_DIR,'crokinole-artwork-gallery.png'),Buffer.from(shot.data,'base64'));
  }

  await upload(1, 'replacement.png', true);
  assert.equal((await library()).artworks.length, 4, 'Replacing does not add a fifth image');
  assert.equal((await library()).artworks.find(a => a.id === 1).name, 'replacement.png');
  await evaluate('window.originalPut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function() { throw new DOMException("Full", "QuotaExceededError"); }');
  await upload(1, 'should-not-save.png', true);
  assert.equal((await library()).artworks.find(a => a.id === 1).name, 'replacement.png', 'Failed replacement keeps the saved image');
  assert.match(await evaluate('document.getElementById("artwork-note").textContent'), /Could not save/);
  await evaluate('IDBObjectStore.prototype.put = window.originalPut');
  await evaluate(`document.querySelector('[aria-label="Delete artwork in slot 1"]').click()`);
  await until('!document.getElementById("use-finish").disabled');
  assert.equal((await library()).artworks.length, 3);
  assert.equal((await library()).selectedId, null, 'Deleting active artwork restores finish');
  await evaluate(`document.querySelector('.artwork-preview[data-slot="2"]').click()`);
  await until('!document.getElementById("use-finish").disabled'); await reload();
  assert.equal((await library()).selectedId, 2, 'Selection survives reload');
  assert.equal(await evaluate(`document.querySelector('.artwork-preview[data-slot="2"]').getAttribute("aria-pressed")`), 'true');
  await evaluate('document.getElementById("use-finish").click()');
  await until('!document.getElementById("use-finish").disabled'); await reload();
  assert.equal((await library()).selectedId, null, 'Built-in finish choice survives reload');
  assert.equal((await library()).artworks.length, 3, 'Choosing finish preserves gallery');
  console.log('Artwork: migration, four slots, replacement, save failure, deletion, selection, and reload passed.');

  // Restore a final shot review, then let the actual game complete the round.
  const finalShot = await evaluate(`(async () => {
    const { makeDisc } = await import('/src/sim/physics.ts');
    const s=JSON.parse(localStorage.getItem('crokinole-match-spin-v2'));
    const red=makeDisc(1,0,0,0); red.state='sunk'; red.holeCleared=true;
    const blue=makeDisc(2,1,0,10);
    Object.assign(s,{mode:'duel',player:0,round:5,id:2,discs:[red,blue],scores:[89,78],used:[12,12],phase:'review',paused:false,remaining:null,deadline:null,stagedId:null,roundResult:null,winnerDismissed:false,shot:null,review:{elapsed:2000,hold:1250,removed:[],verdict:{valid:true,reason:null,foulIds:[],removalIds:[],revokedTwenties:0}}});
    return s;
  })()`);
  await restoreMatch(finalShot); await until('!document.getElementById("winner-overlay").hidden');
  assert.equal(await evaluate('document.getElementById("winner-title").textContent'), 'Red Wins!');
  assert.equal(await evaluate('document.getElementById("winner-result").textContent'), '104–78 · 5 rounds');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  if (process.env.SCREENSHOT_DIR) {
    const shot=await call('Page.captureScreenshot', { format:'png' }); await writeFile(join(process.env.SCREENSHOT_DIR,'crokinole-winner-mobile.png'),Buffer.from(shot.data,'base64'));
  }
  const before=await state();
  await evaluate('document.getElementById("inspect-board").click()');
  await until('!document.getElementById("camera-table").disabled');
  assert.equal(await evaluate('document.getElementById("winner-overlay").hidden'), true);
  assert.equal(await evaluate('document.getElementById("show-winner").hidden'), false);
  await evaluate('document.getElementById("camera-table").click()');
  assert.equal(await evaluate('document.getElementById("camera-table").getAttribute("aria-pressed")'), 'true');
  const canvas = await evaluate('document.getElementById("board-canvas").getBoundingClientRect().toJSON()');
  const x=canvas.x+canvas.width*.7, y=canvas.y+canvas.height*.4;
  await Promise.all([['touchStart',x,y],['touchMove',x-40,y+10],['touchEnd',x-40,y+10]].map(([type,px,py]) => call('Input.dispatchTouchEvent', {type,touchPoints:type==='touchEnd'?[]:[{x:px,y:py,id:1}]})));
  assert.deepEqual((await state()).discs, before.discs, 'Inspecting keeps every final piece in place');
  assert.deepEqual((await state()).scores, before.scores);
  await reload();
  assert.equal(await evaluate('document.getElementById("winner-overlay").hidden'), true, 'Dismissal survives reload');
  await evaluate('document.getElementById("show-winner").click()');
  assert.equal(await evaluate('document.getElementById("winner-overlay").hidden'), false, 'Winner can be reopened');
  const teams = await state(); teams.mode='teams'; teams.used=[6,6,6,6]; teams.winnerDismissed=false;
  await restoreMatch(teams);
  assert.equal(await evaluate('document.getElementById("winner-title").textContent'), 'Red + Yellow Win!');
  const ffa = await state(); ffa.mode='ffa'; ffa.scores=[15,30,70,110]; ffa.roundResult={before:ffa.scores,after:ffa.scores,winner:3,sides:Array.from({length:4},()=>({twenties:0,fifteens:0,tens:0,fives:0,total:0,awarded:0}))}; ffa.winnerDismissed=false;
  await restoreMatch(ffa);
  assert.equal(await evaluate('document.getElementById("winner-title").textContent'), 'Green Wins!');
  await evaluate('document.getElementById("winner-new-game").click()');
  assert.equal((await state()).round, 1); assert.equal((await state()).phase, 'pass');
  assert.equal(await evaluate('document.getElementById("winner-overlay").hidden'), true);
  console.log('Winner: real round completion, final score, dismissal, inspection, reload, reopen, teams, free-for-all, and new game passed.');

  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  for (const mode of ['duel', 'teams', 'ffa']) {
    for (const [width, height] of [[320, 568], [360, 640], [390, 664], [844, 390], [899, 500]]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      const roundEnd = { ...finalShot, mode, scores: Array(mode === 'ffa' ? 4 : 2).fill(0), used: Array(mode === 'duel' ? 2 : 4).fill(mode === 'duel' ? 12 : 6) };
      await restoreMatch(roundEnd);
      await until('document.getElementById("continue").textContent === "Next round" && !document.getElementById("continue").hidden');
      if (mode === 'ffa') await evaluate('document.getElementById("score-details").click()');
      const button = await evaluate(`(() => {
        const b=document.getElementById('continue'), r=b.getBoundingClientRect();
        const x=r.x+r.width/2, y=r.y+r.height/2;
        return {x,y,top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:innerHeight,width:innerWidth,hit:b.contains(document.elementFromPoint(x,y)),summaryExpanded:document.getElementById('round-summary').dataset.boardFocus === 'false'};
      })()`);
      assert.equal(button.summaryExpanded, true, 'Round breakdown stays expanded by default');
      assert.ok(button.top >= 0 && button.bottom <= button.height && button.left >= 0 && button.right <= button.width && button.hit, `Next round is fully visible and tappable without collapsing scores: ${mode} ${width}x${height} ${JSON.stringify(button)}`);
      await evaluate('document.getElementById("app").scrollTop=document.getElementById("app").scrollHeight');
      const scrolled = await evaluate(`(() => {
        const app=document.getElementById('app'), summary=document.getElementById('round-summary');
        const last=summary.lastElementChild.getBoundingClientRect(), footer=document.querySelector('footer').getBoundingClientRect();
        const b=document.getElementById('continue'), r=b.getBoundingClientRect(), x=r.x+r.width/2,y=r.y+r.height/2;
        return {x,y,summaryReadable:last.top>=0 && last.bottom<=footer.top,hit:b.contains(document.elementFromPoint(x,y)),noHorizontalOverflow:app.scrollWidth<=app.clientWidth};
      })()`);
      assert.equal(scrolled.summaryReadable, true, 'Expanded breakdown can scroll clear of the pinned action');
      assert.equal(scrolled.noHorizontalOverflow, true);
      assert.equal(scrolled.hit, true, 'Next round remains tappable after scrolling');
      if (process.env.SCREENSHOT_DIR && mode === 'ffa' && width === 320) {
        const shot = await call('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(process.env.SCREENSHOT_DIR, 'crokinole-round-small-mobile.png'), Buffer.from(shot.data, 'base64'));
      }
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x:scrolled.x, y:scrolled.y, id:1 }] });
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await until('document.getElementById("round-summary").hidden');
      assert.equal((await state()).round, 6, 'Native tap advances to the next round');
      assert.equal((await state()).phase, 'pass');
    }
  }
  console.log('Round progression: expanded scores, short/narrow/landscape mobile screens, all three modes, and native Next round taps passed.');
} finally {
  socket?.close(); browser?.kill('SIGTERM'); server.kill('SIGTERM');
  await sleep(300); await rm(directory, { recursive: true, force: true });
}
