import { describe, expect, it } from 'vitest';
import { defaultDiscAppearance, discColors, DISC_PALETTES, mergeDiscAppearance, validDiscAppearance } from '../src/disc-appearance';
import { cropTransform, defaultCrop, validDiscImages, type DiscImage } from '../src/storage/disc-images';

const image: DiscImage = { owner: 0, name: 'Family.png', source: 'data:image/png;base64,AAAA', data: 'data:image/png;base64,AAAA', crop: defaultCrop() };
describe('cosmetic disc preferences', () => {
  it('uses wood, original ownership colors and no dash/emblem by default', () => {
    expect(validDiscAppearance(defaultDiscAppearance())).toBe(true);
    expect(discColors(defaultDiscAppearance())).toEqual(['#dc6853', '#6cabbe', '#e7b95c', '#94ad76']);
    expect(defaultDiscAppearance().emblems).toEqual(['none', 'none', 'none', 'none']);
  });
  it('does not share mutable default face choices', () => {
    const a = defaultDiscAppearance(); a.emblems[0] = 'photo';
    expect(defaultDiscAppearance().emblems[0]).toBe('none');
  });
  it('merges only the selected owner into the latest preference record', () => {
    const current = { ...defaultDiscAppearance(), style: 'poker' as const, emblems: ['photo', 'none', 'leaf', 'bolt'] as const };
    const a = { ...current, emblems: [...current.emblems] };
    expect(mergeDiscAppearance(a, { emblem: { owner: 1, value: 'photo' } })).toEqual({ ...a, emblems: ['photo', 'photo', 'leaf', 'bolt'] });
    expect(a.emblems).toEqual(['photo', 'none', 'leaf', 'bolt']);
  });
  it('applies explicit style/color choices without replacing other owner faces', () => {
    const current = { ...defaultDiscAppearance(), emblems: ['photo', 'moon', 'leaf', 'bolt'] as const };
    expect(mergeDiscAppearance({ ...current, emblems: [...current.emblems] }, { style: 'wood', palette: 'earth' })).toEqual({ ...current, style: 'wood', palette: 'earth' });
  });
  it('removing a picture clears only a selected photo, never a printed emblem', () => {
    const current = { ...defaultDiscAppearance(), emblems: ['moon', 'photo', 'leaf', 'bolt'] as const };
    const a = { ...current, emblems: [...current.emblems] };
    expect(mergeDiscAppearance(a, { emblem: { owner: 0, value: 'none', ifPhoto: true } }).emblems).toEqual(current.emblems);
    expect(mergeDiscAppearance(a, { emblem: { owner: 1, value: 'none', ifPhoto: true } }).emblems).toEqual(['moon', 'none', 'leaf', 'bolt']);
  });
  it('validates every palette and rejects invalid style/owner selections', () => {
    for (const palette of DISC_PALETTES) expect(validDiscAppearance({ ...defaultDiscAppearance(), palette: palette.id })).toBe(true);
    for (const bad of [null, {}, { ...defaultDiscAppearance(), style: 'engraved' }, { ...defaultDiscAppearance(), palette: 'missing' }, { ...defaultDiscAppearance(), emblems: ['photo'] }, { ...defaultDiscAppearance(), emblems: ['dash', 'none', 'none', 'none'] }]) expect(validDiscAppearance(bad)).toBe(false);
  });
});
describe('local disc image validation and circular cropping', () => {
  it('accepts a bounded raster record per owner, including all four', () => {
    expect(validDiscImages([])).toBe(true);
    expect(validDiscImages([image])).toBe(true);
    expect(validDiscImages(Array.from({ length: 4 }, (_, owner) => ({ ...image, owner })))).toBe(true);
  });
  it('rejects external/SVG sources, duplicates, nonfinite transforms and invalid owners', () => {
    for (const bad of [null, {}, [image, image], [{ ...image, owner: -1 }], [{ ...image, owner: 4 }], [{ ...image, data: 'https://example.com/photo.png' }], [{ ...image, source: 'data:image/svg+xml;base64,AAAA' }], [{ ...image, crop: { zoom: NaN, x: 0, y: 0 } }], [{ ...image, crop: { zoom: 5, x: 0, y: 0 } }], [{ ...image, crop: { zoom: 1, x: 2, y: 0 } }]]) expect(validDiscImages(bad)).toBe(false);
  });
  it('covers the crop square at every legal pan and zoom without empty edges', () => {
    for (const [width, height] of [[1200, 600], [600, 1200], [800, 800], [40, 2000]])
      for (const zoom of [1, 1.5, 4]) for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) {
        const t = cropTransform(width, height, { zoom, x, y }, 256);
        expect(t.left).toBeLessThanOrEqual(1e-9); expect(t.top).toBeLessThanOrEqual(1e-9);
        expect(t.left + t.width).toBeGreaterThanOrEqual(256 - 1e-9);
        expect(t.top + t.height).toBeGreaterThanOrEqual(256 - 1e-9);
      }
  });
  it('matches centered cover fit and guards bad dimensions/transforms', () => {
    expect(cropTransform(1200, 600, defaultCrop(), 256)).toEqual({ left: -128, top: 0, width: 512, height: 256, panX: 128, panY: 0 });
    for (const dims of [[0, 20], [20, 0], [NaN, 20]]) expect(() => cropTransform(dims[0], dims[1], defaultCrop(), 256)).toThrow();
    expect(() => cropTransform(100, 100, { zoom: Infinity, x: 0, y: 0 }, 256)).toThrow();
  });
});
