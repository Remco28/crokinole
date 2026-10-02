import { defaultDiscAppearance, DISC_APPEARANCE_KEY, DISC_EMBLEMS, DISC_PALETTES, discColors, mergeDiscAppearance, validDiscAppearance, type DiscAppearance, type DiscAppearanceChange } from './disc-appearance';
import { PLAYER_NAMES } from './game/players';
import { drawDiscFace } from './render/disc-design';
import { cropTransform, defaultCrop, drawDiscCrop, loadDiscImages, openDiscImage, prepareDiscImage, updateDiscImage, type DiscCrop, type DiscImage } from './storage/disc-images';

export function setupDiscSettings(scene: { setDiscAppearance: (appearance: DiscAppearance, photos?: Array<HTMLImageElement | undefined>) => void }) {
  let appearance = defaultDiscAppearance();
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(DISC_APPEARANCE_KEY) || 'null');
    if (validDiscAppearance(saved)) appearance = saved;
  } catch { /* Built-in designs work without storage. */ }
  const section = document.createElement('section'); section.className = 'disc-settings'; section.setAttribute('aria-labelledby', 'disc-design-title');
  section.innerHTML = `
    <h3 id="disc-design-title">Playing discs</h3>
    <div class="disc-style-options" role="group" aria-label="Disc style">
      <button type="button" data-disc-style="wood"><canvas width="192" height="192" aria-hidden="true"></canvas><strong>Stained wood</strong></button>
      <button type="button" data-disc-style="poker"><canvas width="192" height="192" aria-hidden="true"></canvas><strong>Poker chip</strong></button>
    </div>
    <div class="disc-setting-label" id="disc-colors-label">Colors</div>
    <div id="disc-palettes" role="group" aria-labelledby="disc-colors-label"></div>
    <div class="disc-setting-label" id="disc-faces-label">Personalize a disc</div>
    <div id="disc-owners" role="group" aria-labelledby="disc-faces-label"></div>
    <div class="disc-face-heading"><h4 id="disc-face-title">Red’s disc</h4><span>Printed designs · no engraving</span></div>
    <div id="disc-emblems" role="group" aria-label="Disc emblem"></div>
    <input id="disc-picture-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" aria-label="Choose a disc picture" hidden>
    <div class="disc-picture-actions"><button id="disc-add-picture" type="button">Add a picture</button><button id="disc-use-picture" type="button" hidden>Use picture</button><button id="disc-edit-picture" type="button" hidden>Reframe</button><button id="disc-remove-picture" type="button" hidden>Remove</button></div>
    <div id="disc-crop-editor" hidden role="group" aria-labelledby="disc-crop-title">
      <h4 id="disc-crop-title">Position your picture</h4>
      <canvas id="disc-crop-preview" width="384" height="384" tabindex="0" aria-label="Picture crop. Drag to position, or use the arrow keys."></canvas>
      <p>Drag to position · arrow keys also work</p>
      <label for="disc-crop-zoom">Zoom <output id="disc-crop-zoom-value">1.0×</output></label>
      <input id="disc-crop-zoom" type="range" min="1" max="4" step="0.01" value="1">
      <div class="disc-crop-tools"><button id="disc-crop-reset" type="button">Recenter</button><button id="disc-crop-cancel" type="button">Cancel</button><button id="disc-crop-save" class="primary" type="button">Use picture</button></div>
    </div>
    <p class="disc-privacy">Pictures stay in this browser. Nothing is uploaded.</p>
    <p id="disc-design-note" role="status">Opening your saved pictures…</p>`;
  document.getElementById('skin')!.parentElement!.before(section);
  const $ = <T extends HTMLElement>(id: string) => section.querySelector<T>(`#${id}`)!;
  const settings = document.getElementById('settings') as HTMLDialogElement;
  const note = $('disc-design-note'), input = $<HTMLInputElement>('disc-picture-input');
  const cropCanvas = $<HTMLCanvasElement>('disc-crop-preview'), zoom = $<HTMLInputElement>('disc-crop-zoom');
  let owner = 0, images: DiscImage[] = [], busy = true, unavailable = false, applyVersion = 0, loadToken = 0;
  let editing: { owner: number; name: string; source: string; image: HTMLImageElement; crop: DiscCrop } | null = null;
  let drag: { id: number; x: number; y: number; crop: DiscCrop } | null = null;
  const decoded = new Map<number, { data: string; image: HTMLImageElement }>();
  let preferencesUnsaved = false;
  for (const palette of DISC_PALETTES) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.discPalette = palette.id;
    button.setAttribute('aria-label', `${palette.name} disc colors`);
    const dots = document.createElement('span'); dots.className = 'disc-palette-dots'; dots.setAttribute('aria-hidden', 'true');
    for (const color of palette.colors) { const dot = document.createElement('i'); dot.style.background = color; dots.append(dot); }
    const label = document.createElement('span'); label.textContent = palette.name; button.append(dots, label);
    button.addEventListener('click', () => { choose({ palette: palette.id }); }); $('disc-palettes').append(button);
  }
  for (let index = 0; index < 4; index++) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.discOwner = String(index);
    button.setAttribute('aria-label', `Personalize ${PLAYER_NAMES[index]}'s disc`);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; canvas.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span'); name.textContent = PLAYER_NAMES[index]; button.append(canvas, name);
    button.addEventListener('click', () => { if (!busy && !editing) { owner = index; render(); } }); $('disc-owners').append(button);
  }
  for (const emblem of DISC_EMBLEMS) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.discEmblem = emblem.id;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96; canvas.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span'); name.textContent = emblem.name; button.append(canvas, name);
    button.addEventListener('click', () => {
      choose({ emblem: { owner, value: emblem.id } });
    }); $('disc-emblems').append(button);
  }
  function face(canvas: HTMLCanvasElement, config: DiscAppearance, index: number) {
    const ctx = canvas.getContext('2d'); if (ctx) drawDiscFace(ctx, canvas.width, config, index, decoded.get(index)?.image);
  }
  function render() {
    const locked = busy || !!editing;
    for (const button of section.querySelectorAll<HTMLButtonElement>('[data-disc-style]')) {
      const style = button.dataset.discStyle as DiscAppearance['style']; button.disabled = locked;
      button.setAttribute('aria-pressed', String(appearance.style === style)); face(button.querySelector('canvas')!, { ...appearance, style }, owner);
    }
    for (const button of section.querySelectorAll<HTMLButtonElement>('[data-disc-palette]')) {
      button.disabled = locked; button.setAttribute('aria-pressed', String(appearance.palette === button.dataset.discPalette));
    }
    for (const button of section.querySelectorAll<HTMLButtonElement>('[data-disc-owner]')) {
      const index = Number(button.dataset.discOwner); button.disabled = locked;
      button.setAttribute('aria-pressed', String(owner === index)); face(button.querySelector('canvas')!, appearance, index);
      button.style.setProperty('--disc-color', discColors(appearance)[index]);
    }
    for (const button of section.querySelectorAll<HTMLButtonElement>('[data-disc-emblem]')) {
      button.disabled = locked; const emblem = button.dataset.discEmblem as DiscAppearance['emblems'][number];
      button.setAttribute('aria-pressed', String(appearance.emblems[owner] === emblem));
      face(button.querySelector('canvas')!, { ...appearance, emblems: appearance.emblems.map((e, i) => i === owner ? emblem : e) }, owner);
    }
    $('disc-face-title').textContent = `${PLAYER_NAMES[owner]}’s disc`;
    const picture = images.find(i => i.owner === owner);
    $<HTMLButtonElement>('disc-add-picture').textContent = picture ? 'Change picture' : 'Add a picture';
    for (const id of ['disc-use-picture', 'disc-edit-picture', 'disc-remove-picture']) $(id).hidden = !picture;
    $('disc-use-picture').setAttribute('aria-pressed', String(appearance.emblems[owner] === 'photo'));
    for (const button of section.querySelectorAll<HTMLButtonElement>('.disc-picture-actions button')) button.disabled = locked || unavailable;
    input.disabled = locked || unavailable;
    $('disc-crop-editor').hidden = !editing;
    for (const button of section.querySelectorAll<HTMLButtonElement>('.disc-crop-tools button')) button.disabled = busy;
    zoom.disabled = busy;
  }
  async function apply() {
    const version = ++applyVersion;
    const photos = await Promise.all(Array.from({ length: 4 }, async (_, index) => {
      const entry = images.find(i => i.owner === index);
      if (!entry) { decoded.delete(index); return undefined; }
      if (decoded.get(index)?.data === entry.data) return decoded.get(index)!.image;
      try { const image = await openDiscImage(entry.data); decoded.set(index, { data: entry.data, image }); return image; }
      catch { decoded.delete(index); note.textContent = 'A saved picture could not be opened. Try replacing it; the saved copy has been kept.'; return undefined; }
    }));
    if (version !== applyVersion) return;
    scene.setDiscAppearance(appearance, photos); render();
  }
  function savePreferences(change: DiscAppearanceChange) {
    // Read the latest record before applying only the explicit user choice.
    // Other tabs' owner faces must not be replaced by our startup snapshot.
    if (!preferencesUnsaved) try {
      const latest: unknown = JSON.parse(localStorage.getItem(DISC_APPEARANCE_KEY) || 'null');
      if (validDiscAppearance(latest)) appearance = latest;
    } catch { /* Apply this visit's choice even when storage is unavailable. */ }
    appearance = mergeDiscAppearance(appearance, change);
    try { localStorage.setItem(DISC_APPEARANCE_KEY, JSON.stringify(appearance)); preferencesUnsaved = false; }
    catch { preferencesUnsaved = true; note.textContent = 'Design applied for this visit. This browser could not save the preference.'; }
  }
  function choose(next: DiscAppearanceChange) {
    if (busy || editing) return;
    note.textContent = 'Design updated.'; savePreferences(next); render(); void apply();
  }
  for (const button of section.querySelectorAll<HTMLButtonElement>('[data-disc-style]')) button.addEventListener('click', () => {
    choose({ style: button.dataset.discStyle as DiscAppearance['style'] });
  });
  function drawCrop() {
    if (!editing) return;
    const ctx = cropCanvas.getContext('2d'); if (ctx) drawDiscCrop(ctx, editing.image, editing.crop, cropCanvas.width);
    zoom.value = String(editing.crop.zoom); $('disc-crop-zoom-value').textContent = `${editing.crop.zoom.toFixed(1)}×`;
  }
  function cancelCrop() { editing = null; drag = null; loadToken++; render(); }
  async function beginCrop(target: number, name: string, source: string, crop = defaultCrop()) {
    const token = ++loadToken; busy = true; render();
    try {
      const image = await openDiscImage(source);
      if (token !== loadToken || !settings.open) return;
      editing = { owner: target, name, source, image, crop: { ...crop } };
      $('disc-crop-title').textContent = `Picture for ${PLAYER_NAMES[target]}`;
      note.textContent = 'Adjust the circular crop, then use your picture.'; drawCrop();
    } catch (error) { note.textContent = error instanceof Error ? error.message : 'That picture could not be opened.'; }
    finally { busy = false; render(); }
    if (editing) { $('disc-crop-editor').scrollIntoView({ block: 'nearest' }); cropCanvas.focus({ preventScroll: true }); }
  }
  $('disc-add-picture').addEventListener('click', () => { if (!busy && !editing && !unavailable) input.click(); });
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; input.value = ''; if (!file || busy || unavailable || editing) return;
    const target = owner, token = ++loadToken; busy = true; render(); note.textContent = 'Preparing your picture…';
    try {
      const source = await prepareDiscImage(file);
      if (token !== loadToken || !settings.open) return;
      busy = false; await beginCrop(target, file.name.slice(0, 120), source);
    } catch (error) { note.textContent = error instanceof Error ? error.message : 'That picture could not be opened.'; }
    finally { busy = false; render(); }
  });
  $('disc-use-picture').addEventListener('click', () => {
    if (images.some(i => i.owner === owner)) choose({ emblem: { owner, value: 'photo' } });
  });
  $('disc-edit-picture').addEventListener('click', () => {
    const picture = images.find(i => i.owner === owner);
    if (picture && !busy && !unavailable) void beginCrop(owner, picture.name, picture.source, picture.crop);
  });
  $('disc-crop-cancel').addEventListener('click', () => { if (!busy) { cancelCrop(); note.textContent = 'Picture unchanged.'; $('disc-add-picture').focus(); } });
  $('disc-crop-reset').addEventListener('click', () => { if (editing && !busy) { editing.crop = defaultCrop(); drawCrop(); } });
  zoom.addEventListener('input', () => { if (editing && !busy) { editing.crop.zoom = Number(zoom.value); drawCrop(); } });
  cropCanvas.addEventListener('pointerdown', event => {
    if (!editing || busy || event.button !== 0) return;
    cropCanvas.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, crop: { ...editing.crop } }; cropCanvas.setPointerCapture(event.pointerId); event.preventDefault();
  });
  cropCanvas.addEventListener('pointermove', event => {
    if (!editing || !drag || drag.id !== event.pointerId || busy) return;
    const rect = cropCanvas.getBoundingClientRect();
    const t = cropTransform(editing.image.naturalWidth, editing.image.naturalHeight, editing.crop, cropCanvas.width);
    editing.crop.x = Math.max(-1, Math.min(1, drag.crop.x + (event.clientX - drag.x) * cropCanvas.width / rect.width / (t.panX || Infinity)));
    editing.crop.y = Math.max(-1, Math.min(1, drag.crop.y + (event.clientY - drag.y) * cropCanvas.height / rect.height / (t.panY || Infinity))); drawCrop();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) cropCanvas.addEventListener(type, () => { drag = null; });
  cropCanvas.addEventListener('keydown', event => {
    if (!editing || busy || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); const amount = event.shiftKey ? 0.15 : 0.04;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') editing.crop.x = Math.max(-1, Math.min(1, editing.crop.x + (event.key === 'ArrowLeft' ? -amount : amount)));
    else editing.crop.y = Math.max(-1, Math.min(1, editing.crop.y + (event.key === 'ArrowUp' ? -amount : amount))); drawCrop();
  });
  $('disc-crop-save').addEventListener('click', async () => {
    if (!editing || busy || unavailable) return;
    const edit = editing; busy = true; render(); note.textContent = 'Saving your picture…';
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image processing is unavailable.');
      drawDiscCrop(ctx, edit.image, edit.crop, 256);
      const next = { owner: edit.owner, name: edit.name, source: edit.source, data: canvas.toDataURL('image/png'), crop: { ...edit.crop } };
      images = await updateDiscImage(edit.owner, next);
      note.textContent = 'Picture saved on this device.';
      savePreferences({ emblem: { owner: edit.owner, value: 'photo' } });
      editing = null; drag = null; await apply();
    } catch { note.textContent = 'Could not save the picture in this browser. Your previous pictures have been kept. Try again or cancel.'; }
    finally { busy = false; render(); }
    if (!editing && settings.open) $('disc-add-picture').focus({ preventScroll: true });
  });
  $('disc-remove-picture').addEventListener('click', async () => {
    if (busy || editing || unavailable) return;
    const target = owner; busy = true; render();
    try {
      images = await updateDiscImage(target);
      note.textContent = 'Picture removed. Other players’ pictures are unchanged.';
      savePreferences({ emblem: { owner: target, value: 'none', ifPhoto: true } });
      await apply();
    } catch { note.textContent = 'Could not remove the picture. Your saved pictures have been kept.'; }
    finally { busy = false; render(); }
    $('disc-add-picture').focus({ preventScroll: true });
  });
  settings.addEventListener('cancel', event => { if (editing && !busy) { event.preventDefault(); cancelCrop(); note.textContent = 'Picture unchanged.'; } });
  settings.addEventListener('close', cancelCrop);
  scene.setDiscAppearance(appearance); render();
  void loadDiscImages().then(async saved => {
    images = saved; note.textContent = 'Wood grain and printed designs reveal the spin.'; await apply();
  }).catch(() => {
    unavailable = true; note.textContent = 'Saved pictures could not be opened. Built-in designs still work. Reload to retry; no saved pictures have been changed.';
  }).finally(() => { busy = false; render(); });
}
