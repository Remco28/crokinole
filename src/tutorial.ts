// First-run tutorial: a short, skippable set of cards. The step list and the
// first-visit rule are pure so they can be tested without a DOM.
export interface TutorialStep { title: string; body: string; art: string }

const RED = '#d0553f', BLUE = '#5d93a8';
const svg = (inner: string) => `<svg viewBox="0 0 200 120" role="img" aria-hidden="true">${inner}</svg>`;
const n = (v: number) => Math.round(v * 10) / 10;
// Real proportions (BOARD in sim/constants.ts): rings at 4, 8 and 12 inches on a 13 inch board, eight pegs on the 4 inch ring.
const RING = { r15: 4 / 13, r10: 8 / 13, r5: 12 / 13 };
const board = (cx = 100, cy = 60, r = 54) => {
  const pegs = Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 8 + i * Math.PI / 4; return `<circle cx="${n(cx + Math.cos(a) * r * RING.r15)}" cy="${n(cy + Math.sin(a) * r * RING.r15)}" r="1.5" class="t-peg"/>`; }).join('');
  return `<circle cx="${cx}" cy="${cy}" r="${r}" class="t-board"/>${[RING.r5, RING.r10, RING.r15].map(f => `<circle cx="${cx}" cy="${cy}" r="${n(r * f)}" class="t-line"/>`).join('')}<circle cx="${cx}" cy="${cy}" r="${n(r * 0.07)}" class="t-hole"/>${pegs}`;
};
const disc = (x: number, y: number, color: string, extra = '') => `<circle cx="${x}" cy="${y}" r="7" fill="${color}" class="t-disc" ${extra}/>`;
// An arrowhead whose tip is at (x, y) pointing along (dx, dy); the shaft ends at its base so the two always line up.
const head = (x: number, y: number, dx: number, dy: number, len = 9, half = 5.5, cls = 't-head') => {
  const m = Math.hypot(dx, dy), ux = dx / m, uy = dy / m, bx = x - ux * len, by = y - uy * len;
  return { base: [bx, by] as const, svg: `<path d="M${n(x)} ${n(y)}L${n(bx - uy * half)} ${n(by + ux * half)}L${n(bx + uy * half)} ${n(by - ux * half)}z" class="${cls}"/>` };
};
// A straight arrow between two points, trimmed by `from`/`to` so it can start and stop at the edge of a disc.
const arrow = (x1: number, y1: number, x2: number, y2: number, from = 0, to = 0) => {
  const m = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / m, uy = (y2 - y1) / m;
  const [sx, sy, tx, ty] = [x1 + ux * from, y1 + uy * from, x2 - ux * to, y2 - uy * to];
  const h = head(tx, ty, ux, uy);
  return `<line x1="${n(sx)}" y1="${n(sy)}" x2="${n(h.base[0])}" y2="${n(h.base[1])}" class="t-arrow"/>${h.svg}`;
};
// A curved arrow along a circle, from angle a0 to a1 (degrees, clockwise from 3 o'clock), with a head at each end when `both`.
const arcArrow = (cx: number, cy: number, r: number, a0: number, a1: number, both = false) => {
  const rad = (deg: number) => deg * Math.PI / 180, at = (deg: number) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))] as const;
  const tip = (deg: number, sign: number) => { const [x, y] = at(deg); return head(x, y, -Math.sin(rad(deg)) * sign, Math.cos(rad(deg)) * sign, 9, 5.5, 't-head t-orbit-head'); };
  const angleOf = (p: readonly [number, number]) => Math.atan2(p[1] - cy, p[0] - cx) * 180 / Math.PI;
  const dir = Math.sign(a1 - a0), end = tip(a1, dir), start = both ? tip(a0, -dir) : null;
  const [sx, sy] = at(start ? angleOf(start.base) : a0), [ex, ey] = at(angleOf(end.base));
  return `<path d="M${n(sx)} ${n(sy)}A${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${n(ex)} ${n(ey)}" class="t-orbit"/>${end.svg}${start?.svg ?? ''}`;
};

export const STEPS: TutorialStep[] = [
  {
    title: 'Place and flick',
    body: 'On your turn, tap your shooting line to slide your disc along it. Start your finger behind the disc and flick straight through it. A faster flick travels farther.',
    art: svg(`${board()}${disc(100, 100, RED)}${arrow(100, 118, 100, 72)}`),
  },
  {
    title: 'Hit an opponent',
    body: 'If any opposing disc is on the board, your shot must hit one, directly or by bumping your own disc into it. Miss, and your disc is removed.',
    art: svg(`${board()}${disc(100, 100, RED)}${disc(122, 38, BLUE)}${arrow(100, 100, 122, 38, 10, 10)}`),
  },
  {
    title: 'Play to the middle',
    body: 'With no opponent discs to hit, one of your discs must finish touching or inside the inner ring, or drop into the center hole. Otherwise it is a foul.',
    art: svg(`${board()}<circle cx="100" cy="60" r="${n(54 * RING.r15 + 3)}" class="t-focus"/>${disc(100, 104, RED, 'opacity=".35"')}${disc(108, 66, RED)}${arrow(100, 104, 108, 66, 9, 9)}`),
  },
  {
    title: 'Scoring',
    body: 'After the last shot, discs score by ring: 5 outside, 10 in the middle, 15 inside the pegs, and 20 in the center hole. A disc touching a line scores the lower ring.',
    art: svg(`${board(56, 60, 50)}${[[20, 56, 60, 94, '20 · hole'], [15, 67.5, 60, 72, '15 · inside the pegs'], [10, 76.9, 50.2, 50, '10 · middle ring'], [5, 75.2, 26.7, 26, '5 · outer ring']].map(([, x, y, ly, label]) => `<line x1="${x}" y1="${y}" x2="112" y2="${ly}" class="t-lead"/><circle cx="${x}" cy="${y}" r="2.2" class="t-dot"/><text x="116" y="${Number(ly) + 3}" class="t-label">${label}</text>`).join('')}`),
  },
  {
    title: 'Winning',
    body: 'House rules add the difference between your totals each round, and first to 100 wins. If both sides pass 100 on the same round, the higher score wins. For tournament play, choose Scoring in Settings: four rounds a game, 2 points to the higher total and 1 each for a tie.',
    art: svg(`<rect x="36" y="58" width="34" height="40" rx="4" class="t-board"/><rect x="83" y="28" width="34" height="70" rx="4" fill="${RED}"/><rect x="130" y="80" width="34" height="18" rx="4" class="t-board"/><text x="53" y="84" class="t-num t-white">1</text><text x="100" y="70" class="t-num t-white">2</text><text x="147" y="93" class="t-num t-white">0</text><text x="53" y="112" class="t-label t-mid">Tie</text><text x="100" y="112" class="t-label t-mid">Higher total</text><text x="147" y="112" class="t-label t-mid">Lower</text><text x="100" y="18" class="t-num t-big">✳</text>`),
  },
  {
    title: 'Look around',
    body: 'Drag the board to look around and pinch to zoom. You shoot while seated, so touch your disc if you are standing. The camera button resets your view.',
    art: svg(`${board(100, 68, 40)}${arcArrow(100, 68, 52, 215, 325, true)}`),
  },
];

export const stepBy = (index: number, delta: number, length = STEPS.length) => Math.max(0, Math.min(length - 1, index + delta));

// A first visit has no saved table, match or tutorial flag in this browser.
export const TUTORIAL_KEY = 'crokinole-tutorial';
const STORED_KEYS = [TUTORIAL_KEY, 'crokinole-table', 'crokinole-match-spin-v2', 'crokinole-match'];
export function isFreshVisit(storage: Pick<Storage, 'getItem'>): boolean {
  try { return STORED_KEYS.every(key => storage.getItem(key) === null); } catch { return false; }
}
// A swipe of at least this many pixels, mostly horizontal, turns the page.
export function swipeDelta(dx: number, dy: number, threshold = 40): -1 | 0 | 1 {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}

export function setupTutorial(hooks: { onOpen?: () => void; onClose?: () => void } = {}) {
  const dialog = document.createElement('dialog');
  dialog.id = 'tutorial'; dialog.setAttribute('aria-labelledby', 'tutorial-title');
  dialog.innerHTML = '<div class="tutorial-top"><span class="eyebrow" id="tutorial-count"></span><button type="button" id="tutorial-skip" class="tutorial-skip">Skip</button></div>'
    + '<div id="tutorial-art" class="tutorial-art"></div><h2 id="tutorial-title"></h2><p id="tutorial-body"></p>'
    + '<div class="tutorial-dots" id="tutorial-dots" role="group" aria-label="Tutorial pages"></div>'
    + '<div class="tutorial-nav"><button type="button" id="tutorial-back">Back</button><button type="button" id="tutorial-next" class="primary">Next</button></div>';
  document.body.append(dialog);
  const $ = <T extends HTMLElement>(id: string) => dialog.querySelector<T>(`#${id}`)!;
  const dots = $('tutorial-dots');
  dots.innerHTML = STEPS.map((step, i) => `<button type="button" data-step="${i}" aria-label="Go to page ${i + 1}: ${step.title}"></button>`).join('');
  let index = 0;
  function render() {
    const step = STEPS[index], last = index === STEPS.length - 1;
    $('tutorial-count').textContent = `How to play · ${index + 1} of ${STEPS.length}`;
    $('tutorial-art').innerHTML = step.art;
    $('tutorial-title').textContent = step.title; $('tutorial-body').textContent = step.body;
    $<HTMLButtonElement>('tutorial-back').disabled = index === 0;
    $<HTMLButtonElement>('tutorial-next').textContent = last ? 'Start playing' : 'Next';
    $('tutorial-skip').hidden = last;
    dots.querySelectorAll<HTMLButtonElement>('button').forEach((b, i) => { b.setAttribute('aria-current', String(i === index)); });
  }
  const go = (delta: number) => { const next = stepBy(index, delta); if (next !== index) { index = next; render(); } };
  // Leaving the tutorial for good is synchronous and idempotent: the dialog's
  // own close event can lag (or never arrive in a throttled tab), so nothing
  // that matters waits for it. It stays wired as a fallback.
  let active = false;
  function finish() {
    if (!active) return;
    active = false;
    try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* optional */ }
    hooks.onClose?.();
  }
  function open() { if (dialog.open) return; index = 0; render(); active = true; hooks.onOpen?.(); dialog.showModal(); $('tutorial-next').focus(); }
  const close = () => { finish(); if (dialog.open) dialog.close(); };
  $('tutorial-skip').addEventListener('click', close);
  $('tutorial-back').addEventListener('click', () => go(-1));
  $('tutorial-next').addEventListener('click', () => { if (index === STEPS.length - 1) close(); else go(1); });
  dots.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-step]');
    if (target) { index = Number(target.dataset.step); render(); }
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') { event.preventDefault(); if (index === STEPS.length - 1) return; go(1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
  });
  // Escape (cancel), Skip and finishing the last page all leave the tutorial for good.
  dialog.addEventListener('cancel', finish);
  dialog.addEventListener('close', finish);
  let swipeStart: { x: number; y: number } | null = null;
  dialog.addEventListener('pointerdown', event => { if (!(event.target as HTMLElement).closest('button')) swipeStart = { x: event.clientX, y: event.clientY }; });
  dialog.addEventListener('pointerup', event => {
    if (!swipeStart) return;
    const delta = swipeDelta(event.clientX - swipeStart.x, event.clientY - swipeStart.y); swipeStart = null;
    if (delta) go(delta);
  });
  dialog.addEventListener('pointercancel', () => { swipeStart = null; });
  document.getElementById('replay-tutorial')?.addEventListener('click', () => {
    (document.getElementById('settings') as HTMLDialogElement | null)?.close();
    open();
  });
  return { open, isOpen: () => dialog.open };
}
