import { discColors, type DiscAppearance, type DiscEmblem } from '../disc-appearance';

const TAU = Math.PI * 2;
const CREAM = '#fff1d6';
const INK = '#34271e';

// The selected palette supplies every stain hue; only warm neutral pigment is
// mixed into it for grain, finish and printed contrast. No surface displacement.
function mix(color: string, neutral: string, amount: number): string {
  const rgb = [1, 3, 5].map(i => Math.round(
    parseInt(color.slice(i, i + 2), 16) * (1 - amount) + parseInt(neutral.slice(i, i + 2), 16) * amount,
  ));
  return `#${rgb.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}
function circle(ctx: CanvasRenderingContext2D, radius: number) {
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU);
}

function drawWood(ctx: CanvasRenderingContext2D, color: string, owner: number) {
  // One stain, not a shaded insert: the scene lighting supplies the finish.
  // Cover the square as well as the face so the body map has no transparent rim.
  ctx.fillStyle = color; ctx.fillRect(-2, -2, 4, 4);
  // Fine, gently wandering maple fibers. No decorative growth rings or knot.
  // The identical coordinates on face/body let grain cross the shoulder cleanly.
  ctx.save(); ctx.rotate(-0.24 + owner * 0.11);
  for (let i = 0; i < 64; i++) {
    const y0 = -1.6 + i * 0.051 + Math.sin(i * 2.17) * 0.009;
    const dark = i % 5 !== 0;
    ctx.strokeStyle = dark ? mix(color, INK, 0.45) : mix(color, CREAM, 0.4);
    ctx.globalAlpha = dark ? 0.1 : 0.07;
    ctx.lineWidth = 0.004 + (i % 3) * 0.002;
    ctx.beginPath();
    for (let j = 0; j <= 40; j++) {
      const x = -1.6 + j * 0.08;
      const y = y0 + Math.sin(x * 2.4 + i * 0.18 + owner * 0.8) * 0.012
        + Math.sin(x * 5.1 + i * 0.37) * 0.003;
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Full-square, unprinted stain for the body; shares face grain coordinates. */
export function drawDiscWoodSurface(
  ctx: CanvasRenderingContext2D, size: number, color: string, owner: number,
): void {
  ctx.save(); ctx.resetTransform(); ctx.clearRect(0, 0, size, size);
  if (!(size > 0 && Number.isFinite(size))) { ctx.restore(); return; }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0; ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
  ctx.filter = 'none'; ctx.setLineDash([]); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.translate(size / 2, size / 2); ctx.scale(size / 2, size / 2);
  drawWood(ctx, color, owner); ctx.restore();
}

function drawPoker(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color; circle(ctx, 1); ctx.fill();
  ctx.fillStyle = CREAM;
  for (let i = 0; i < 6; i++) {
    const angle = i * TAU / 6 - Math.PI / 2;
    // One broad insert is deliberately unequal: a natural spin reference, not
    // another inlay dash or a perfectly rotationally symmetric chip pattern.
    const halfWidth = i === 0 ? 0.29 : 0.145;
    ctx.beginPath();
    ctx.arc(0, 0, 0.985, angle - halfWidth, angle + halfWidth);
    ctx.arc(0, 0, 0.765, angle + halfWidth, angle - halfWidth, true);
    ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = CREAM; ctx.lineWidth = 0.022;
  circle(ctx, 0.73); ctx.stroke();
  ctx.fillStyle = CREAM; circle(ctx, 0.655); ctx.fill();
  ctx.strokeStyle = mix(color, INK, 0.18); ctx.lineWidth = 0.027;
  circle(ctx, 0.6); ctx.stroke();
  // Flat concentric printing on the center medallion, never raised geometry.
  ctx.strokeStyle = color; ctx.lineWidth = 0.012;
  circle(ctx, 0.535); ctx.stroke();
}

function printedEmblem(ctx: CanvasRenderingContext2D, emblem: DiscEmblem, color: string) {
  if (emblem === 'none' || emblem === 'photo') return;
  ctx.fillStyle = color; ctx.beginPath();
  switch (emblem) {
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 === 0 ? 0.44 : 0.2;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      break;
    case 'spade':
      ctx.moveTo(0, -0.46);
      ctx.bezierCurveTo(-0.1, -0.27, -0.43, -0.1, -0.4, 0.12);
      ctx.bezierCurveTo(-0.37, 0.34, -0.12, 0.34, -0.06, 0.17);
      ctx.lineTo(-0.09, 0.32); ctx.lineTo(-0.2, 0.43); ctx.lineTo(0.2, 0.43);
      ctx.lineTo(0.09, 0.32); ctx.lineTo(0.06, 0.17);
      ctx.bezierCurveTo(0.12, 0.34, 0.37, 0.34, 0.4, 0.12);
      ctx.bezierCurveTo(0.43, -0.1, 0.1, -0.27, 0, -0.46);
      break;
    case 'leaf':
      ctx.moveTo(0.32, -0.43);
      ctx.bezierCurveTo(-0.15, -0.48, -0.48, -0.09, -0.25, 0.26);
      ctx.bezierCurveTo(0.12, 0.4, 0.42, 0.03, 0.32, -0.43);
      ctx.lineTo(-0.25, 0.26); ctx.lineTo(-0.37, 0.42); ctx.lineTo(-0.31, 0.45);
      ctx.lineTo(-0.19, 0.29);
      break;
    case 'moon':
      ctx.moveTo(0.19, -0.42);
      ctx.bezierCurveTo(-0.37, -0.57, -0.61, 0.18, -0.18, 0.4);
      ctx.bezierCurveTo(0.03, 0.52, 0.29, 0.39, 0.39, 0.21);
      ctx.bezierCurveTo(-0.03, 0.36, -0.29, -0.14, 0.19, -0.42);
      break;
    case 'bolt':
      ctx.moveTo(0.08, -0.46); ctx.lineTo(-0.31, 0.06); ctx.lineTo(-0.05, 0.06);
      ctx.lineTo(-0.16, 0.46); ctx.lineTo(0.34, -0.15); ctx.lineTo(0.07, -0.15);
      break;
  }
  ctx.closePath(); ctx.fill();
}

function photoDimensions(photo: CanvasImageSource): [number, number] {
  // Native dimensions, not CSS sizing; also supports preview canvases, bitmaps,
  // SVGs and video sources without a DOM constructor dependency.
  if ('naturalWidth' in photo) return [photo.naturalWidth, photo.naturalHeight];
  if ('videoWidth' in photo) return [photo.videoWidth, photo.videoHeight];
  if ('displayWidth' in photo) return [photo.displayWidth, photo.displayHeight];
  const width = photo.width, height = photo.height;
  return [typeof width === 'number' ? width : width.baseVal.value,
    typeof height === 'number' ? height : height.baseVal.value];
}
function drawPhoto(ctx: CanvasRenderingContext2D, photo: CanvasImageSource, radius: number, color: string) {
  const [width, height] = photoDimensions(photo);
  if (!(width > 0 && height > 0)) return;
  const crop = Math.min(width, height);
  ctx.save(); circle(ctx, radius); ctx.clip();
  ctx.drawImage(photo, (width - crop) / 2, (height - crop) / 2, crop, crop, -radius, -radius, radius * 2, radius * 2);
  ctx.restore();
  ctx.strokeStyle = CREAM; ctx.lineWidth = 0.025; circle(ctx, radius + 0.015); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 0.018; circle(ctx, radius + 0.037); ctx.stroke();
}

/** Shared scene/preview renderer: a full-bounds circle with transparent corners.
 * Artwork is deterministic, flat ink on finished stain or a printed poker chip.
 * Photos are caller-owned, already-decoded sources; this helper never loads URLs.
 */
export function drawDiscFace(
  ctx: CanvasRenderingContext2D, size: number, appearance: DiscAppearance, owner: number, photo?: CanvasImageSource,
): void {
  ctx.save();
  ctx.resetTransform(); ctx.clearRect(0, 0, size, size);
  if (!(size > 0 && Number.isFinite(size))) { ctx.restore(); return; }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0; ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
  ctx.filter = 'none'; ctx.setLineDash([]); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.translate(size / 2, size / 2); ctx.scale(size / 2, size / 2);
  circle(ctx, 1); ctx.clip();
  const color = discColors(appearance)[owner] ?? discColors(appearance)[0];
  if (appearance.style === 'poker') drawPoker(ctx, color); else drawWood(ctx, color, owner);
  const emblem = appearance.emblems[owner] ?? 'none';
  if (emblem === 'photo' && photo) drawPhoto(ctx, photo, appearance.style === 'poker' ? 0.5 : 0.61, color);
  else {
    const brightness = [0.2126, 0.7152, 0.0722].reduce((sum, weight, i) => sum + weight * parseInt(color.slice(i * 2 + 1, i * 2 + 3), 16) / 255, 0);
    printedEmblem(ctx, emblem, appearance.style === 'poker' || brightness > 0.62 ? INK : CREAM);
  }
  // Poker printing needs an owner rim; wood is a continuous stained piece.
  if (appearance.style === 'poker') {
    ctx.strokeStyle = color; ctx.lineWidth = 0.07; circle(ctx, 0.965); ctx.stroke();
  }
  ctx.restore();
}
