import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DISC_PALETTES, DISC_EMBLEMS, defaultDiscAppearance, discColors, type DiscAppearance } from '../src/disc-appearance';
import { drawDiscFace } from '../src/render/disc-design';
import { createScene, makeDiscGeometry } from '../src/render/scene';
import { DISC } from '../src/sim/constants';
import type { Disc } from '../src/sim/physics';

const runtime = vi.hoisted(() => ({ scene: undefined as unknown }));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    shadowMap = {};
    setPixelRatio() {}
    setSize() {}
    render(scene: unknown) { runtime.scene = scene; }
    dispose() {}
  } };
});

// A command-recording Canvas2D fake, not a synthetic pixel renderer.
function recordingCanvas() {
  const commands: unknown[][] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    set(target, name, value) {
      target[String(name)] = value;
      // Record gradient construction/stops separately, not closure identity.
      commands.push(['set', name, value && typeof value === 'object' && 'addColorStop' in value ? 'gradient' : value]);
      return true;
    },
    get(target, name) {
      if (name in target) return target[String(name)];
      return (...args: unknown[]) => {
        commands.push([name, ...args]);
        if (String(name).includes('Gradient')) return {
          addColorStop: (...stop: unknown[]) => commands.push(['colorStop', ...stop]),
        };
      };
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, commands };
}
function record(appearance = defaultDiscAppearance(), owner = 0, photo?: CanvasImageSource) {
  const { ctx, commands } = recordingCanvas();
  drawDiscFace(ctx, 256, appearance, owner, photo);
  return commands;
}
function appearance(style: DiscAppearance['style'] = 'wood', emblem: DiscAppearance['emblems'][number] = 'none'): DiscAppearance {
  return { ...defaultDiscAppearance(), style, emblems: [emblem, 'none', 'none', 'none'] };
}

const rendererSource = readFileSync(new URL('../src/render/scene.ts', import.meta.url), 'utf8');
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('deterministic flat disc face artwork', () => {
  it.each(['wood', 'poker'] as const)('clears and clips %s to the full circular square bounds, restoring caller state', style => {
    const commands = record(appearance(style));
    expect(commands).toContainEqual(['clearRect', 0, 0, 256, 256]);
    expect(commands).toContainEqual(['resetTransform']);
    expect(commands).toContainEqual(['arc', 0, 0, 1, 0, Math.PI * 2]);
    expect(commands.findIndex(c => c[0] === 'clip')).toBeLessThan(commands.findIndex(c => c[0] === 'fill'));
    expect(commands.filter(c => c[0] === 'save').length).toBe(commands.filter(c => c[0] === 'restore').length);
    expect(commands.at(-1)).toEqual(['restore']);
  });
  it.each(['wood', 'poker'] as const)('repeats exactly for %s without random, clock or source mutation', style => {
    const a = appearance(style, 'star'), before = structuredClone(a);
    expect(record(a)).toEqual(record(a));
    expect(a).toEqual(before);
    const source = readFileSync(new URL('../src/render/disc-design.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/Math\.random|Date\.|performance\./);
  });
  it('has visible directional grain and a different poker command sequence', () => {
    const wood = record(), poker = record(appearance('poker'));
    expect(wood.filter(c => c[0] === 'stroke').length).toBeGreaterThan(15);
    expect(wood).not.toEqual(poker);
    // Cream insert wedges have unequal angular widths, breaking rotational symmetry.
    const wedges = poker.filter(c => c[0] === 'arc' && c[3] === 0.985 && c.length === 6);
    const widths = new Set(wedges.map(c => (Number(c[5]) - Number(c[4])).toFixed(4)));
    expect(widths.size).toBeGreaterThan(1);
  });
  it.each(DISC_PALETTES.map(p => p.id))('retains each exact owner color on the outer rim for %s', palette => {
    for (const style of ['wood', 'poker'] as const) for (let owner = 0; owner < 4; owner++) {
      const a = { ...appearance(style), palette }, commands = record(a, owner);
      expect(commands.filter(c => c[0] === 'set' && c[1] === 'strokeStyle').at(-1)?.[2]).toBe(discColors(a)[owner]);
    }
  });
  it.each(['wood', 'poker'] as const)('gives all built-in %s emblems distinct printed paths', style => {
    const signatures = DISC_EMBLEMS.map(e => JSON.stringify(record(appearance(style, e.id))));
    expect(new Set(signatures).size).toBe(DISC_EMBLEMS.length);
  });
  it('gates photos per owner and center-crops rectangular images inside a circle with the rim above them', () => {
    const photo = { naturalWidth: 800, naturalHeight: 400 } as HTMLImageElement;
    const a = appearance('wood', 'photo');
    expect(record(a, 1, photo).some(c => c[0] === 'drawImage')).toBe(false);
    expect(record(appearance(), 0, photo).some(c => c[0] === 'drawImage')).toBe(false);
    expect(record(a).some(c => c[0] === 'drawImage')).toBe(false);
    const commands = record(a, 0, photo), image = commands.find(c => c[0] === 'drawImage')!;
    expect(image.slice(2, 6)).toEqual([200, 0, 400, 400]);
    expect(commands.filter(c => c[0] === 'clip')).toHaveLength(2);
    expect(commands.findLastIndex(c => c[0] === 'stroke')).toBeGreaterThan(commands.indexOf(image));
    expect(record(a, 0, { naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement).some(c => c[0] === 'drawImage')).toBe(false);
    expect(record(a, 0, { width: 400, height: 800 } as HTMLCanvasElement).find(c => c[0] === 'drawImage')?.slice(2, 6)).toEqual([0, 200, 400, 400]);
  });
});

function makeScene() {
  vi.stubGlobal('window', {
    devicePixelRatio: 1, innerWidth: 800, innerHeight: 800,
    matchMedia: () => ({ matches: true }), addEventListener() {}, removeEventListener() {},
  });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => recordingCanvas().ctx }) });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const canvas = { clientWidth: 800, clientHeight: 800, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }) } as HTMLCanvasElement;
  const api = createScene(canvas);
  const scene = runtime.scene as THREE.Scene;
  const discs = () => scene.children.filter(o => o instanceof THREE.Mesh && o.geometry.type === 'LatheGeometry' && o.geometry.parameters.segments === 48) as THREE.Mesh<THREE.LatheGeometry, THREE.MeshStandardMaterial>[];
  return { api, discs };
}
function disc(id: number, owner: number, angle = 0): Disc {
  return { id, owner, x: id, y: 8, z: 0, vx: 0, vy: 0, vz: 0, angle, omega: 0, state: 'board' } as Disc;
}
function face(mesh: THREE.Mesh) { return mesh.children[0] as THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>; }

describe('scene cosmetic integration with real Three geometry and materials', () => {
  it('preserves the physical lathe and attaches a flat upward face to the spin/tilt parent', () => {
    const geometry = makeDiscGeometry();
    expect(geometry.parameters.segments).toBe(48);
    expect(Math.max(...geometry.parameters.points.map(p => p.x))).toBe(DISC.radius);
    expect(Math.max(...geometry.parameters.points.map(p => p.y))).toBe(DISC.height / 2);
    expect(Math.min(...geometry.parameters.points.map(p => p.y))).toBe(-DISC.height / 2);
    geometry.dispose();
    const { api, discs } = makeScene(), d = disc(1, 0, 0.73), before = structuredClone(d);
    api.syncDiscs([d]);
    const mesh = discs()[0], printedFace = face(mesh);
    expect(printedFace.parent).toBe(mesh);
    expect(printedFace.geometry.type).toBe('CircleGeometry');
    expect(printedFace.geometry.parameters.radius).toBe(DISC.radius - DISC.edgeRadius);
    expect(printedFace.position.y).toBe(DISC.height / 2);
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(printedFace.quaternion).y).toBeCloseTo(1);
    expect(printedFace.material.polygonOffset).toBe(true);
    expect(printedFace.material.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(mesh.quaternion.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -d.angle))).toBeCloseTo(0);
    const tilted = { ...d, hole: { tilt: 0.3, lean: 0.5, dip: 0, rollPhase: 0.2 } } as Disc;
    api.syncDiscs([tilted]);
    const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.sin(0.5), 0, -Math.cos(0.5)), 0.3)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.2 - d.angle));
    expect(mesh.quaternion.angleTo(expected)).toBeCloseTo(0);
    expect(d).toEqual(before);
    expect(rendererSource).not.toMatch(/inlayGeo|inlayMaterial|const inlay =/);
    api.dispose();
  });
  it('shares at most four owner textures across existing/future discs and never rebuilds on sync or identical settings', () => {
    const { api, discs } = makeScene();
    api.syncDiscs(Array.from({ length: 12 }, (_, i) => disc(i, i % 4)));
    const textures = discs().map(m => face(m).material.map);
    expect(new Set(textures).size).toBe(4);
    const a = defaultDiscAppearance();
    api.setDiscAppearance(a);
    a.emblems[0] = 'star'; // Setter must retain its own snapshot.
    api.syncDiscs(Array.from({ length: 13 }, (_, i) => disc(i, i % 4, 0.7)));
    expect(discs().slice(0, 12).map(m => face(m).material.map)).toEqual(textures);
    expect(face(discs()[12]).material.map).toBe(textures[0]);
    api.dispose();
  });
  it('replaces appearance immediately, disposes superseded shared resources once, and preserves transforms/highlights', () => {
    const { api, discs } = makeScene(), ds = [disc(1, 0, 0.9), disc(2, 0), disc(3, 1)];
    api.highlightDisc(1); api.syncDiscs(ds);
    const meshes = discs(), firstFace = face(meshes[0]), oldTexture = firstFace.material.map!, oldFaceMat = firstFace.material;
    const textureDispose = vi.spyOn(oldTexture, 'dispose'), materialDispose = vi.spyOn(oldFaceMat, 'dispose');
    const position = meshes[0].position.clone(), rotation = meshes[0].quaternion.clone();
    const a = { ...appearance('poker', 'moon'), palette: 'jewel' as const };
    api.setDiscAppearance(a);
    expect(face(meshes[0])).toBe(firstFace);
    expect(firstFace.material.map).not.toBe(oldTexture);
    expect(face(meshes[1]).material).toBe(firstFace.material);
    expect(meshes[0].material.color.getHexString()).toBe(discColors(a)[0].slice(1));
    expect(meshes[0].position.equals(position)).toBe(true);
    expect(meshes[0].quaternion.equals(rotation)).toBe(true);
    expect(meshes[0].material.emissiveIntensity).toBeGreaterThan(0);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    api.dispose();
    expect(textureDispose).toHaveBeenCalledTimes(1);
  });
  it('updates only changed owners/photos and releases disc-local clones separately from shared face assets', () => {
    const { api, discs } = makeScene();
    api.syncDiscs([disc(1, 0), disc(2, 1)]);
    const [m0, m1] = discs(), unchanged = face(m1).material.map;
    api.setDiscAppearance(appearance('wood', 'photo'), [{ naturalWidth: 400, naturalHeight: 400 } as HTMLImageElement]);
    expect(face(m1).material.map).toBe(unchanged);
    const localDispose = vi.spyOn(m0.material, 'dispose'), sharedFace = face(m0).material;
    const sharedDispose = vi.spyOn(sharedFace, 'dispose'), textureDispose = vi.spyOn(sharedFace.map!, 'dispose');
    const geometryDispose = vi.spyOn(m0.geometry, 'dispose'), faceGeometryDispose = vi.spyOn(face(m0).geometry, 'dispose');
    api.syncDiscs([disc(2, 1)]);
    expect(localDispose).toHaveBeenCalledTimes(1);
    expect(m0.children).toHaveLength(0);
    expect(sharedDispose).not.toHaveBeenCalled();
    api.dispose();
    expect(sharedDispose).toHaveBeenCalledTimes(1);
    expect(textureDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(faceGeometryDispose).toHaveBeenCalledTimes(1);
    expect(localDispose).toHaveBeenCalledTimes(1);
  });
  it('applies settings made before creation and bounds/disposes the live owner cache through repeated changes', () => {
    const { api, discs } = makeScene();
    api.setDiscAppearance({ ...appearance('poker', 'bolt'), palette: 'earth' });
    api.syncDiscs(Array.from({ length: 8 }, (_, i) => disc(i, i % 4)));
    expect(discs()[0].material.color.getHexString()).toBe(DISC_PALETTES.find(p => p.id === 'earth')!.colors[0].slice(1));
    for (let i = 0; i < 12; i++) {
      const previousTextures = [...new Set(discs().map(m => face(m).material.map!))];
      const disposals = previousTextures.map(t => vi.spyOn(t, 'dispose'));
      const next = { ...appearance(i % 2 ? 'poker' : 'wood', 'leaf'), palette: DISC_PALETTES[i % 4].id };
      api.setDiscAppearance(next);
      const currentTextures = new Set(discs().map(m => face(m).material.map));
      expect(currentTextures.size).toBe(4);
      for (const texture of previousTextures) expect(currentTextures.has(texture)).toBe(false);
      for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
    }
    api.dispose();
  });
});
