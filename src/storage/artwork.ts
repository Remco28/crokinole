export const ARTWORK_SLOTS = 4;
export interface BoardArtwork { id: number; name: string; data: string }
export interface ArtworkLibrary { artworks: BoardArtwork[]; selectedId: number | null }

export function validLibrary(value: unknown): value is ArtworkLibrary {
  if (!value || typeof value !== 'object') return false;
  const library = value as ArtworkLibrary;
  if (!Array.isArray(library.artworks) || library.artworks.length > ARTWORK_SLOTS) return false;
  const ids = new Set<number>();
  for (const art of library.artworks) {
    if (!art || !Number.isInteger(art.id) || art.id < 1 || art.id > ARTWORK_SLOTS || ids.has(art.id) || typeof art.name !== 'string' || art.name.length > 120 || typeof art.data !== 'string' || art.data.length > 6_000_000 || !/^data:image\/(jpeg|png|webp);base64,/.test(art.data)) return false;
    ids.add(art.id);
  }
  return library.selectedId === null || ids.has(library.selectedId);
}

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('crokinole-artwork', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('library');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Artwork storage is busy in another tab.'));
  });
}
export async function saveArtworkLibrary(library: ArtworkLibrary) {
  if (!validLibrary(library)) throw new Error('Invalid artwork library');
  const db = await openLibrary();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('library', 'readwrite');
      transaction.objectStore('library').put(library, 'gallery');
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
export async function loadArtworkLibrary(): Promise<ArtworkLibrary> {
  const db = await openLibrary();
  let stored: unknown;
  try {
    stored = await new Promise((resolve, reject) => {
      const request = db.transaction('library').objectStore('library').get('gallery');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
  if (stored !== undefined) {
    if (!validLibrary(stored)) throw new Error('Saved artwork could not be read.');
    return stored;
  }
  let legacy: string | null = null;
  try { legacy = localStorage.getItem('crokinole-art'); } catch { /* optional */ }
  const library: ArtworkLibrary = { artworks: [], selectedId: null };
  if (legacy && /^data:image\/(jpeg|png|webp);base64,/.test(legacy)) {
    library.artworks.push({ id: 1, name: 'Your saved artwork', data: legacy });
    library.selectedId = 1;
    await saveArtworkLibrary(library);
    try { localStorage.removeItem('crokinole-art'); } catch { /* already migrated */ }
  }
  return library;
}
