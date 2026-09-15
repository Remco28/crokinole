import { createScene } from './render/scene';
import { makeDisc, moving, step, type Disc, type Shot } from './sim/physics';
import { resolveShot, roundScore, sideOf, type Mode } from './game/rules';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('board-canvas');
const banner = $('turn-banner'), hint = $('hint'), next = $<HTMLButtonElement>('continue');
const settings = $<HTMLDialogElement>('settings');
const names = ['Coral', 'Blue', 'Gold', 'Sage'];
const colors = ['#dc6853', '#6cabbe', '#e7b95c', '#94ad76'];
let scene: ReturnType<typeof createScene>;
try { scene = createScene(canvas); } catch {
  banner.textContent = 'This table needs WebGL'; hint.textContent = 'Try a browser with hardware acceleration enabled.'; next.hidden = true;
  throw new Error('WebGL could not initialize');
}
let mode: Mode = 'duel', player = 0, round = 1, id = 0;
let discs: Disc[] = [], scores = [0, 0], used = [0, 0], phase: 'pass' | 'aim' | 'moving' | 'round' | 'won' = 'pass';
let restoredEnd: 'round' | 'won' | null = null;
let shot: Shot | null = null, hadOpponent = false, staged: Disc | null = null, readyAt = 0;
const count = () => mode === 'duel' ? 2 : 4;
const allowance = () => mode === 'duel' ? 12 : 6;
const yaw = () => player * Math.PI * 2 / count();
const side = (owner: number) => sideOf(mode, owner);
const label = (i: number) => mode === 'teams' ? ['Coral + Gold', 'Blue + Sage'][i] : names[i];
function save() {
  try { localStorage.setItem('crokinole-match', JSON.stringify({ mode, player, round, id, discs, scores, used, phase })); } catch { /* Storage is optional. */ }
}
function hud() {
  $('scoreboard').innerHTML = scores.map((score, i) => `<div class="score ${side(player) === i ? 'active' : ''}" style="--player:${colors[i]}"><span class="dot"></span><div><span class="name">${label(i)}</span><small>${discs.filter(d => side(d.owner) === i && d.state === 'sunk').length} twenties · ${mode === 'teams' ? used.filter((_, p) => side(p) === i).reduce((a, b) => a + b, 0) : used[i]}/${mode === 'ffa' ? 6 : 12} played</small></div><strong>${score}</strong></div>`).join('');
  $('round-label').textContent = `ROUND ${round} · FIRST TO 100`;
  scene.syncDiscs(discs);
}
function pass(message = '') {
  phase = 'pass'; staged = null;
  scene.setYawTarget(yaw()); readyAt = performance.now() + 850;
  banner.textContent = `${message ? message + ' · ' : ''}Pass to ${names[player]}`;
  hint.textContent = 'Take your side of the table, then tap ready.';
  next.textContent = 'Ready to shoot'; next.hidden = false; hud(); save();
}
function start() {
  mode = $<HTMLSelectElement>('mode').value as Mode;
  player = 0; round = 1; id = 0; discs = []; scores = Array(mode === 'ffa' ? 4 : 2).fill(0); used = Array(count()).fill(0);
  settings.close(); pass();
}
function stage() {
  if (performance.now() < readyAt) return;
  staged = makeDisc(++id, player, Math.sin(yaw()) * 12, Math.cos(yaw()) * 12);
  discs.push(staged); phase = 'aim'; next.hidden = true;
  banner.textContent = `${names[player]}, your shot`;
  const opponent = discs.some(d => d.state === 'board' && side(d.owner) !== side(player));
  hint.textContent = opponent ? 'Flick your disc to hit an opponent’s disc.' : 'Flick gently toward the center. Finish in the inner ring.';
  hud();
}
next.addEventListener('click', () => {
  if (phase === 'pass') stage();
  else if (phase === 'round') { round++; discs = []; used.fill(0); player = (round - 1) % count(); pass(); }
  else if (phase === 'won') start();
});
$('settings-button').addEventListener('click', () => settings.showModal());
$('new-game').addEventListener('click', start);
const skin = $<HTMLSelectElement>('skin');
skin.addEventListener('change', () => { scene.setSkin(skin.value); try { localStorage.setItem('crokinole-skin', skin.value); localStorage.removeItem('crokinole-art'); } catch { /* optional */ } });
$<HTMLInputElement>('art').addEventListener('change', async e => {
  const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
  if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) { $('settings-note').textContent = 'Choose an image smaller than 10 MB.'; return; }
  const url = URL.createObjectURL(file), image = new Image();
  image.onload = () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1024;
    const ctx = cv.getContext('2d')!; const scale = Math.max(1024 / image.width, 1024 / image.height);
    ctx.drawImage(image, (1024 - image.width * scale) / 2, (1024 - image.height * scale) / 2, image.width * scale, image.height * scale);
    const data = cv.toDataURL('image/jpeg', 0.85);
    scene.setSkin(skin.value, image); URL.revokeObjectURL(url);
    try { localStorage.setItem('crokinole-art', data); } catch { /* Image still works for this session. */ }
    $('settings-note').textContent = 'Artwork applied to this table.';
  };
  image.onerror = () => { URL.revokeObjectURL(url); $('settings-note').textContent = 'That image could not be opened.'; }; image.src = url;
});
let pointer: number | null = null;
let trail: { x: number; y: number; t: number }[] = [];
canvas.addEventListener('pointerdown', e => {
  if (phase !== 'aim' || !staged || pointer !== null || settings.open) return;
  const p = scene.boardPoint(e.clientX, e.clientY); if (!p) return;
  if (Math.hypot(p.x - staged.x, p.y - staged.y) > 1.4) {
    const a = Math.atan2(p.x, p.y), delta = Math.atan2(Math.sin(a - yaw()), Math.cos(a - yaw()));
    if (Math.abs(delta) < Math.PI / 4 - 0.06 && Math.abs(Math.hypot(p.x, p.y) - 12) < 0.9) {
      const x = Math.sin(a) * 12, y = Math.cos(a) * 12;
      if (!discs.some(d => d !== staged && d.state === 'board' && Math.hypot(d.x - x, d.y - y) < 1.3)) { staged.x = x; staged.y = y; hud(); }
    }
    return;
  }
  pointer = e.pointerId; trail = [{ ...p, t: performance.now() }]; canvas.setPointerCapture(pointer);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== pointer) return;
  const p = scene.boardPoint(e.clientX, e.clientY); if (!p) return;
  const t = performance.now(); trail.push({ ...p, t }); trail = trail.filter(p => t - p.t < 110);
});
function cancel() { pointer = null; trail = []; }
canvas.addEventListener('pointercancel', cancel);
canvas.addEventListener('lostpointercapture', cancel);
canvas.addEventListener('pointerup', e => {
  if (e.pointerId !== pointer || !staged || phase !== 'aim') return;
  const p = scene.boardPoint(e.clientX, e.clientY), t = performance.now();
  const first = trail.find(sample => t - sample.t <= 120);
  cancel(); if (!p || !first) return;
  const seconds = Math.max(0.016, (t - first.t) / 1000);
  let vx = (p.x - first.x) / seconds, vy = (p.y - first.y) / seconds;
  const speed = Math.hypot(vx, vy); if (speed < 3) { hint.textContent = 'Try a quicker flick from your disc.'; return; }
  const power = Math.min(105, speed * 0.8 + 12) / speed; vx *= power; vy *= power;
  hadOpponent = discs.some(d => d.state === 'board' && side(d.owner) !== side(player));
  shot = { touched: new Set([staged.id]), opponentContact: false, side: side(player), sideOf: side };
  staged.vx = vx; staged.vy = vy; used[player]++; phase = 'moving';
  banner.textContent = 'Let it slide'; hint.textContent = 'Waiting for the board to settle…'; hud();
});
function finishShot() {
  const valid = resolveShot(discs, shot!, hadOpponent); shot = null;
  if (used.every(n => n === allowance())) {
    const gain = roundScore(discs, mode); scores = scores.map((n, i) => n + gain[i]);
    const high = Math.max(...scores), winners = scores.map((n, i) => n === high ? i : -1).filter(i => i >= 0);
    phase = high >= 100 && winners.length === 1 ? 'won' : 'round';
    banner.textContent = phase === 'won' ? `${label(winners[0])} wins!` : 'Round complete';
    hint.textContent = gain.map((n, i) => `${label(i)} +${n}`).join(' · ');
    next.textContent = phase === 'won' ? 'Play again' : 'Next round'; next.hidden = false; hud(); save();
  } else { player = (player + 1) % count(); pass(valid ? 'Nice shot' : 'Foul — discs removed'); }
}
let last = performance.now(), accumulator = 0;
function tick(now: number) {
  accumulator += Math.min((now - last) / 1000, 0.05); last = now;
  while (accumulator >= 1 / 120) {
    if (phase === 'moving' && shot) { step(discs, 1 / 120, shot); if (!discs.some(moving)) finishShot(); }
    accumulator -= 1 / 120;
  }
  next.disabled = phase === 'pass' && now < readyAt;
  scene.syncDiscs(discs); requestAnimationFrame(tick);
}
try {
  const savedSkin = localStorage.getItem('crokinole-skin'); if (savedSkin && ['maple', 'walnut', 'slate'].includes(savedSkin)) { skin.value = savedSkin; scene.setSkin(savedSkin); }
  const art = localStorage.getItem('crokinole-art'); if (art) { const image = new Image(); image.onload = () => scene.setSkin(skin.value, image); image.src = art; }
  const raw = localStorage.getItem('crokinole-match');
  if (raw) {
    const data = JSON.parse(raw);
    if (['duel', 'teams', 'ffa'].includes(data.mode) && ['pass', 'round', 'won'].includes(data.phase) && Array.isArray(data.discs) && Array.isArray(data.scores) && Array.isArray(data.used)) {
      mode = data.mode; player = data.player; round = data.round; id = data.id; discs = data.discs; scores = data.scores; used = data.used;
      $<HTMLSelectElement>('mode').value = mode;
      if (data.phase === 'round' || data.phase === 'won') restoredEnd = data.phase;
    }
  }
} catch { /* Start fresh if storage is unavailable. */ }
if (restoredEnd) {
  phase = restoredEnd; scene.setYawTarget(yaw()); hud();
  banner.textContent = phase === 'won' ? `${label(scores.indexOf(Math.max(...scores)))} wins!` : 'Round complete';
  hint.textContent = 'Your table has been restored.';
  next.textContent = phase === 'won' ? 'Play again' : 'Next round';
} else pass();
requestAnimationFrame(tick);
