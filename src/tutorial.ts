// First-run tutorial: a short, skippable set of cards. The step list and the
// first-visit rule are pure so they can be tested without a DOM.
export interface TutorialStep { title: string; body: string; art: string }

const RED = '#d0553f', BLUE = '#5d93a8';
const svg = (inner: string) => `<svg viewBox="0 0 200 120" role="img" aria-hidden="true">${inner}</svg>`;
// A top-down board: playing surface with the 15, 10 and 5 rings and the hole.
const board = (cx = 100, cy = 60, r = 54) => `<circle cx="${cx}" cy="${cy}" r="${r}" class="t-board"/><circle cx="${cx}" cy="${cy}" r="${r * 0.9}" class="t-line"/><circle cx="${cx}" cy="${cy}" r="${r * 0.6}" class="t-line"/><circle cx="${cx}" cy="${cy}" r="${r * 0.3}" class="t-line"/><circle cx="${cx}" cy="${cy}" r="${r * 0.07}" class="t-hole"/>`;
const disc = (x: number, y: number, color: string, extra = '') => `<circle cx="${x}" cy="${y}" r="7" fill="${color}" class="t-disc" ${extra}/>`;

export const STEPS: TutorialStep[] = [
  {
    title: 'Place and flick',
    body: 'On your turn, tap your shooting line to slide your disc along it. Start your finger behind the disc and flick straight through it. A faster flick travels farther.',
    art: svg(`${board()}<path d="M70 106a54 54 0 0 0 60 0" class="t-guide"/>${disc(100, 100, RED)}<line x1="100" y1="118" x2="100" y2="70" class="t-arrow"/><path d="M94 77l6-8 6 8" class="t-arrow"/>`),
  },
  {
    title: 'Hit an opponent',
    body: 'If any opposing disc is on the board, your shot must hit one, directly or by bumping your own disc into it. Miss, and your disc is removed.',
    art: svg(`${board()}${disc(100, 100, RED)}${disc(122, 38, BLUE)}<line x1="100" y1="92" x2="120" y2="48" class="t-arrow"/><path d="M111 52l9-4 2 10" class="t-arrow"/>`),
  },
  {
    title: 'Play to the middle',
    body: 'With no opponent discs to hit, one of your discs must finish touching or inside the inner ring, or drop into the center hole. Otherwise it is a foul.',
    art: svg(`${board()}<circle cx="100" cy="60" r="16.2" class="t-focus"/>${disc(108, 66, RED)}${disc(100, 104, RED, 'opacity=".35"')}<line x1="100" y1="96" x2="106" y2="74" class="t-arrow"/>`),
  },
  {
    title: 'Scoring',
    body: 'After the last shot, discs score by ring: 5 outside, 10 in the middle, 15 inside the pegs, and 20 in the center hole. A disc touching a line scores the lower ring.',
    art: svg(`${board(58, 60, 52)}<g class="t-legend"><line x1="58" y1="60" x2="122" y2="26" class="t-lead"/><text x="128" y="30" class="t-label">20 · center hole</text><line x1="58" y1="46" x2="122" y2="52" class="t-lead"/><text x="128" y="56" class="t-label">15 · inside the pegs</text><line x1="58" y1="34" x2="122" y2="78" class="t-lead"/><text x="128" y="82" class="t-label">10 · middle ring</text><line x1="58" y1="16" x2="122" y2="104" class="t-lead"/><text x="128" y="108" class="t-label">5 · outer ring</text></g>`),
  },
  {
    title: 'Winning',
    body: 'Classic play adds the difference between your totals each round, and first to 100 wins. For tournament play, choose Scoring in Settings: four rounds a game, 2 points to the higher total and 1 each for a tie.',
    art: svg(`<rect x="36" y="58" width="34" height="40" rx="4" class="t-board"/><rect x="83" y="28" width="34" height="70" rx="4" fill="${RED}"/><rect x="130" y="80" width="34" height="18" rx="4" class="t-board"/><text x="53" y="84" class="t-num t-white">1</text><text x="100" y="70" class="t-num t-white">2</text><text x="147" y="93" class="t-num t-white">0</text><text x="53" y="112" class="t-label t-mid">Tie</text><text x="100" y="112" class="t-label t-mid">Higher total</text><text x="147" y="112" class="t-label t-mid">Lower</text><text x="100" y="18" class="t-num t-big">✳</text>`),
  },
  {
    title: 'Look around',
    body: 'Drag the board to look around and pinch to zoom. You shoot while seated, so touch your disc if you are standing. The camera button resets your view.',
    art: svg(`<ellipse cx="100" cy="74" rx="76" ry="32" class="t-board"/><ellipse cx="100" cy="74" rx="46" ry="19" class="t-line"/><ellipse cx="100" cy="74" rx="14" ry="6" class="t-line"/><path d="M42 36q58-30 116 0" class="t-arrow"/><path d="M150 26l9 11-13 3" class="t-arrow"/><path d="M58 26l-9 11 13 3" class="t-arrow"/>`),
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
