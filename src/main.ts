import { BoardSound } from './audio/sound';
import { createScene, type BoardView } from './render/scene';
import { makeDisc, moving, step, type Disc, type Shot } from './sim/physics';
import { completeRound, inspectShot, sideOf, type Mode, type RoundResult } from './game/rules';
import { assignDitchSlots, beginReview, reviewDuration, type ShotReview } from './game/review';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('board-canvas');
const banner = $('turn-banner'), hint = $('hint'), next = $<HTMLButtonElement>('continue');
const settings = $<HTMLDialogElement>('settings');
const sound = new BoardSound();
let volume = 0.65, muted = false, view: BoardView = 'standing', zoom = 1.2, theme: 'light' | 'dark' = 'light';
const clampZoom = (value: number) => Math.max(0.75, Math.min(2.5, value));
try {
  const prefs = JSON.parse(localStorage.getItem('crokinole-table') || '{}');
  if (typeof prefs.volume === 'number' && Number.isFinite(prefs.volume)) volume = Math.max(0, Math.min(1, prefs.volume));
  if (typeof prefs.zoom === 'number' && Number.isFinite(prefs.zoom)) zoom = clampZoom(prefs.zoom);
  muted = prefs.muted === true;
  if (prefs.view === 'seated') view = 'seated';
  if (prefs.theme === 'dark') theme = 'dark';
} catch { /* Preferences are optional. */ }
document.body.dataset.theme = theme;
function tablePreferences() {
  sound.setPreferences(volume, muted);
  scene?.setTheme(theme);
  document.body.dataset.theme = theme;
  $('sound-toggle').textContent = muted || volume === 0 ? 'Sound off' : 'Sound on';
  $('sound-toggle').setAttribute('aria-pressed', String(muted));
  $('sound-toggle').setAttribute('aria-label', muted || volume === 0 ? 'Enable sound' : 'Mute sound');
  $<HTMLInputElement>('volume').value = String(Math.round(volume * 100));
  $('volume-value').textContent = `${Math.round(volume * 100)}%`;
  $<HTMLInputElement>('theme-toggle').checked = theme === 'dark';
  for (const name of ['seated', 'standing']) $(`view-${name}`).setAttribute('aria-pressed', String(view === name));
  try { localStorage.setItem('crokinole-table', JSON.stringify({ volume, muted, view, zoom, theme })); } catch { /* optional */ }
}
async function unlockSound() {
  if (!await sound.unlock()) $('sound-note').textContent = 'Audio could not start. Tap Preview sounds to try again.';
}
// Gesture listeners also recover audio after returning from a background tab.
document.addEventListener('pointerdown', () => { void unlockSound(); }, { passive: true });
document.addEventListener('keydown', () => { void unlockSound(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) sound.suspend(); });
$('sound-toggle').addEventListener('click', () => {
  if (muted || volume === 0) { muted = false; if (volume === 0) volume = 0.65; } else muted = true;
  tablePreferences();
});
$<HTMLInputElement>('volume').addEventListener('input', e => {
  volume = Number((e.target as HTMLInputElement).value) / 100; muted = false; tablePreferences();
});
$<HTMLInputElement>('theme-toggle').addEventListener('change', e => {
  theme = (e.target as HTMLInputElement).checked ? 'dark' : 'light'; tablePreferences();
});
$('sound-preview').addEventListener('click', async () => {
  if (muted || volume === 0) { $('sound-note').textContent = 'Enable sound and raise the volume to hear the preview.'; return; }
  const button = $<HTMLButtonElement>('sound-preview'); button.disabled = true;
  const ok = await sound.preview();
  $('sound-note').textContent = ok ? 'Soft / medium / firm wood clicks · peg · twenty · ditch' : 'Audio unavailable. Try another browser or enable audio for this site.';
  window.setTimeout(() => { button.disabled = false; }, 2500);
});
const names = ['Coral', 'Blue', 'Gold', 'Sage'];
const colors = ['#dc6853', '#6cabbe', '#e7b95c', '#94ad76'];
let scene: ReturnType<typeof createScene>;
try { scene = createScene(canvas); } catch {
  banner.textContent = 'This table needs WebGL'; hint.textContent = 'Try a browser with hardware acceleration enabled.'; next.hidden = true;
  throw new Error('WebGL could not initialize');
}
scene.setView(view); scene.setZoom(zoom); tablePreferences();
for (const name of ['seated', 'standing'] as const) $(`view-${name}`).addEventListener('click', () => {
  if (phase !== 'pass' || pointer !== null || orbitPointer !== null || pinching) return;
  setBoardView(name);
});
let mode: Mode = 'duel', player = 0, round = 1, id = 0;
let discs: Disc[] = [], scores = [0, 0], used = [0, 0], phase: 'pass' | 'aim' | 'moving' | 'review' | 'round' | 'won' = 'pass';
let restoredEnd: 'review' | 'round' | 'won' | null = null;
let review: ShotReview | null = null, roundResult: RoundResult | null = null;
let shotSeconds = 60, deadline: number | null = null;
try {
  const saved = Number(localStorage.getItem('crokinole-clock') ?? 60);
  if ([0, 30, 60].includes(saved)) shotSeconds = saved;
} catch { /* optional */ }
const clockLabel = document.createElement('span');
clockLabel.id = 'shot-clock'; clockLabel.setAttribute('role', 'timer');
$('round-label').after(clockLabel);
const clockSetting = document.createElement('label');
clockSetting.textContent = 'Shot clock (applies next turn)';
const clockSelect = document.createElement('select'); clockSelect.id = 'shot-clock-setting';
clockSelect.innerHTML = '<option value="60">60 seconds</option><option value="30">30 seconds</option><option value="0">Off</option>';
clockSelect.value = String(shotSeconds); clockSetting.append(clockSelect);
$('mode').parentElement!.after(clockSetting);
clockSelect.addEventListener('change', () => {
  shotSeconds = Number(clockSelect.value);
  try { localStorage.setItem('crokinole-clock', String(shotSeconds)); } catch { /* optional */ }
});
let shot: Shot | null = null, hadOpponent = false, staged: Disc | null = null, readyAt = 0;
const count = () => mode === 'duel' ? 2 : 4;
const allowance = () => mode === 'duel' ? 12 : 6;
const yaw = () => player * Math.PI * 2 / count();
const side = (owner: number) => sideOf(mode, owner);
const label = (i: number) => mode === 'teams' ? ['Coral + Gold', 'Blue + Sage'][i] : names[i];
function save() {
  try { localStorage.setItem('crokinole-match', JSON.stringify({ mode, player, round, id, discs: discs.filter(d => d !== staged || phase !== 'aim' && phase !== 'pass'), scores, used, phase: phase === 'aim' ? 'pass' : phase, review, roundResult, deadline })); } catch { /* Storage is optional. */ }
}
let scoreboardExpanded = false, roundBoardFocus = false;
const eyeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.2 12s3.6-6 9.8-6 9.8 6 9.8 6-3.6 6-9.8 6-9.8-6-9.8-6Z"></path><circle cx="12" cy="12" r="2.6"></circle></svg>';
function hud() {
  const scoreboard = $('scoreboard');
  scoreboard.dataset.expanded = String(scoreboardExpanded);
  const cards = scores.map((score, i) => `<div class="score ${side(player) === i ? 'active' : ''}" data-score-card role="button" tabindex="0" aria-expanded="${scoreboardExpanded}" aria-label="${scoreboardExpanded ? 'Show compact scores' : 'Show full scores'}" style="--player:${colors[i]}"><span class="dot"></span><div><span class="name">${label(i)}</span><small>${discs.filter(d => side(d.owner) === i && d.state === 'sunk').length} twenties this round</small><small>${mode === 'teams' ? used.filter((_, p) => side(p) === i).reduce((a, b) => a + b, 0) : used[i]}/${mode === 'ffa' ? 6 : 12} played</small></div><div class="match-total"><strong>${score}</strong><small>Match</small></div></div>`).join('');
  scoreboard.innerHTML = cards;
  $('round-label').textContent = `ROUND ${round} · FIRST TO 100`;
  assignDitchSlots(discs);
  scene.syncDiscs(discs, review);
  const summary = $('round-summary');
  summary.hidden = !roundResult;
  if (roundResult) {
    summary.dataset.boardFocus = String(roundBoardFocus);
    summary.innerHTML = `<div class="summary-heading"><h2>Round ${round} · score breakdown</h2><button class="round-board-toggle" type="button" aria-expanded="${!roundBoardFocus}" aria-label="${roundBoardFocus ? 'Show round scores' : 'Show game board'}">${eyeIcon}</button></div><table><thead><tr><th scope="col">Side</th><th scope="col">20s</th><th scope="col">15s</th><th scope="col">10s</th><th scope="col">5s</th><th scope="col">Total</th><th scope="col">Added</th></tr></thead><tbody>${roundResult.sides.map((row, i) => `<tr><th scope="row">${label(i)}</th><td>${row.twenties}</td><td>${row.fifteens}</td><td>${row.tens}</td><td>${row.fives}</td><td>${row.total}</td><td><strong>+${row.awarded}</strong></td></tr>`).join('')}</tbody></table><p>Disc counts × ring value = total. ${mode === 'ffa' ? 'Each player adds their own total.' : 'Only the difference is added to the winning side.'}</p>`;
  } else summary.dataset.boardFocus = 'false';
}
$('scoreboard').addEventListener('click', event => {
  if (!(event.target as HTMLElement).closest('[data-score-card]')) return;
  scoreboardExpanded = !scoreboardExpanded; hud();
});
$('scoreboard').addEventListener('keydown', event => {
  if ((event.key !== 'Enter' && event.key !== ' ') || !(event.target as HTMLElement).closest('[data-score-card]')) return;
  event.preventDefault(); scoreboardExpanded = !scoreboardExpanded; hud();
});
$('round-summary').addEventListener('click', event => {
  if (!(event.target as HTMLElement).closest('.round-board-toggle')) return;
  roundBoardFocus = !roundBoardFocus; hud();
});
function pass(message = '', restoreClock = false) {
  phase = 'pass'; staged = null;
  if (!restoreClock) deadline = shotSeconds ? Date.now() + 850 + shotSeconds * 1000 : null;
  scene.setYawTarget(yaw()); readyAt = performance.now() + 850;
  banner.textContent = `${message ? message + ' · ' : ''}Pass to ${names[player]}`;
  hint.textContent = 'Drag to adjust the view within your quadrant, then tap ready.';
  next.textContent = 'Ready to shoot'; next.hidden = false; hud(); save();
}
function start() {
  mode = $<HTMLSelectElement>('mode').value as Mode;
  player = 0; round = 1; id = 0; discs = []; scores = Array(mode === 'ffa' ? 4 : 2).fill(0); used = Array(count()).fill(0);
  review = null; roundResult = null;
  settings.close(); pass();
}
function nextRound() {
  round++; discs = []; used.fill(0); player = (round - 1) % count();
  roundResult = null; pass();
}
function setBoardView(nextView: BoardView) {
  view = nextView; scene.setView(view); tablePreferences();
  if (phase === 'aim') shotInstructions();
}
function shotInstructions() {
  next.hidden = false;
  next.textContent = 'Adjust view';
  if (view === 'standing') {
    banner.textContent = `${names[player]}, look over the board`;
    hint.textContent = 'Take a seat when you’re ready to flick.';
    next.textContent = 'Sit down to shoot';
  } else {
    banner.textContent = `${names[player]}, your shot`;
    const opponent = discs.some(d => d.state === 'board' && side(d.owner) !== side(player));
    hint.textContent = opponent ? 'View locked. Flick your disc to hit an opponent’s disc.' : 'View locked. Flick gently toward the center and finish in the inner ring.';
  }
}
function stage() {
  if (performance.now() < readyAt || orbitPointer !== null || pinching) return;
  if (!staged) {
    staged = makeDisc(++id, player, Math.sin(yaw()) * 12, Math.cos(yaw()) * 12);
    discs.push(staged);
  }
  phase = 'aim'; setBoardView('seated');
  hud();
}
next.addEventListener('click', () => {
  if (phase === 'aim') {
    cancel(); phase = 'pass';
    banner.textContent = `${names[player]}, adjust your view`;
    hint.textContent = 'Drag within your quadrant, then tap ready. Your disc stays in place.';
    next.textContent = 'Ready to shoot'; hud();
  }
  else if (phase === 'pass') stage();
  else if (phase === 'round') nextRound();
  else if (phase === 'won') start();
});
$('settings-button').addEventListener('click', () => settings.showModal());
$('new-game').addEventListener('click', start);
const skin = $<HTMLSelectElement>('skin');
let artworkVersion = 0;
function removeArtwork() {
  artworkVersion++;
  scene.setSkin(skin.value);
  $<HTMLInputElement>('art').value = '';
  $<HTMLButtonElement>('remove-art').disabled = true;
  try { localStorage.removeItem('crokinole-art'); } catch { /* optional */ }
  $('settings-note').textContent = 'Artwork removed. Your board finish is restored.';
}
$('remove-art').addEventListener('click', removeArtwork);
skin.addEventListener('change', () => {
  removeArtwork();
  try { localStorage.setItem('crokinole-skin', skin.value); } catch { /* optional */ }
});
$<HTMLInputElement>('art').addEventListener('change', async e => {
  const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
  if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) { $('settings-note').textContent = 'Choose an image smaller than 10 MB.'; return; }
  const version = ++artworkVersion;
  $<HTMLButtonElement>('remove-art').disabled = false;
  const url = URL.createObjectURL(file), image = new Image();
  image.onload = () => {
    if (version !== artworkVersion) { URL.revokeObjectURL(url); return; }
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
let orbitPointer: number | null = null;
let orbitLast = { x: 0, y: 0 };
function cancelOrbit() { orbitPointer = null; }
let trail: { x: number; y: number; t: number }[] = [];
let press = { x: 0, y: 0 };
function placeAt(clientX: number, clientY: number) {
  if (!staged) return;
  // Placement targets the painted surface, not the elevated flick plane.
  const p = scene.boardPoint(clientX, clientY, 0); if (!p) return;
  const a = Math.atan2(p.x, p.y), delta = Math.atan2(Math.sin(a - yaw()), Math.cos(a - yaw()));
  if (Math.abs(delta) > Math.PI / 4 - 0.06 || Math.abs(Math.hypot(p.x, p.y) - 12) > 0.9) return;
  const x = Math.sin(a) * 12, y = Math.cos(a) * 12;
  if (!discs.some(d => d !== staged && d.state === 'board' && Math.hypot(d.x - x, d.y - y) < 1.3)) {
    staged.x = x; staged.y = y; hud();
  } else hint.textContent = 'That spot is occupied. Tap a clear spot on your shooting line.';
}
const touches = new Map<number, { x: number; y: number }>();
let pinching = false, pinchDistance = 0;
function touchDistance() {
  const [a, b] = [...touches.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}
function setZoom(value: number) {
  if (phase !== 'pass' || pointer !== null || orbitPointer !== null || settings.open) return;
  zoom = clampZoom(value); scene.setZoom(zoom); tablePreferences();
}
$('view-center').addEventListener('click', () => { if (phase === 'pass' && orbitPointer === null && !pinching) scene.centerView(); });
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (touches.size >= 2) {
      cancel(); cancelOrbit(); pinching = true; pinchDistance = touchDistance();
      return;
    }
    if (pinching) return;
  }
  if (phase === 'pass' && !settings.open && performance.now() >= readyAt && orbitPointer === null && (e.pointerType === 'touch' || e.button === 0)) {
    orbitPointer = e.pointerId; orbitLast = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (view !== 'seated' || phase !== 'aim' || !staged || pointer !== null || settings.open || scene.isViewMoving()) return;
  const p = scene.boardPoint(e.clientX, e.clientY); if (!p) return;
  if (Math.hypot(p.x - staged.x, p.y - staged.y) > 1.4) {
    placeAt(e.clientX, e.clientY);
    return;
  }
  press = { x: e.clientX, y: e.clientY };
  pointer = e.pointerId; trail = [{ ...p, t: performance.now() }]; canvas.setPointerCapture(pointer);
});
canvas.addEventListener('pointermove', e => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinching) {
    const distance = touchDistance();
    if (pinchDistance > 10 && distance > 10) setZoom(zoom * distance / pinchDistance);
    pinchDistance = distance;
    return;
  }
  if (e.pointerId === orbitPointer) {
    if (phase === 'pass' && !settings.open) scene.dragView(
      (e.clientX - orbitLast.x) / canvas.clientWidth * Math.PI,
      (e.clientY - orbitLast.y) / canvas.clientHeight,
    );
    orbitLast = { x: e.clientX, y: e.clientY };
    return;
  }
  if (e.pointerId !== pointer) return;
  const p = scene.boardPoint(e.clientX, e.clientY); if (!p) return;
  const t = performance.now(); trail.push({ ...p, t }); trail = trail.filter(p => t - p.t < 110);
});
function cancel() { pointer = null; trail = []; }
function endPointer(e: PointerEvent) {
  touches.delete(e.pointerId);
  if (touches.size === 0) { pinching = false; pinchDistance = 0; }
  if (pointer === e.pointerId) cancel();
  if (orbitPointer === e.pointerId) cancelOrbit();
}
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', endPointer);
window.addEventListener('blur', () => { cancel(); cancelOrbit(); touches.clear(); pinching = false; pinchDistance = 0; });
canvas.addEventListener('pointerup', e => {
  if (e.pointerId === orbitPointer) { endPointer(e); return; }
  const wasPinching = pinching;
  touches.delete(e.pointerId);
  if (wasPinching) {
    endPointer(e); cancel();
    return;
  }
  if (view !== 'seated' || scene.isViewMoving() || e.pointerId !== pointer || !staged || phase !== 'aim') return;
  if (deadline !== null && Date.now() >= deadline) { expireShot(); return; }
  const p = scene.boardPoint(e.clientX, e.clientY), t = performance.now();
  const first = trail.find(sample => t - sample.t <= 120);
  cancel(); if (!p || !first) return;
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) { placeAt(e.clientX, e.clientY); return; }
  const seconds = Math.max(0.016, (t - first.t) / 1000);
  let vx = (p.x - first.x) / seconds, vy = (p.y - first.y) / seconds;
  const speed = Math.hypot(vx, vy); if (speed < 3) { hint.textContent = 'Try a quicker flick from your disc.'; return; }
  const power = Math.min(105, speed * 0.8 + 12) / speed; vx *= power; vy *= power;
  hadOpponent = discs.some(d => d.state === 'board' && side(d.owner) !== side(player));
  shot = { touched: new Set([staged.id]), opponentContact: false, side: side(player), sideOf: side };
  sound.play('flick', Math.hypot(vx, vy), staged.x, staged.y);
  staged.vx = vx; staged.vy = vy; used[player]++; phase = 'moving';
  banner.textContent = 'Let it slide'; hint.textContent = 'Waiting for the board to settle…'; hud();
});
function finishShot() {
  review = beginReview(discs, inspectShot(discs, shot!, hadOpponent)); shot = null;
  phase = 'review'; next.hidden = true;
  reviewMessage(); hud(); save();
}
function expireShot() {
  cancel(); cancelOrbit(); touches.clear(); pinching = false;
  if (!staged) {
    staged = makeDisc(++id, player, Math.sin(yaw()) * 12, Math.cos(yaw()) * 12);
    discs.push(staged);
  }
  used[player]++;
  review = beginReview(discs, { valid: true, reason: null, foulIds: [], removalIds: [staged.id], revokedTwenties: 0 });
  deadline = null; phase = 'review'; next.hidden = true;
  banner.textContent = 'Time expired';
  hint.textContent = 'Shot forfeited. The unplayed disc moves to the ditch.';
  hud(); save();
}
function reviewMessage() {
  if (!review) return;
  const { verdict, removed } = review;
  banner.textContent = verdict.valid ? 'Shot complete' : 'Foul';
  const reason = verdict.reason === 'opponent-missed' ? 'No opponent disc hit.' : verdict.reason === 'inner-ring-missed' ? 'No involved disc finished in the inner ring or twenty hole.' : '';
  const removal = removed.length ? `${removed.length} disc${removed.length === 1 ? '' : 's'} ${removed.length === 1 ? 'moves' : 'move'} to the ditch.` : 'Take a moment to see where everything landed.';
  const revoked = verdict.revokedTwenties ? ` ${verdict.revokedTwenties} twenty${verdict.revokedTwenties === 1 ? '' : ' scores'} cancelled.` : '';
  hint.textContent = `${reason} ${removal}${revoked}`.trim();
}
function finishReview() {
  const valid = review!.verdict.valid;
  review = null;
  if (used.every(n => n === allowance())) {
    roundResult = completeRound(discs, mode, scores); scores = roundResult.after;
    phase = roundResult.winner !== null ? 'won' : 'round';
    banner.textContent = roundResult.winner !== null ? `${label(roundResult.winner)} wins!` : 'Round complete';
    hint.textContent = roundResult.sides.map((row, i) => `${label(i)} +${row.awarded}`).join(' · ');
    next.textContent = phase === 'won' ? 'Play again' : 'Next round'; next.hidden = false; hud(); save();
  } else { player = (player + 1) % count(); pass(valid ? '' : 'Foul resolved'); }
}
let last = performance.now(), accumulator = 0;
function tick(now: number) {
  const awaitingShot = phase === 'pass' || phase === 'aim';
  if (awaitingShot && deadline !== null && Date.now() >= deadline) expireShot();
  clockLabel.hidden = !awaitingShot;
  const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  clockLabel.textContent = remaining === null ? ' · Clock off' : ` · ${remaining}s`;
  clockLabel.classList.toggle('urgent', remaining !== null && remaining <= 10);
  const elapsed = Math.min((now - last) / 1000, 0.25);
  const dt = Math.min(elapsed, 0.05); last = now;
  accumulator += dt;
  while (accumulator >= 1 / 120) {
    if (phase === 'moving' && shot) { step(discs, 1 / 120, shot, true, sound.impact); if (!discs.some(moving)) finishShot(); }
    accumulator -= 1 / 120;
  }
  if (!document.hidden && !settings.open) {
    if (phase === 'review' && review) {
      review.elapsed += elapsed * 1000;
      if (review.elapsed >= reviewDuration(review)) finishReview();
    }
  }
  next.disabled = phase === 'pass' && (now < readyAt || orbitPointer !== null || pinching);
  sound.setListenerYaw(scene.getYaw());
  const controlsLocked = phase !== 'pass' || pointer !== null || orbitPointer !== null || pinching;
  canvas.classList.toggle('can-orbit', phase === 'pass');
  canvas.classList.toggle('is-orbiting', orbitPointer !== null);
  $<HTMLButtonElement>('view-center').disabled = controlsLocked;
  for (const name of ['seated', 'standing']) $<HTMLButtonElement>(`view-${name}`).disabled = controlsLocked;
  assignDitchSlots(discs);
  scene.syncDiscs(discs, review); requestAnimationFrame(tick);
}
try {
  const savedSkin = localStorage.getItem('crokinole-skin'); if (savedSkin && ['maple', 'walnut', 'slate'].includes(savedSkin)) { skin.value = savedSkin; scene.setSkin(savedSkin); }
  const art = localStorage.getItem('crokinole-art'); if (art) { const version = ++artworkVersion; const image = new Image(); $<HTMLButtonElement>('remove-art').disabled = false; image.onload = () => { if (version === artworkVersion) scene.setSkin(skin.value, image); }; image.src = art; }
  const raw = localStorage.getItem('crokinole-match');
  if (raw) {
    const data = JSON.parse(raw);
    if (['duel', 'teams', 'ffa'].includes(data.mode) && ['pass', 'review', 'round', 'won'].includes(data.phase) && Array.isArray(data.discs) && Array.isArray(data.scores) && Array.isArray(data.used)) {
      mode = data.mode; player = data.player; round = data.round; id = data.id; discs = data.discs; scores = data.scores; used = data.used;
      deadline = typeof data.deadline === 'number' && Number.isFinite(data.deadline) ? data.deadline : null;
      $<HTMLSelectElement>('mode').value = mode;
      roundResult = data.roundResult ?? null;
      if (data.phase === 'review' && data.review && Array.isArray(data.review.removed)) { review = data.review; review!.elapsed = 0; restoredEnd = 'review'; }
      if (data.phase === 'round' || data.phase === 'won') restoredEnd = data.phase;
    }
  }
} catch { /* Start fresh if storage is unavailable. */ }
if (restoredEnd) {
  phase = restoredEnd; scene.setYawTarget(yaw()); hud();
  if (phase === 'review') { next.hidden = true; reviewMessage(); }
  else {
    banner.textContent = phase === 'won' ? `${label(scores.indexOf(Math.max(...scores)))} wins!` : 'Round complete';
    hint.textContent = 'Your table has been restored.';
    next.textContent = phase === 'won' ? 'Play again' : 'Next round';
  }
} else pass('', deadline !== null);
requestAnimationFrame(tick);
