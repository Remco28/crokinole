import { points } from './game/rules';
import { BOARD, TUNE } from './sim/constants';
import type { Disc, PhysicsEvent, Shot } from './sim/physics';

// Practice mode: shoot freely, with no score, clock, fouls or review. Each shot
// is logged from the real simulation so the physics can be inspected. The log
// and its summary are pure so they can be tested without a DOM.
type EventKind = PhysicsEvent['kind'];
export interface ShotLog {
  id: number; start: { x: number; y: number }; vx: number; vy: number; spin: number;
  elapsed: number; path: number; last: { x: number; y: number };
  hits: Record<EventKind, number>; strongestHit: number; seen: Map<string, number>;
}
export interface ShotSummary {
  launchSpeed: number; aimDegrees: number; spin: number; start: { x: number; y: number };
  duration: number; path: number; hits: Record<EventKind, number>; strongestHit: number; discsStruck: number;
  result: { state: Disc['state']; x: number; y: number; radius: number; points: number; label: string };
}

const KINDS: EventKind[] = ['disc', 'peg', 'sink', 'ditch', 'land', 'lip'];
const emptyHits = () => Object.fromEntries(KINDS.map(k => [k, 0])) as Record<EventKind, number>;
// Same de-duplication window as the sound engine, so repeated contact reports
// from one touch count once.
const SAME_CONTACT = 0.025;

export function beginLog(disc: Disc): ShotLog {
  return { id: disc.id, start: { x: disc.x, y: disc.y }, vx: disc.vx, vy: disc.vy, spin: disc.spin, elapsed: 0, path: 0,
    last: { x: disc.x, y: disc.y }, hits: emptyHits(), strongestHit: 0, seen: new Map() };
}
export function recordStep(log: ShotLog, discs: Disc[], dt: number) {
  log.elapsed += dt;
  const shooter = discs.find(d => d.id === log.id);
  if (shooter && shooter.state === 'board') {
    log.path += Math.hypot(shooter.x - log.last.x, shooter.y - log.last.y);
    log.last = { x: shooter.x, y: shooter.y };
  }
}
export function recordEvent(log: ShotLog, event: PhysicsEvent) {
  const previous = log.seen.get(event.key);
  if (previous !== undefined && log.elapsed - previous < SAME_CONTACT) return;
  log.seen.set(event.key, log.elapsed);
  log.hits[event.kind]++;
  if (event.kind === 'disc') log.strongestHit = Math.max(log.strongestHit, event.speed);
}
// Degrees off the straight line to the center. Positive is to the shooter's right.
export function aimOffset(start: { x: number; y: number }, vx: number, vy: number): number {
  const radius = Math.hypot(start.x, start.y) || 1, speed = Math.hypot(vx, vy);
  if (!speed) return 0;
  const dx = -start.x / radius, dy = -start.y / radius;
  return Math.atan2(vx * -dy + vy * dx, vx * dx + vy * dy) * 180 / Math.PI;
}
function describeResult(d: Disc): ShotSummary['result'] {
  const radius = Math.hypot(d.x, d.y), value = points(d);
  const base = { state: d.state, x: d.x, y: d.y, radius, points: value };
  if (d.state === 'sunk') return { ...base, label: 'Sank in the center hole' };
  if (d.state === 'out') return { ...base, label: 'Left the board' };
  if (value === 0) return { ...base, label: radius + 0.5 >= BOARD.ring5 ? 'Outside the scoring rings' : 'On a scoring line' };
  return { ...base, label: `Inside the ${value} ring` };
}
export function summarize(log: ShotLog, discs: Disc[], shot: Pick<Shot, 'touched'> | null): ShotSummary {
  const shooter = discs.find(d => d.id === log.id);
  return {
    launchSpeed: Math.hypot(log.vx, log.vy), aimDegrees: aimOffset(log.start, log.vx, log.vy), spin: log.spin, start: log.start,
    duration: log.elapsed, path: log.path, hits: { ...log.hits }, strongestHit: log.strongestHit,
    discsStruck: Math.max(0, (shot?.touched.size ?? 1) - 1),
    result: shooter ? describeResult(shooter) : { state: 'out', x: 0, y: 0, radius: 0, points: 0, label: 'Disc removed' },
  };
}
const fixed = (n: number, digits = 1) => n.toFixed(digits);
const signed = (n: number, digits = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}`;
export function summaryRows(s: ShotSummary): [string, string][] {
  const aim = Math.abs(s.aimDegrees) < 0.05 ? 'dead center' : `${fixed(Math.abs(s.aimDegrees))}° ${s.aimDegrees > 0 ? 'right' : 'left'}`;
  return [
    ['Launch speed', `${fixed(s.launchSpeed)} in/s`],
    ['Aim', aim],
    ['Spin', `${signed(s.spin, 2)} rad/s`],
    ['Start', `x ${fixed(s.start.x)}, y ${fixed(s.start.y)} in`],
    ['Time to rest', `${fixed(s.duration, 2)} s`],
    ['Distance', `${fixed(s.path)} in`],
    ['Disc contacts', s.hits.disc ? `${s.hits.disc} · hardest ${fixed(s.strongestHit)} in/s` : '0'],
    ['Discs struck', String(s.discsStruck)],
    ['Peg hits', String(s.hits.peg)],
    ['Lip and hop', `${s.hits.lip} lip · ${s.hits.land} landing`],
    ['Result', s.result.label],
    ['Final spot', s.result.state === 'out' ? 'in the ditch' : `x ${fixed(s.result.x)}, y ${fixed(s.result.y)} · ${fixed(s.result.radius)} in from center`],
  ];
}
export function liveText(log: ShotLog, discs: Disc[]): string {
  const speed = Math.max(0, ...discs.filter(d => d.state === 'board').map(d => Math.hypot(d.vx, d.vy)));
  return `In motion · fastest disc ${fixed(speed)} in/s · ${fixed(log.elapsed)} s`;
}
export const TUNE_ROWS = (): [string, string][] => Object.entries(TUNE).map(([k, v]) => [k, String(v)]);
export const summaryJson = (s: ShotSummary) => JSON.stringify({ ...s, aimDegrees: Number(s.aimDegrees.toFixed(3)), launchSpeed: Number(s.launchSpeed.toFixed(3)), tune: TUNE }, null, 2);

export interface PracticeActions { onSwitchSide: () => void; onClear: () => void; onExit: () => void }
export function createPracticePanel(actions: PracticeActions) {
  const panel = document.createElement('section');
  panel.id = 'practice-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Practice mode');
  panel.innerHTML = '<div class="practice-head"><strong>Practice</strong><span>No score, clock or fouls</span></div>'
    + '<p id="practice-live" role="status" aria-live="off">Flick a disc to see what the shot did.</p>'
    + '<div class="practice-actions"><button type="button" id="practice-side">Switch side</button><button type="button" id="practice-clear">Clear board</button><button type="button" id="practice-exit">Exit practice</button></div>'
    + '<details id="practice-last" open><summary>Last shot</summary><dl id="practice-rows"><p class="practice-empty">No shots yet.</p></dl><button type="button" id="practice-copy">Copy as JSON</button></details>'
    + '<details id="practice-tune"><summary>Physics constants</summary><dl id="practice-tune-rows"></dl></details>';
  document.getElementById('match-panel')!.after(panel);
  const $ = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!;
  const rows = (items: [string, string][]) => items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('practice-tune-rows').innerHTML = rows(TUNE_ROWS());
  if (!window.matchMedia('(min-width:900px)').matches) $<HTMLDetailsElement>('practice-last').open = false;
  let last: ShotSummary | null = null;
  $('practice-side').addEventListener('click', actions.onSwitchSide);
  $('practice-clear').addEventListener('click', actions.onClear);
  $('practice-exit').addEventListener('click', actions.onExit);
  $('practice-copy').addEventListener('click', async () => {
    if (!last) return;
    const button = $<HTMLButtonElement>('practice-copy');
    try { await navigator.clipboard.writeText(summaryJson(last)); button.textContent = 'Copied'; } catch { button.textContent = 'Copy unavailable'; }
    window.setTimeout(() => { button.textContent = 'Copy as JSON'; }, 1600);
  });
  return {
    show(on: boolean) { panel.hidden = !on; },
    live(text: string) { if ($('practice-live').textContent !== text) $('practice-live').textContent = text; },
    summary(s: ShotSummary) {
      last = s; $('practice-rows').innerHTML = rows(summaryRows(s));
      $('practice-live').textContent = `Shot complete · ${s.result.label.toLowerCase()}`;
    },
    reset() { last = null; $('practice-rows').innerHTML = '<p class="practice-empty">No shots yet.</p>'; $('practice-live').textContent = 'Flick a disc to see what the shot did.'; },
    busy(busy: boolean) { for (const id of ['practice-side', 'practice-clear']) { const b = $<HTMLButtonElement>(id); if (b.disabled !== busy) b.disabled = busy; } },
  };
}
