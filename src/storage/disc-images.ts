export interface DiscCrop { zoom: number; x: number; y: number }
export interface DiscImage { owner: number; name: string; source: string; data: string; crop: DiscCrop }
export const defaultCrop = (): DiscCrop => ({ zoom: 1, x: 0, y: 0 });
export function validCrop(value: unknown): value is DiscCrop {
  if (!value || typeof value !== 'object') return false;
  const v = value as DiscCrop;
  return Number.isFinite(v.zoom) && v.zoom >= 1 && v.zoom <= 4
    && Number.isFinite(v.x) && Math.abs(v.x) <= 1 && Number.isFinite(v.y) && Math.abs(v.y) <= 1;
}
export function validDiscImages(value: unknown): value is DiscImage[] {
  if (!Array.isArray(value) || value.length > 4) return false;
  const owners = new Set<number>();
  for (const image of value) {
    if (!image || !Number.isInteger(image.owner) || image.owner < 0 || image.owner > 3 || owners.has(image.owner)
      || typeof image.name !== 'string' || image.name.length > 120 || !validCrop(image.crop)) return false;
    for (const field of ['source', 'data'] as const)
      if (typeof image[field] !== 'string' || image[field].length > 2_000_000 || !/^data:image\/(jpeg|png|webp);base64,/.test(image[field])) return false;
    owners.add(image.owner);
  }
  return true;
}
export function cropTransform(width: number, height: number, crop: DiscCrop, size: number) {
  if (![width, height, size].every(n => Number.isFinite(n) && n > 0) || !validCrop(crop)) throw new Error('Invalid crop.');
  const scale = Math.max(size / width, size / height) * crop.zoom;
  const w = width * scale, h = height * scale;
  const panX = Math.max(0, (w - size) / 2), panY = Math.max(0, (h - size) / 2);
  return { left: (size - w) / 2 + crop.x * panX, top: (size - h) / 2 + crop.y * panY, width: w, height: h, panX, panY };
}
export function drawDiscCrop(ctx: CanvasRenderingContext2D, image: HTMLImageElement, crop: DiscCrop, size: number) {
  const t = cropTransform(image.naturalWidth, image.naturalHeight, crop, size);
  ctx.clearRect(0, 0, size, size); ctx.save();
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#fff4dc'; ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, t.left, t.top, t.width, t.height); ctx.restore();
}
export function openDiscImage(data: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That picture could not be opened.'));
    image.src = data;
  });
}
export async function prepareDiscImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type) || file.size > 10 * 1024 * 1024)
    throw new Error('Choose a PNG, JPEG, WebP, GIF or AVIF picture smaller than 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await openDiscImage(url);
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 64_000_000) throw new Error('That picture is too large. Choose a smaller image.');
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image processing is unavailable in this browser.');
    ctx.fillStyle = '#fff4dc'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally { URL.revokeObjectURL(url); }
}
function openImages(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('crokinole-disc-images', 1);
    let settled = false;
    const fail = (error: unknown) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } };
    const timer = window.setTimeout(() => fail(new Error('Picture storage did not respond.')), 5000);
    request.onupgradeneeded = () => {
      if (settled) request.transaction?.abort();
      else request.result.createObjectStore('images');
    };
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true; clearTimeout(timer); resolve(request.result);
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new Error('Picture storage is busy in another tab.'));
  });
}
export async function loadDiscImages(): Promise<DiscImage[]> {
  const db = await openImages();
  try {
    const stored: unknown = await new Promise((resolve, reject) => {
      const transaction = db.transaction('images'); const request = transaction.objectStore('images').get('faces');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
    if (stored === undefined) return [];
    if (!validDiscImages(stored)) throw new Error('Saved disc pictures could not be read.');
    return stored;
  } finally { db.close(); }
}
// Merge a single owner's mutation inside the shared read/write transaction.
// A stale tab must never replace another owner's newer picture or clear corrupt data.
export async function updateDiscImage(owner: number, image?: DiscImage): Promise<DiscImage[]> {
  if (!Number.isInteger(owner) || owner < 0 || owner > 3 || (image !== undefined && (!image || image.owner !== owner || !validDiscImages([image]))))
    throw new Error('Invalid disc picture.');
  const db = await openImages();
  try {
    return await new Promise<DiscImage[]>((resolve, reject) => {
      const transaction = db.transaction('images', 'readwrite'), store = transaction.objectStore('images');
      let next: DiscImage[] = [], failure: unknown;
      transaction.oncomplete = () => resolve(next);
      transaction.onabort = transaction.onerror = () => reject(failure ?? transaction.error);
      const request = store.get('faces');
      request.onsuccess = () => {
        try {
          const current: unknown = request.result === undefined ? [] : request.result;
          if (!validDiscImages(current)) throw new Error('Saved disc pictures could not be read.');
          next = current.filter(entry => entry.owner !== owner);
          if (image) next.push(image);
          next.sort((a, b) => a.owner - b.owner); store.put(next, 'faces');
        } catch (error) { failure = error; transaction.abort(); }
      };
    });
  } finally { db.close(); }
}
export async function saveDiscImages(images: DiscImage[]) {
  if (!validDiscImages(images)) throw new Error('Invalid disc pictures.');
  const db = await openImages();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('images', 'readwrite'); transaction.objectStore('images').put(images, 'faces');
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
