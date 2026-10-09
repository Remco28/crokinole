import { setupBoardArtwork } from './board-artwork';
import { setupDiscSettings } from './disc-settings';
import { BoardSound } from './audio/sound';
import { appendFlickContactSample, canStartFlick, finalizeFlickContact, releaseShot, shouldRotateInstead, updateFlickContact, type FlickContact } from './game/flick';
import { pointerMoveSamples } from './game/pointer';
import { createScene, SHOT_VIEW, TILT, isSeated, nearestStop, type CameraStop } from './render/scene';
import { makeDisc, moving, step, type Disc, type Shot } from './sim/physics';
import { completeRound, inspectShot, sideOf, type Mode, type RoundResult } from './game/rules';
import { assignDitchSlots, beginReview, reviewDuration, type ShotReview } from './game/review';
import { PLAYER_NAMES as names, PLAYER_COLORS as colors } from './game/players';
import { remainingTime, resumeDeadline } from './game/clock';
import { MATCH_STORAGE_KEY, readMatch, type Phase, type SavedMatch } from './game/session';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('board-canvas');
// A long press on the board is a context-menu gesture on desktop and mobile.
// It interrupts flicks and view drags, so keep the board surface menu-free.
canvas.addEventListener('contextmenu', event => event.preventDefault());
const banner = $('turn-banner'), hint = $('hint'), next = $<HTMLButtonElement>('continue');
const settings = $<HTMLDialogElement>('settings');
const pauseDialog = $<HTMLDialogElement>('pause-dialog');
let paused = false, pausedRemaining: number | null = null;
const sound = new BoardSound();
const DEFAULT_ZOOM = 1.2;
let volume = 0.65, muted = false, tilt: number = TILT.overview, zoom = DEFAULT_ZOOM, theme: 'light' | 'dark' = 'light', activeDiscHighlight = true;
const clampZoom = (value: number) => Math.max(0.75, Math.min(SHOT_VIEW.maxZoom, value));
// Flicks are measured in board inches, so the same finger or mouse movement
// would shoot harder on a small screen or in a foreshortened view and softer
// when zoomed in. Convert by screen pixels per board inch at the disc instead,
// so every device, view and zoom gives the same power for the same movement.
// Touch screens get a small boost: their CSS pixels are physically smaller, so
// the same finger travel covers fewer of them than a mouse on a monitor.
const REFERENCE_PIXELS_PER_INCH = 30;
const TOUCH_POWER = window.matchMedia('(pointer: coarse)').matches ? 1.15 : 1;
function flickSpeedScale(direction: { x: number; y: number }) {
  return staged ? scene.pixelsPerInch(staged, direction) / REFERENCE_PIXELS_PER_INCH * TOUCH_POWER : 1;
}
const inward = (disc: { x: number; y: number }) => {
  const radius = Math.hypot(disc.x, disc.y) || 1;
  return { x: -disc.x / radius, y: -disc.y / radius };
};
try {
  const prefs = JSON.parse(localStorage.getItem('crokinole-table') || '{}');
  if (typeof prefs.volume === 'number' && Number.isFinite(prefs.volume)) volume = Math.max(0, Math.min(1, prefs.volume));
  if (typeof prefs.zoom === 'number' && Number.isFinite(prefs.zoom)) zoom = clampZoom(prefs.zoom);
  muted = prefs.muted === true;
  if (typeof prefs.activeDiscHighlight === 'boolean') activeDiscHighlight = prefs.activeDiscHighlight;
  if (typeof prefs.tilt === 'number' && Number.isFinite(prefs.tilt)) tilt = Math.max(TILT.min, Math.min(TILT.max, prefs.tilt * Math.PI / 180));
  else if (prefs.view === 'seated') tilt = TILT.table;
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
  $<HTMLInputElement>('active-disc-highlight').checked = activeDiscHighlight;
  scene?.setActiveDiscHighlight(activeDiscHighlight);
  if (scene) tilt = scene.getTilt();
  // view is kept for older builds that only know standing and seated.
  const view = tilt >= TILT.table - 0.01 ? 'seated' : 'standing', tiltDegrees = Math.round(tilt * 1800 / Math.PI) / 10;
  try { localStorage.setItem('crokinole-table', JSON.stringify({ volume, muted, view, tilt: tiltDegrees, zoom, theme, activeDiscHighlight })); } catch { /* optional */ }
}
const activeDiscHighlightSetting = document.createElement('label');
activeDiscHighlightSetting.className = 'theme-setting';
activeDiscHighlightSetting.innerHTML = '<input id="active-disc-highlight" type="checkbox" checked><span>Blink active disc<small>Two quick flashes each turn, then a thin outline. Turn off for a natural board.</small></span>';
$('theme-toggle').parentElement!.after(activeDiscHighlightSetting);
async function unlockSound() {
  if (paused) return;
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
$<HTMLInputElement>('active-disc-highlight').addEventListener('change', e => {
  activeDiscHighlight = (e.target as HTMLInputElement).checked; tablePreferences();
});
$('sound-preview').addEventListener('click', async () => {
  if (muted || volume === 0) { $('sound-note').textContent = 'Enable sound and raise the volume to hear the preview.'; return; }
  const button = $<HTMLButtonElement>('sound-preview'); button.disabled = true;
  const ok = await sound.preview();
  $('sound-note').textContent = ok ? 'Soft / medium / firm wood clicks · peg · twenty · ditch' : 'Audio unavailable. Try another browser or enable audio for this site.';
  window.setTimeout(() => { button.disabled = false; }, 2500);
});
let scene: ReturnType<typeof createScene>;
try { scene = createScene(canvas); } catch {
  banner.textContent = 'This table needs WebGL'; hint.textContent = 'Try a browser with hardware acceleration enabled.'; next.hidden = true;
  throw new Error('WebGL could not initialize');
}
scene.setTilt(tilt); scene.setZoom(zoom); tablePreferences();
setupDiscSettings(scene);
const cameraStops = ['overview', 'table', 'shooter'] as const;
for (const stop of cameraStops) $(`camera-${stop}`).addEventListener('click', () => goToStop(stop));
let mode: Mode = 'duel', player = 0, round = 1, id = 0;
let discs: Disc[] = [], scores = [0, 0], used = [0, 0], phase: Phase = 'pass';
let restored = false, winnerDismissed = false;
const canInspectBoard = () => phase === 'pass' || phase === 'round' || (phase === 'won' && winnerDismissed);
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
const label = (i: number) => mode === 'teams' ? [`${names[0]} + ${names[2]}`, `${names[1]} + ${names[3]}`][i] : names[i];
function save() {
  const snapshot: SavedMatch = { version: 2, mode, player, round, id, discs, scores, used, phase, review, roundResult, winnerDismissed, deadline, paused, remaining: pausedRemaining, stagedId: staged?.id ?? null, hadOpponent, shot: shot ? { touched: [...shot.touched], opponentContact: shot.opponentContact, side: shot.side } : null };
  try { localStorage.setItem(MATCH_STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* Storage is optional. */ }
}
function pauseGame() {
  if (paused || phase === 'won') return;
  pausedRemaining = remainingTime(deadline, Date.now()); paused = true;
  cancel(); cancelOrbit(); placementPointer = null; touches.clear(); pinching = false; pinchDistance = 0;
  scene.setPaused(true); sound.suspend(); save(); pauseDialog.showModal();
}
function resumeGame() {
  deadline = resumeDeadline(pausedRemaining, Date.now()); paused = false;
  last = performance.now(); accumulator = 0;
  scene.setPaused(false); pauseDialog.close(); save();
  void unlockSound();
}
$('pause-button').addEventListener('click', pauseGame);
$('resume-game').addEventListener('click', resumeGame);
pauseDialog.addEventListener('cancel', event => { event.preventDefault(); resumeGame(); });
window.addEventListener('pagehide', save);
let scoreboardExpanded = false, roundBoardFocus = false;
const eyeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.2 12s3.6-6 9.8-6 9.8 6 9.8 6-3.6 6-9.8 6-9.8-6-9.8-6Z"></path><circle cx="12" cy="12" r="2.6"></circle></svg>';
function hud() {
  const scoreboard = $('scoreboard');
  scoreboard.dataset.expanded = String(scoreboardExpanded);
  scoreboard.style.setProperty('--sides', String(scores.length));
  $('score-details').setAttribute('aria-expanded', String(scoreboardExpanded));
  scoreboard.innerHTML = scores.map((score, i) => {
    const twenties = discs.filter(d => side(d.owner) === i && d.state === 'sunk').length;
    const played = mode === 'teams' ? used.filter((_, p) => side(p) === i).reduce((a, b) => a + b, 0) : used[i];
    return `<button type="button" class="score ${side(player) === i ? 'active' : ''}" data-score-card="${i}" aria-expanded="${scoreboardExpanded}" aria-label="${label(i)}, ${score} match points${side(player) === i ? ', current turn' : ''}. ${scoreboardExpanded ? 'Hide' : 'Show'} details" style="--player:${colors[i]}"><span class="score-identity"><span class="dot"></span><span class="name">${label(i)}</span></span><span class="match-total"><strong>${score}</strong><small>pts</small></span><span class="score-stats"><small><span>Twenties</span><b>${twenties}</b></small><small><span>Played</span><b>${played} / ${mode === 'ffa' ? 6 : 12}</b></small></span></button>`;
  }).join('');
  $('round-label').textContent = `ROUND ${round} · FIRST TO 100`;
  assignDitchSlots(discs);
  scene.syncDiscs(discs, review);
  const summary = $('round-summary');
  summary.hidden = !roundResult;
  if (roundResult) {
    summary.dataset.boardFocus = String(roundBoardFocus);
    summary.innerHTML = `<div class="summary-heading"><h2>Round ${round} · score breakdown</h2><button class="round-board-toggle" type="button" aria-expanded="${!roundBoardFocus}" aria-label="${roundBoardFocus ? 'Show round scores' : 'Show game board'}">${eyeIcon}</button></div><table><thead><tr><th scope="col">Side</th><th scope="col">20s</th><th scope="col">15s</th><th scope="col">10s</th><th scope="col">5s</th><th scope="col">Total</th><th scope="col">Added</th></tr></thead><tbody>${roundResult.sides.map((row, i) => `<tr><th scope="row">${label(i)}</th><td>${row.twenties}</td><td>${row.fifteens}</td><td>${row.tens}</td><td>${row.fives}</td><td>${row.total}</td><td><strong>+${row.awarded}</strong></td></tr>`).join('')}</tbody></table><p>Disc counts × ring value = total. ${mode === 'ffa' ? 'Each player adds their own total.' : 'Only the difference is added to the winning side.'}</p>`;
  } else summary.dataset.boardFocus = 'false';
  winnerPresentation();
}
$('scoreboard').addEventListener('click', event => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('[data-score-card]');
  if (!card) return;
  scoreboardExpanded = !scoreboardExpanded; hud();
  document.querySelector<HTMLElement>(`[data-score-card="${card.dataset.scoreCard}"]`)?.focus({ preventScroll: true });
});
$('score-details').addEventListener('click', () => {
  scoreboardExpanded = !scoreboardExpanded; hud();
});
$('round-summary').addEventListener('click', event => {
  if (!(event.target as HTMLElement).closest('.round-board-toggle')) return;
  roundBoardFocus = !roundBoardFocus; hud();
});
function pass(message = '', restoreClock = false) {
  scene.highlightDisc(null);
  for (const d of discs) if (d.state === 'sunk') d.holeCleared = true;
  phase = 'pass';
  if (!restoreClock || !staged) {
    const offsets = [0, ...Array.from({ length: 12 }, (_, i) => (i + 1) * Math.PI / 48).flatMap(a => [a, -a])];
    const angle = yaw() + (offsets.find(offset => {
      const x = Math.sin(yaw() + offset) * 12, y = Math.cos(yaw() + offset) * 12;
      return !discs.some(d => d.state === 'board' && Math.hypot(d.x - x, d.y - y) < 1.3);
    }) ?? 0);
    staged = makeDisc(++id, player, Math.sin(angle) * 12, Math.cos(angle) * 12);
    discs.push(staged);
  }
  if (!restoreClock) deadline = shotSeconds ? Date.now() + 850 + shotSeconds * 1000 : null;
  sitDown(); scene.setYawTarget(yaw()); readyAt = performance.now() + 850;
  banner.textContent = `${message ? message + ' · ' : ''}It's ${names[player]}'s turn`;
  hint.textContent = 'Tap the shooting line to move your disc. Drag elsewhere to look around; flick through your disc to shoot.';
  next.hidden = true; scene.highlightDisc(staged.id); hud(); save();
}
function start() {
  mode = $<HTMLSelectElement>('mode').value as Mode;
  player = 0; round = 1; id = 0; discs = []; scores = Array(mode === 'ffa' ? 4 : 2).fill(0); used = Array(count()).fill(0);
  review = null; roundResult = null; shot = null; roundBoardFocus = false; winnerDismissed = false;
  settings.close(); pass();
}
function nextRound() {
  round++; discs = []; used.fill(0); player = (round - 1) % count();
  roundResult = null; roundBoardFocus = false; pass();
}
// Stops are shortcuts on one continuous camera path. Tapping the stop you are
// already at re-centers it on your quadrant.
function goToStop(stop: CameraStop) {
  if (!canInspectBoard() || pointer !== null || orbitPointer !== null || placementPointer !== null || pinching || settings.open) return;
  if (stop === 'shooter' && phase !== 'pass') return;
  const again = nearestStop(scene.getTargetLevel()) === stop;
  // Collapse after choosing, but keep the rail up while the camera glides there.
  railOpen = false; cameraMovedAt = performance.now();
  setZoom(stop === 'shooter' ? SHOT_VIEW.maxZoom : Math.min(zoom, DEFAULT_ZOOM));
  scene.setTilt(stop === 'overview' ? TILT.overview : TILT.table);
  if (again) scene.centerView();
  tablePreferences();
}
// The one-cheek rule: shots are taken seated. Standing players sit down first.
function sitDown() {
  if (isSeated(scene.getTargetLevel())) return;
  scene.setTilt(TILT.table); tablePreferences();
}
next.addEventListener('click', () => {
  if (paused) return;
  if (phase === 'round') nextRound();
  else if (phase === 'won') start();
});

function winnerPresentation() {
  const won = phase === 'won' && roundResult?.winner != null;
  $('winner-overlay').hidden = !won || winnerDismissed;
  $('show-winner').hidden = !won || !winnerDismissed;
  if (!won) return;
  const winner = roundResult!.winner!;
  const title = `${label(winner)} ${mode === 'teams' ? 'Win' : 'Wins'}!`;
  $('winner-title').textContent = title;
  $('winner-overlay').style.setProperty('--winner-color', colors[winner]);
  $('winner-result').textContent = `${scores.join('–')} · ${round} round${round === 1 ? '' : 's'}`;
}
$('inspect-board').addEventListener('click', () => {
  winnerDismissed = true; roundBoardFocus = true; hud(); save();
  requestAnimationFrame(() => $('camera-table').focus({ preventScroll: true }));
});
$('show-winner').addEventListener('click', () => {
  winnerDismissed = false; hud(); save(); $('inspect-board').focus({ preventScroll: true });
});
$('winner-new-game').addEventListener('click', start);
$('settings-button').addEventListener('click', () => settings.showModal());
$('new-game').addEventListener('click', start);
const skin = $<HTMLSelectElement>('skin');
let pointer: number | null = null;
let orbitPointer: number | null = null;
let orbitLast = { x: 0, y: 0 };
let placementPointer: number | null = null;
let placementPress = { x: 0, y: 0 };
function cancelOrbit() { orbitPointer = null; }
let trail: { x: number; y: number; t: number }[] = [];
let contactTrail: typeof trail = [];
let press = { x: 0, y: 0 };
let flickStart = { x: 0, y: 0 };
let discCrossed = false, flickContact: FlickContact | null = null;
function linePosition(clientX: number, clientY: number) {
  // Placement targets the painted surface, not the elevated flick plane.
  const p = scene.boardPoint(clientX, clientY, 0); if (!p) return null;
  const a = Math.atan2(p.x, p.y), delta = Math.atan2(Math.sin(a - yaw()), Math.cos(a - yaw()));
  // The quadrant borders are legal shooting positions. Accept a small touch
  // tolerance beyond the painted edge, then clamp onto the exact boundary.
  if (Math.abs(Math.hypot(p.x, p.y) - 12) > 1.25 || Math.abs(delta) > Math.PI / 4 + 0.08) return null;
  const legalDelta = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, delta));
  const legalAngle = yaw() + legalDelta;
  return { x: Math.sin(legalAngle) * 12, y: Math.cos(legalAngle) * 12 };
}
function placeAt(clientX: number, clientY: number) {
  if (!staged) return;
  const position = linePosition(clientX, clientY); if (!position) return;
  const { x, y } = position;
  if (!discs.some(d => d !== staged && d.state === 'board' && Math.hypot(d.x - x, d.y - y) < 1.3)) {
    staged.x = x; staged.y = y; hud(); save();
  } else hint.textContent = 'That spot is occupied. Tap a clear spot on your shooting line.';
}
const touches = new Map<number, { x: number; y: number }>();
let pinching = false, pinchDistance = 0;
function touchDistance() {
  const [a, b] = [...touches.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}
function setZoom(value: number) {
  if (paused || !canInspectBoard() || pointer !== null || orbitPointer !== null || settings.open) return;
  zoom = clampZoom(value); scene.setZoom(zoom); tablePreferences();
}
canvas.addEventListener('pointerdown', e => {
  if (paused) return;
  railOpen = false; // Touching the board puts an opened camera rail away.
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (touches.size >= 2) {
      cancel(); cancelOrbit(); placementPointer = null; pinching = true; pinchDistance = touchDistance();
      return;
    }
    if (pinching) return;
  }
  if (canInspectBoard() && !settings.open && (phase !== 'pass' || performance.now() >= readyAt) && orbitPointer === null && pointer === null && (e.pointerType === 'touch' || e.button === 0)) {
    const p = scene.boardPoint(e.clientX, e.clientY);
    if (phase === 'pass' && staged && p && !scene.isViewMoving() && canStartFlick(p, staged)) {
      // A standing player reaching for the disc sits down; the next touch shoots.
      if (!isSeated(scene.getTargetLevel())) { sitDown(); return; }
      pointer = e.pointerId; press = { x: e.clientX, y: e.clientY }; flickStart = p;
      discCrossed = false; flickContact = null;
      trail = [{ ...p, t: e.timeStamp }];
      contactTrail = [...trail];
    } else if (phase === 'pass' && linePosition(e.clientX, e.clientY)) {
      placementPointer = e.pointerId; placementPress = { x: e.clientX, y: e.clientY };
    } else {
      orbitPointer = e.pointerId; orbitLast = { x: e.clientX, y: e.clientY };
    }
    canvas.setPointerCapture(e.pointerId);
    return;
  }
});
canvas.addEventListener('pointermove', e => {
  if (paused) return;
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinching) {
    const distance = touchDistance();
    if (pinchDistance > 10 && distance > 10) setZoom(zoom * distance / pinchDistance);
    pinchDistance = distance;
    return;
  }
  if (e.pointerId === placementPointer) {
    if (Math.hypot(e.clientX - placementPress.x, e.clientY - placementPress.y) > 5) {
      placementPointer = null; orbitPointer = e.pointerId;
      scene.dragView((e.clientX - placementPress.x) / canvas.clientWidth * Math.PI,
        (e.clientY - placementPress.y) / canvas.clientHeight);
      orbitLast = { x: e.clientX, y: e.clientY };
    }
    return;
  }
  if (e.pointerId === orbitPointer) {
    if (canInspectBoard() && !settings.open) scene.dragView(
      (e.clientX - orbitLast.x) / canvas.clientWidth * Math.PI,
      (e.clientY - orbitLast.y) / canvas.clientHeight,
    );
    orbitLast = { x: e.clientX, y: e.clientY };
    return;
  }
  if (e.pointerId !== pointer) return;
  // Preserve the real near-impact path and event times when browsers batch moves.
  for (const sample of pointerMoveSamples(e)) {
    const p = scene.boardPoint(sample.clientX, sample.clientY);
    if (p) sampleFlick(p, sample.timeStamp);
  }
  const p = scene.boardPoint(e.clientX, e.clientY); if (!p) return;
  if (!discCrossed && staged && shouldRotateInstead(flickStart, p, staged)) {
    cancel(); orbitPointer = e.pointerId;
    scene.dragView((e.clientX - press.x) / canvas.clientWidth * Math.PI,
      (e.clientY - press.y) / canvas.clientHeight);
    orbitLast = { x: e.clientX, y: e.clientY };
  }
});
function sampleFlick(p: { x: number; y: number }, t: number) {
  if (phase !== 'pass' || !staged || settings.open || scene.isViewMoving()) return;
  if (deadline !== null && Date.now() >= deadline) { expireShot(); return; }
  trail.push({ ...p, t });
  contactTrail = appendFlickContactSample(contactTrail, { ...p, t });
  flickContact = updateFlickContact(flickContact, contactTrail, staged, flickSpeedScale(inward(staged)));
  discCrossed = flickContact !== null;
  trail = trail.filter(sample => t - sample.t <= 120);
}
function releaseFlick() {
  if (phase !== 'pass' || !staged || !flickContact?.powered) return;
  const velocity = releaseShot(trail, staged, flickContact, flickSpeedScale(flickContact.finishDirection ?? flickContact.direction));
  if (!velocity) return;
  cancel();
  hadOpponent = discs.some(d => d.state === 'board' && side(d.owner) !== side(player));
  shot = { touched: new Set([staged.id]), opponentContact: false, side: side(player), sideOf: side };
  sound.play('flick', Math.hypot(velocity.x, velocity.y), staged.x, staged.y);
  staged.vx = velocity.x; staged.vy = velocity.y; staged.spin = velocity.spin; used[player]++; phase = 'moving';
  next.hidden = true;
  scene.highlightDisc(null);
  banner.textContent = 'Let it slide'; hint.textContent = 'Waiting for the board to settle…'; hud(); save();
}
function cancel() { pointer = null; trail = []; contactTrail = []; discCrossed = false; flickContact = null; }
function endPointer(e: PointerEvent) {
  touches.delete(e.pointerId);
  if (touches.size === 0) { pinching = false; pinchDistance = 0; }
  if (pointer === e.pointerId) cancel();
  if (orbitPointer === e.pointerId) { cancelOrbit(); tablePreferences(); }
  if (placementPointer === e.pointerId) placementPointer = null;
}
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', endPointer);
window.addEventListener('blur', () => { cancel(); cancelOrbit(); placementPointer = null; touches.clear(); pinching = false; pinchDistance = 0; });
canvas.addEventListener('pointerup', e => {
  if (paused) return;
  if (e.pointerId === placementPointer) {
    placementPointer = null; touches.delete(e.pointerId);
    if (phase === 'pass' && !pinching && !scene.isViewMoving()) placeAt(e.clientX, e.clientY);
    return;
  }
  if (e.pointerId === orbitPointer) { endPointer(e); return; }
  const wasPinching = pinching;
  touches.delete(e.pointerId);
  if (wasPinching) {
    endPointer(e); cancel();
    return;
  }
  if (scene.isViewMoving() || e.pointerId !== pointer || !staged || phase !== 'pass') return;
  if (deadline !== null && Date.now() >= deadline) { expireShot(); return; }
  const p = scene.boardPoint(e.clientX, e.clientY);
  if (p) {
    sampleFlick(p, e.timeStamp);
    flickContact = finalizeFlickContact(flickContact, contactTrail, staged, flickSpeedScale(inward(staged)));
  }
  // A board-space powered strike takes precedence over a screen-space tap.
  // A hold can still cancel release power; it must not relocate the struck disc.
  if (!flickContact?.powered && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) {
    cancel(); placeAt(e.clientX, e.clientY); return;
  }
  if (p) releaseFlick();
  cancel();
});
function finishShot() {
  review = beginReview(discs, inspectShot(discs, shot!, hadOpponent)); shot = null;
  phase = 'review'; next.hidden = true;
  reviewMessage(); hud(); save();
}
function expireShot() {
  scene.highlightDisc(null);
  cancel(); cancelOrbit(); placementPointer = null; touches.clear(); pinching = false;
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
    phase = roundResult.winner !== null ? 'won' : 'round'; winnerDismissed = false;
    banner.textContent = roundResult.winner !== null ? `${label(roundResult.winner)} wins!` : 'Round complete';
    hint.textContent = roundResult.sides.map((row, i) => `${label(i)} +${row.awarded}`).join(' · ');
    next.textContent = phase === 'won' ? 'Start a new game' : 'Next round'; next.setAttribute('aria-label', next.textContent); next.dataset.mode = 'result'; next.hidden = false; hud(); save();
    if (phase === 'won') $('inspect-board').focus({ preventScroll: true });
  } else { player = (player + 1) % count(); pass(valid ? '' : 'Foul resolved'); }
}
// The camera control rests as an icon whose figure shows the current stop. Its
// rail opens on tap, or for a moment while the camera is dragged or pinched,
// and its highlight follows the camera. The badge's cheek hovers while
// standing; seated, it slides toward the disc's end of the shooting line and
// perches on the stool's edge.
const tableControls = $('table-controls'), cameraControl = $('camera-control'), seatBadge = $('seat-badge'), cameraToggle = $('camera-toggle');
const stopNames: Record<CameraStop, string> = { overview: 'Overview', table: 'Table', shooter: 'Shooter' };
let railOpen = false, cameraMovedAt = -Infinity;
let shownLevel = '', shownStop = '', shownSeat = '', shownCheek = '', shownLock = '', shownOpen = '';
cameraToggle.addEventListener('click', () => { railOpen = !railOpen; });
function cameraControls(locked: boolean, seated: boolean) {
  const level = scene.getLevel().toFixed(3), stop = nearestStop(scene.getTargetLevel());
  if (orbitPointer !== null || pinching) cameraMovedAt = performance.now();
  const open = railOpen || performance.now() - cameraMovedAt < 1500;
  if (String(open) !== shownOpen) {
    tableControls.classList.toggle('expanded', open); cameraToggle.setAttribute('aria-expanded', String(open));
    shownOpen = String(open);
  }
  if (level !== shownLevel) { cameraControl.style.setProperty('--level', level); shownLevel = level; }
  if (stop !== shownStop) {
    for (const name of cameraStops) $(`camera-${name}`).setAttribute('aria-pressed', String(name === stop));
    cameraToggle.dataset.stop = stop; cameraToggle.setAttribute('aria-label', `Camera: ${stopNames[stop]}. Show camera stops`);
    shownStop = stop;
  }
  const lock = `${locked}${phase === 'pass'}`;
  if (lock !== shownLock) {
    for (const name of cameraStops) $<HTMLButtonElement>(`camera-${name}`).disabled = locked || (name === 'shooter' && phase !== 'pass');
    shownLock = lock;
  }
  const seat = seated ? 'seated' : 'standing';
  if (seat !== shownSeat) {
    // Sitting down drops the cheek onto the chair.
    if (seated && shownSeat) { seatBadge.classList.remove('plop'); void seatBadge.offsetWidth; seatBadge.classList.add('plop'); }
    seatBadge.dataset.seat = seat; seatBadge.setAttribute('aria-label', seated ? 'Seated: you may shoot' : 'Standing: sit down to shoot');
    shownSeat = seat;
  }
  let reach = 0;
  if (staged && phase === 'pass') {
    const delta = Math.atan2(Math.sin(Math.atan2(staged.x, staged.y) - yaw()), Math.cos(Math.atan2(staged.x, staged.y) - yaw()));
    reach = Math.max(-1, Math.min(1, delta / (Math.PI / 4)));
  }
  const cheek = reach.toFixed(2);
  if (cheek !== shownCheek) { seatBadge.style.setProperty('--reach', cheek); shownCheek = cheek; }
}
let last = performance.now(), accumulator = 0;
function tick(now: number) {
  if (paused) { last = now; requestAnimationFrame(tick); return; }
  $<HTMLButtonElement>('pause-button').disabled = phase === 'won';
  const modeLabel = phase === 'pass' ? 'Place and shoot' : phase === 'moving' ? 'Shot in motion' : phase === 'review' ? 'Shot review' : phase === 'won' ? 'Game complete' : 'Round complete';
  if ($('board-mode').textContent !== modeLabel) $('board-mode').textContent = modeLabel;
  canvas.parentElement!.dataset.mode = phase === 'pass' ? 'play' : 'view';
  const seated = isSeated(scene.getTargetLevel());
  const guidance = phase !== 'pass' ? '' : seated ? 'Tap line to place · drag to look · flick through disc to shoot'
    : 'Standing to look · touch your disc to sit down and shoot';
  if ($('board-guidance').textContent !== guidance) $('board-guidance').textContent = guidance;
  const awaitingShot = phase === 'pass';
  if (awaitingShot && deadline !== null && Date.now() >= deadline) expireShot();
  clockLabel.hidden = !awaitingShot;
  const remaining = deadline === null ? null : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  clockLabel.textContent = remaining === null ? ' · Clock off' : ` · ${remaining}s`;
  clockLabel.classList.toggle('urgent', remaining !== null && remaining <= 10);
  const elapsed = Math.min((now - last) / 1000, 0.25);
  const dt = Math.min(elapsed, 0.05); last = now;
  accumulator += dt;
  while (accumulator >= 1 / 120) {
    if (phase === 'moving' && shot) {
      step(discs, 1 / 120, shot, true, sound.impact);
      if (!discs.some(moving)) finishShot();
    }
    accumulator -= 1 / 120;
  }
  if (!document.hidden && !settings.open) {
    if (phase === 'review' && review) {
      review.elapsed += elapsed * 1000;
      if (review.elapsed >= reviewDuration(review)) finishReview();
    }
  }
  sound.setListenerYaw(scene.getYaw());
  const controlsLocked = !canInspectBoard() || pointer !== null || orbitPointer !== null || placementPointer !== null || pinching;
  canvas.classList.toggle('can-orbit', canInspectBoard());
  canvas.classList.toggle('is-orbiting', orbitPointer !== null);
  cameraControls(controlsLocked, seated);
  assignDitchSlots(discs);
  // Hold the shooter view through the shot and its review; the next turn
  // moves it to the new disc, and round results return to the overview.
  if (phase === 'pass') scene.setShotDisc(staged);
  else if (phase !== 'moving' && phase !== 'review') scene.setShotDisc(null);
  scene.syncDiscs(discs, review); requestAnimationFrame(tick);
}
try {
  const savedSkin = localStorage.getItem('crokinole-skin'); if (savedSkin && ['maple', 'walnut', 'slate'].includes(savedSkin)) { skin.value = savedSkin; scene.setSkin(savedSkin); }
  const raw = localStorage.getItem(MATCH_STORAGE_KEY) ?? localStorage.getItem('crokinole-match');
  if (raw) {
    const data = readMatch(raw);
    if (data) {
      mode = data.mode; player = data.player; round = data.round; id = data.id; discs = data.discs; scores = data.scores; used = data.used;
      deadline = data.deadline; phase = data.phase; restored = true;
      paused = data.paused; pausedRemaining = data.remaining;
      staged = discs.find(d => d.id === data.stagedId) ?? null;
      hadOpponent = data.hadOpponent;
      shot = data.shot ? { ...data.shot, touched: new Set(data.shot.touched), sideOf: side } : null;
      $<HTMLSelectElement>('mode').value = mode;
      roundResult = data.roundResult; review = data.review; winnerDismissed = data.winnerDismissed === true;
    }
  }
} catch { /* Start fresh if storage is unavailable. */ }
setupBoardArtwork(scene, skin);
if (restored) {
  if (phase === 'pass') sitDown();
  scene.setYawTarget(yaw()); hud();
  if (phase === 'review') { next.hidden = true; reviewMessage(); }
  else if (phase === 'moving') { next.hidden = true; banner.textContent = 'Let it slide'; hint.textContent = 'Waiting for the board to settle…'; }
  else if (phase === 'round' || phase === 'won') {
    banner.textContent = phase === 'won' ? `${label(scores.indexOf(Math.max(...scores)))} wins!` : 'Round complete';
    hint.textContent = 'Your table has been restored.';
    next.textContent = phase === 'won' ? 'Start a new game' : 'Next round'; next.setAttribute('aria-label', next.textContent); next.dataset.mode = 'result';
  } else {
    pass('', true);
  }
} else pass();
// Open the page with the camera already in place, not gliding into it.
if (phase === 'pass') scene.setShotDisc(staged);
scene.snapView();
winnerPresentation();
if (paused) { scene.setPaused(true); pauseDialog.showModal(); }
requestAnimationFrame(tick);
