import { ARTWORK_SLOTS, loadArtworkLibrary, saveArtworkLibrary, type ArtworkLibrary } from './storage/artwork';

function openImage(data: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That image could not be opened.'));
    image.src = data;
  });
}
async function prepareImage(file: File) {
  if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) throw new Error('Choose an image smaller than 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await openImage(url);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f3efe5'; ctx.fillRect(0, 0, 1024, 1024);
    const scale = Math.max(1024 / image.width, 1024 / image.height);
    ctx.drawImage(image, (1024 - image.width * scale) / 2, (1024 - image.height * scale) / 2, image.width * scale, image.height * scale);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}

export function setupBoardArtwork(scene: { setSkin: (skin: string, art?: HTMLImageElement) => void }, skin: HTMLSelectElement) {
  const grid = document.getElementById('artwork-gallery')!;
  const input = document.getElementById('art') as HTMLInputElement;
  const finish = document.getElementById('use-finish') as HTMLButtonElement;
  const note = document.getElementById('artwork-note')!;
  let library: ArtworkLibrary = { artworks: [], selectedId: null };
  let busy = true, uploadSlot = 1, appliedVersion = 0;
  let focusSlot: string | null = null;
  function render() {
    const focused = document.activeElement?.closest<HTMLElement>('.artwork-slot');
    if (focused && grid.contains(focused)) focusSlot = focused.dataset.slot ?? null;
    grid.replaceChildren();
    for (let id = 1; id <= ARTWORK_SLOTS; id++) {
      const art = library.artworks.find(a => a.id === id);
      const card = document.createElement('div'); card.className = 'artwork-slot'; card.dataset.slot = String(id);
      const select = document.createElement('button'); select.type = 'button'; select.className = 'artwork-preview';
      select.dataset.slot = String(id); select.disabled = busy;
      select.setAttribute('aria-label', art ? `Use ${art.name}, slot ${id}` : `Upload artwork to slot ${id}`);
      select.setAttribute('aria-pressed', String(!!art && library.selectedId === id));
      if (art) {
        const image = document.createElement('img'); image.src = art.data; image.alt = ''; select.append(image);
        select.addEventListener('click', () => { void commit({ ...library, selectedId: id }, 'Artwork selected.'); });
      } else {
        select.textContent = '+ Add artwork';
        select.addEventListener('click', () => { uploadSlot = id; input.click(); });
      }
      card.append(select);
      const caption = document.createElement('span'); caption.className = 'artwork-name'; caption.textContent = art?.name ?? `Slot ${id}`; card.append(caption);
      if (art) {
        const actions = document.createElement('div'); actions.className = 'artwork-actions';
        const replace = document.createElement('button'); replace.type = 'button'; replace.textContent = 'Replace'; replace.disabled = busy;
        replace.setAttribute('aria-label', `Replace artwork in slot ${id}`);
        replace.addEventListener('click', () => { uploadSlot = id; input.click(); });
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Delete'; remove.disabled = busy;
        remove.setAttribute('aria-label', `Delete artwork in slot ${id}`);
        remove.addEventListener('click', () => { void commit({ artworks: library.artworks.filter(a => a.id !== id), selectedId: library.selectedId === id ? null : library.selectedId }, 'Artwork deleted.'); });
        actions.append(replace, remove); card.append(actions);
      }
      grid.append(card);
    }
    skin.disabled = input.disabled = finish.disabled = busy;
    finish.setAttribute('aria-pressed', String(library.selectedId === null));
    if (!busy && focusSlot) {
      grid.querySelector<HTMLButtonElement>(`.artwork-preview[data-slot="${focusSlot}"]`)?.focus({ preventScroll: true });
      focusSlot = null;
    }
  }
  async function apply() {
    const version = ++appliedVersion;
    const art = library.artworks.find(a => a.id === library.selectedId);
    if (!art) { scene.setSkin(skin.value); return; }
    const image = await openImage(art.data);
    if (version === appliedVersion) scene.setSkin(skin.value, image);
  }
  async function commit(next: ArtworkLibrary, message: string) {
    if (busy) return;
    busy = true; render();
    try {
      await saveArtworkLibrary(next);
      library = next; await apply(); note.textContent = message;
    } catch { note.textContent = 'Could not save artwork in this browser. Your saved images have been kept. Check available browser storage and try again.'; }
    finally { busy = false; render(); }
  }
  input.addEventListener('change', async () => {
    const file = input.files?.[0]; input.value = ''; if (!file || busy) return;
    busy = true; render(); note.textContent = 'Preparing artwork…';
    let data: string;
    try { data = await prepareImage(file); }
    catch (error) { note.textContent = error instanceof Error ? error.message : 'That image could not be opened.'; busy = false; render(); return; }
    busy = false;
    await commit({ artworks: [...library.artworks.filter(a => a.id !== uploadSlot), { id: uploadSlot, name: file.name.slice(0, 120), data }].sort((a, b) => a.id - b.id), selectedId: uploadSlot }, 'Artwork saved and selected.');
  });
  finish.addEventListener('click', () => { void commit({ ...library, selectedId: null }, 'Board finish selected. Your artwork is still saved.'); });
  skin.addEventListener('change', () => {
    try { localStorage.setItem('crokinole-skin', skin.value); } catch { /* optional */ }
    void commit({ ...library, selectedId: null }, 'Board finish selected. Your artwork is still saved.');
  });
  render();
  void loadArtworkLibrary().then(async saved => {
    library = saved; await apply(); note.textContent = 'Save up to four images here. Images stay in this browser.';
    busy = false; render();
  }).catch(() => {
    note.textContent = 'Saved artwork could not be opened. Reload to try again; your saved images have been kept.';
    skin.disabled = false; // Leave built-in finishes available even when storage is unavailable.
    skin.addEventListener('change', () => scene.setSkin(skin.value));
  });
}
