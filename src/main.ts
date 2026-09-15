import { createScene } from './render/scene';

const canvas = document.getElementById('board-canvas') as HTMLCanvasElement;
const banner = document.getElementById('turn-banner');

createScene(canvas);

if (banner) {
  banner.textContent = 'Phase 1 scaffold — drag to orbit. Sim + flick next.';
}
