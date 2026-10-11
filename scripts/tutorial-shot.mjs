// Screenshot the tutorial pictures in one PNG, for a fast see-it/fix-it loop.
//   node scripts/tutorial-shot.mjs [out.png] [--step=4] [--theme=dark] [--scale=3]
// Starts vite, captures scripts/tutorial-gallery.html with headless Chrome, stops vite.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
const args = process.argv.slice(2);
const flag = (name, fallback) => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const out = args.find(a => !a.startsWith('--')) ?? '/tmp/tutorial-gallery.png';
const step = flag('step', ''), theme = flag('theme', 'light'), scale = flag('scale', '2');
const one = !!step;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; await new Promise(r => s.close(r));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await sleep(100); }
  const url = `http://127.0.0.1:${port}/scripts/tutorial-gallery.html?theme=${theme}${step ? `&step=${step}` : ''}`;
  const size = one ? '400,420' : '1200,500';
  const r = spawnSync(process.env.CHROME_BIN || 'google-chrome', ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${size}`, `--force-device-scale-factor=${scale}`, '--virtual-time-budget=4000', `--screenshot=${out}`, url], { stdio: 'ignore' });
  console.log(r.status === 0 ? out : `chrome failed (${r.status})`);
} finally { vite.kill(); }
