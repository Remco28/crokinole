import * as THREE from 'three';
import { defaultDiscAppearance, discColors, type DiscAppearance } from '../disc-appearance';
import { drawDiscFace, drawDiscWoodSurface } from './disc-design';
import { discHalfHeight } from '../sim/hole';
import type { Disc } from '../sim/physics';
import { BOARD, DISC, PEGS, pegPositions } from '../sim/constants';
import { DITCH_SLOTS, REVIEW_TIMING, type ShotReview } from '../game/review';

import { TILT, cameraLevel, centeredOrbit, dragOrbit } from './orbit';
import { rimFrameAccel, stepRim, type RimMotion } from '../tubes';
import { TUBE_DIM, createTube, tubeEdgeDrop, dropDisc, stepTube, type TubeEvent, type TubeState } from '../tube-sim';
import { GENTLE, PULLBACK, RETURN, atRest, limitFocus, stepFocus, type FocusState, type FocusTuning, type Point } from './shot-camera';
import { SHOT_VIEW, cameraPose, shotCloseness, shownZoom, type BoardPoint } from './shot-framing';
export type { BoardView, CameraStop } from './orbit';
export { TILT, isSeated, nearestStop } from './orbit';
export { SHOT_VIEW } from './shot-framing';

// Disc cross-section with a real round-over on top/bottom edges
// (see reference photo: flat faces, softly rounded rim, ~1/16" radius).
// Exported so the sim phase reuses the exact same geometry.
export function makeDiscGeometry(): THREE.LatheGeometry {
  const R = DISC.radius;
  const H = DISC.height / 2;
  const er = DISC.edgeRadius;
  const arcSteps = 10;
  // NOTE: bottom-to-top order — LatheGeometry derives face winding from
  // profile direction, and top-down order flips normals inward.
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, -H), new THREE.Vector2(R - er, -H)];
  for (let i = 1; i <= arcSteps; i++) {
    const a = (i / arcSteps) * (Math.PI / 2);
    pts.push(new THREE.Vector2(R - er + Math.sin(a) * er, -H + er - Math.cos(a) * er));
  }
  pts.push(new THREE.Vector2(R, H - er));
  for (let i = 1; i <= arcSteps; i++) {
    const a = (i / arcSteps) * (Math.PI / 2);
    pts.push(
      new THREE.Vector2(R - er + Math.cos(a) * er, H - er + Math.sin(a) * er),
    );
  }
  pts.push(new THREE.Vector2(0, H));
  return new THREE.LatheGeometry(pts, 48);
}

// Appearance only: softly bowed sides, with the same overall bounds and flat
// footprints as the accepted physical disc. Do not change collision constants.
export function makeVisualDiscGeometry(): THREE.LatheGeometry {
  const R = DISC.radius, H = DISC.height / 2, er = DISC.edgeRadius;
  const pts = [new THREE.Vector2(0, -H), new THREE.Vector2(R - er, -H)];
  for (let i = 1; i <= 20; i++) {
    const a = i * Math.PI / 20;
    pts.push(new THREE.Vector2(R - er + Math.sin(a) * er, -Math.cos(a) * H));
  }
  pts.push(new THREE.Vector2(0, H));
  const geometry = new THREE.LatheGeometry(pts, 48);
  // Project grain in the same local plane as the top face, across its shoulder.
  const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, 0.5 + position.getX(i) / (2 * R), 0.5 - position.getZ(i) / (2 * R));
  }
  return geometry;
}

export function createScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#171d1c');

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const rig = new THREE.Group();
  scene.add(rig);
  rig.add(camera);

  let camDist = 48;
  let polar: number = TILT.overview;
  let polarTarget = polar;
  let zoomTarget = 1;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let yaw = 0;
  let yawTarget = 0;
  let playerYaw = 0;
  let orbitAngle = centeredOrbit(TILT.overview), invertVerticalDrag = false;
  // Shooter view: zooming in while a disc waits to be shot moves the eye down
  // and in behind that disc, keeping the board ahead in view. The anchor
  // follows the disc and stays put while the view eases back to the overview.
  let shotDisc: BoardPoint | null = null;
  let closeness = 0;
  const shotAnchor = { x: 0, y: 0 };
  // Optional shot camera: a slow pan toward where a shot settled. It translates
  // the whole view (no yaw, tilt or zoom), and at the shooter view moves the
  // anchor instead. focusStart is in clock seconds, so the glide waits for rest.
  let focusTarget: Point | null = null, focusStart = 0, focusPan: FocusState = atRest();
  const FAR_PAN = 0.3;
  let focusTuning: FocusTuning = GENTLE;
  let pull = 0, pullTarget = 0, panGain = FAR_PAN;
  const zoomGoal = () => shownZoom(zoomTarget, !!shotDisc) * (1 - PULLBACK.maxZoomOut * pull);
  const closenessTarget = () => shotDisc ? shotCloseness(zoomTarget) : 0;

  function placeCamera() {
    const pose = cameraPose({ yaw, polar, polarOffset: polar - TILT.table, distance: camDist, disc: shotAnchor, closeness });
    const pan = 1 - Math.min(1, closeness);
    const px = focusPan.x * panGain * pan, pz = focusPan.y * panGain * pan;
    camera.position.set(pose.eye.x + px, pose.eye.y, pose.eye.z + pz);
    camera.lookAt(pose.target.x + px, pose.target.y, pose.target.z + pz);
    camera.updateMatrixWorld();
  }

  // Screen pixels covered by one board inch at a point, along a direction, on
  // the visible top face.
  const projected = new THREE.Vector3();
  function pixelsPerInch(point: BoardPoint, direction: BoardPoint) {
    const rect = canvas.getBoundingClientRect(), step = 0.1;
    const screen = (x: number, y: number) => {
      projected.set(x, DISC.height, y).project(camera);
      return { x: projected.x * rect.width / 2, y: projected.y * rect.height / 2 };
    };
    const a = screen(point.x, point.y), b = screen(point.x + direction.x * step, point.y + direction.y * step);
    return Math.hypot(b.x - a.x, b.y - a.y) / step;
  }

  // Lights
  scene.add(new THREE.AmbientLight('#fff4e0', 0.55));
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(8, 18, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 0.1, far: 60 });
  // Keep contact shadows attached: the old bias displaced them noticeably
  // relative to these small, low discs. Higher resolution preserves the bevel.
  key.shadow.bias = -0.0001;
  scene.add(key);

  // Wooden frame: 26" playing surface, 1.75" ditch, and a slim 1/4" wall.
  // The wall rises +0.4"
  // above the play surface, 1.8" total board thickness.
  // flatShading is essential: LatheGeometry smooths normals across the
  // square profile corners, which fakes a curved round-over in lighting.
  const DITCH_OUT = BOARD.ditchOuterRadius;
  const RAIL_OUT = DITCH_OUT + 0.25;
  const framePts = [
    // The playing-surface cylinder alone owns the exposed inner edge.
    // A second wall here overlapped it and caused striped depth artifacts.
    new THREE.Vector2(13.0, -0.4), // ditch floor meets the playing surface
    new THREE.Vector2(DITCH_OUT, -0.4), // ditch floor
    new THREE.Vector2(DITCH_OUT, 0.4), // rail inner wall
    new THREE.Vector2(RAIL_OUT, 0.4), // rail top
    new THREE.Vector2(RAIL_OUT, -1.4), // outer wall
    new THREE.Vector2(0.0, -1.4), // underside to center
  ];
  // Reverse the profile so the top and outside walls face outward.
  const frame = new THREE.Mesh(
    new THREE.LatheGeometry([...framePts].reverse(), 192),
    new THREE.MeshStandardMaterial({ color: '#4a2a14', roughness: 0.55, flatShading: true }),
  );
  frame.castShadow = true;
  frame.receiveShadow = true;
  scene.add(frame);

  // Ditch floor inlay: light maple ring like a real board (covers the
  // lathe ditch floor; sits 0.005" proud to avoid z-fighting).
  const ditchRing = new THREE.Mesh(
    new THREE.RingGeometry(13.0, DITCH_OUT, 192),
    new THREE.MeshStandardMaterial({ color: '#d9b77c', roughness: 0.6 }),
  );
  ditchRing.rotation.x = -Math.PI / 2;
  ditchRing.position.y = -0.395;
  ditchRing.receiveShadow = true;
  scene.add(ditchRing);

  // Playing surface with line layer drawn on canvas texture.
  // Sharp cylinder edge; textured top, plain wood-tone side + bottom.
  const surfaceTex = makeSurfaceTexture();
  const surfaceSideMat = new THREE.MeshStandardMaterial({ color: '#8a5a24', roughness: 0.6 });
  const surfaceTopMat = new THREE.MeshStandardMaterial({ map: surfaceTex, roughness: 0.35, metalness: 0.05 });
  const surface = new THREE.Mesh(
    new THREE.CylinderGeometry(BOARD.playRadius, BOARD.playRadius, 0.4, 192, 1, true),
    surfaceSideMat,
  );
  surface.position.y = -0.2;
  surface.receiveShadow = true;
  scene.add(surface);
  // A real opening: the tabletop occludes the falling disc outside the hole.
  const topGeo = new THREE.RingGeometry(BOARD.holeRadius, BOARD.playRadius, 192);
  const topPositions = topGeo.getAttribute('position'), topUV = topGeo.getAttribute('uv');
  for (let i = 0; i < topPositions.count; i++) topUV.setXY(i,
    0.5 + topPositions.getX(i) / (2 * BOARD.playRadius),
    0.5 - topPositions.getY(i) / (2 * BOARD.playRadius));
  const top = new THREE.Mesh(topGeo, surfaceTopMat);
  top.rotation.x = -Math.PI / 2; top.receiveShadow = true; scene.add(top);
  const cavityDepth = -ditchRing.position.y;
  const holeWall = new THREE.Mesh(new THREE.CylinderGeometry(BOARD.holeRadius, BOARD.holeRadius, cavityDepth, 96, 1, true),
    new THREE.MeshStandardMaterial({ color: surfaceSideMat.color, roughness: 0.85, side: THREE.BackSide }));
  holeWall.position.y = -cavityDepth / 2; holeWall.receiveShadow = true; scene.add(holeWall);

  // Exposed rubber sleeves with brass screw heads, rather than full-length
  // pale cylinders. The mounting thread belongs below the playing surface.
  const pegMat = new THREE.MeshStandardMaterial({ color: '#62503a', roughness: 0.82 });
  const brass = new THREE.MeshStandardMaterial({ color: '#c4a66a', metalness: 0.75, roughness: 0.28 });
  const slotMat = new THREE.MeshStandardMaterial({ color: '#30281c', roughness: 0.7 });
  const pegGeo = new THREE.CylinderGeometry(PEGS.radius * 0.96, PEGS.radius, PEGS.height - 0.07, 32);
  const capGeo = new THREE.CylinderGeometry(PEGS.radius * 0.84, PEGS.radius * 0.9, 0.07, 32);
  const slotGeo = new THREE.BoxGeometry(PEGS.radius * 1.2, 0.006, 0.035);
  // A small two-tone mounting collar stays legible over arbitrary artwork.
  // Flat geometry uses normal depth testing, so discs naturally cover it.
  const artworkPegCollars = new THREE.Group();
  artworkPegCollars.visible = false;
  scene.add(artworkPegCollars);
  const collarDarkGeo = new THREE.RingGeometry(PEGS.radius, PEGS.radius + 0.10, 48);
  const collarLightGeo = new THREE.RingGeometry(PEGS.radius, PEGS.radius + 0.065, 48);
  const collarDarkMat = new THREE.MeshBasicMaterial({ color: '#30281c' });
  const collarLightMat = new THREE.MeshBasicMaterial({ color: '#fff3d7' });
  for (const p of pegPositions()) {
    const darkCollar = new THREE.Mesh(collarDarkGeo, collarDarkMat);
    const lightCollar = new THREE.Mesh(collarLightGeo, collarLightMat);
    darkCollar.rotation.x = lightCollar.rotation.x = -Math.PI / 2;
    darkCollar.position.set(p.x, 0.008, p.y);
    lightCollar.position.set(p.x, 0.012, p.y);
    artworkPegCollars.add(darkCollar, lightCollar);
    const peg = new THREE.Mesh(pegGeo, pegMat);
    peg.position.set(p.x, (PEGS.height - 0.07) / 2, p.y);
    peg.castShadow = true;
    scene.add(peg);
    const cap = new THREE.Mesh(capGeo, brass);
    cap.position.set(p.x, PEGS.height - 0.035, p.y); cap.castShadow = true; scene.add(cap);
    const slot = new THREE.Mesh(slotGeo, slotMat);
    slot.position.set(p.x, PEGS.height + 0.002, p.y); scene.add(slot);
  }

  const discGeo = makeVisualDiscGeometry();
  const meshes = new Map<number, THREE.Mesh<THREE.LatheGeometry, THREE.MeshStandardMaterial>>();
  // Ink lies on the unchanged flat part of the lathe. Polygon offset separates
  // coplanar surfaces without adding raised geometry or changing disc height.
  const discFaceGeo = new THREE.CircleGeometry(DISC.radius - DISC.edgeRadius, 64);
  const woodFaceGeo = discFaceGeo.clone();
  const woodUV = woodFaceGeo.getAttribute('uv');
  const faceFraction = (DISC.radius - DISC.edgeRadius) / DISC.radius;
  for (let i = 0; i < woodUV.count; i++) {
    woodUV.setXY(i, 0.5 + (woodUV.getX(i) - 0.5) * faceFraction, 0.5 + (woodUV.getY(i) - 0.5) * faceFraction);
  }
  const discFaces = new Map<number, THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>>();
  let discAppearance = defaultDiscAppearance();
  let discPhotos: Array<HTMLImageElement | undefined> = [];
  type DiscLook = { texture: THREE.CanvasTexture; bodyTexture?: THREE.CanvasTexture; bodyMaterial: THREE.MeshStandardMaterial; faceMaterial: THREE.MeshStandardMaterial };
  // Exactly four owner slots; never a history of appearance/photo combinations.
  const discLooks: Array<DiscLook | undefined> = new Array(4);
  function discLook(owner: number): DiscLook {
    let look = discLooks[owner];
    if (!look) {
      const faceCanvas = document.createElement('canvas');
      faceCanvas.width = faceCanvas.height = 256;
      drawDiscFace(faceCanvas.getContext('2d')!, 256, discAppearance, owner, discPhotos[owner]);
      const texture = new THREE.CanvasTexture(faceCanvas);
      texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
      let bodyTexture: THREE.CanvasTexture | undefined;
      if (discAppearance.style === 'wood') {
        const bodyCanvas = document.createElement('canvas');
        bodyCanvas.width = bodyCanvas.height = 256;
        drawDiscWoodSurface(bodyCanvas.getContext('2d')!, 256, discColors(discAppearance)[owner], owner);
        bodyTexture = new THREE.CanvasTexture(bodyCanvas);
        bodyTexture.colorSpace = THREE.SRGBColorSpace; bodyTexture.anisotropy = 8;
      }
      const roughness = discAppearance.style === 'wood' ? 0.3 : 0.38;
      look = {
        texture, bodyTexture,
        bodyMaterial: new THREE.MeshStandardMaterial({ color: bodyTexture ? '#ffffff' : discColors(discAppearance)[owner], map: bodyTexture ?? null, roughness }),
        faceMaterial: new THREE.MeshStandardMaterial({ map: texture, roughness, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      };
      discLooks[owner] = look;
    }
    return look;
  }
  function disposeDiscLook(look: DiscLook) {
    look.texture.dispose(); look.bodyTexture?.dispose(); look.faceMaterial.dispose(); look.bodyMaterial.dispose();
  }
  function removeDiscMesh(id: number, mesh: THREE.Mesh<THREE.LatheGeometry, THREE.MeshStandardMaterial>) {
    scene.remove(mesh);
    // Face geometry/material are owner/shared resources, not disc-local assets.
    mesh.clear(); discFaces.delete(id); mesh.material.dispose(); meshes.delete(id);
  }
  function setDiscAppearance(appearance: DiscAppearance, photos: Array<HTMLImageElement | undefined> = []): void {
    const previous = discAppearance, previousPhotos = discPhotos;
    discAppearance = { ...appearance, emblems: appearance.emblems.slice(0, 4) };
    discPhotos = photos.slice(0, 4);
    for (let owner = 0; owner < 4; owner++) {
      const changed = previous.style !== discAppearance.style || previous.palette !== discAppearance.palette
        || previous.emblems[owner] !== discAppearance.emblems[owner]
        || (discAppearance.emblems[owner] === 'photo' && previousPhotos[owner] !== discPhotos[owner]);
      if (!changed) continue;
      const oldLook = discLooks[owner]; discLooks[owner] = undefined;
      for (const [id, mesh] of meshes) {
        if (mesh.userData.owner !== owner) continue;
        const look = discLook(owner);
        // Retain the disc-local emissive highlight, transform and motion state.
        mesh.material.color.copy(look.bodyMaterial.color); mesh.material.roughness = look.bodyMaterial.roughness;
        const mapChanged = !!mesh.material.map !== !!look.bodyTexture;
        mesh.material.map = look.bodyTexture ?? null;
        if (mapChanged) mesh.material.needsUpdate = true;
        const face = discFaces.get(id)!;
        face.material = look.faceMaterial;
        face.geometry = discAppearance.style === 'wood' ? woodFaceGeo : discFaceGeo;
      }
      if (oldLook) disposeDiscLook(oldLook);
    }
    // Tube discs share these looks, so they are rebuilt with the new ones.
    rebuildTubes();
  }
  let pausedAt: number | null = null, pausedDuration = 0;
  const animationNow = () => (pausedAt ?? performance.now()) - pausedDuration;
  let activeDisc: number | null = null, highlightAt = 0, activeHighlightEnabled = true;
  const activeRing = new THREE.Group();
  const ringBorder = new THREE.Mesh(new THREE.RingGeometry(DISC.radius + 0.06, DISC.radius + 0.23, 64), new THREE.MeshBasicMaterial({ color: '#24190e', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  const ringLight = new THREE.Mesh(new THREE.RingGeometry(DISC.radius + 0.09, DISC.radius + 0.19, 64), new THREE.MeshBasicMaterial({ color: '#fff4c9', transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
  ringBorder.rotation.x = ringLight.rotation.x = -Math.PI / 2;
  activeRing.add(ringBorder, ringLight); activeRing.visible = false; scene.add(activeRing);
  const markerCanvas = document.createElement('canvas'); markerCanvas.width = markerCanvas.height = 256;
  const markerContext = markerCanvas.getContext('2d')!;
  for (const [color, width] of [['#161914', 20], ['#fff8de', 8]] as const) {
    markerContext.strokeStyle = color; markerContext.lineWidth = width; markerContext.lineCap = 'round';
    markerContext.beginPath(); markerContext.arc(128, 128, 104, 0, Math.PI * 2); markerContext.stroke();
    markerContext.beginPath(); markerContext.moveTo(106, 106); markerContext.lineTo(150, 150);
    markerContext.moveTo(150, 106); markerContext.lineTo(106, 150); markerContext.stroke();
  }
  const markerTexture = new THREE.CanvasTexture(markerCanvas);
  markerTexture.colorSpace = THREE.SRGBColorSpace;
  const markers = new Map<number, THREE.Sprite>();
  // 20s tubes: clear plastic hanging on the rim. Each tube owns a small loose-disc
  // simulation (tube-sim.ts), so its discs are real objects: they rest on the
  // rim edge, rattle when the tube is slid, and fall in with a sound.
  const TUBE = { radius: TUBE_DIM.radius, wall: 0.04, height: TUBE_DIM.height, rimTop: TUBE_DIM.floor, centre: BOARD.ditchOuterRadius + 0.125 };
  const tubeGlass = new THREE.MeshPhysicalMaterial({ color: '#eaf4f4', transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
  const tubeEdge = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false });
  // One seamless wall. Its bottom edge follows tubeEdgeDrop(), so the long outer
  // face, the shorter board face and the rounded arches over the rail are all one
  // piece of plastic. A thin rounded lip runs along the top and the curved bottom.
  const WALL_SEGMENTS = 96;
  const edgeAt = (theta: number) => TUBE.rimTop - tubeEdgeDrop(theta);
  const tubeWallGeo = (() => {
    const positions: number[] = [], normals: number[] = [], index: number[] = [];
    for (let i = 0; i <= WALL_SEGMENTS; i++) {
      const theta = i / WALL_SEGMENTS * Math.PI * 2, nx = Math.sin(theta), nz = Math.cos(theta);
      positions.push(nx * TUBE.radius, TUBE.rimTop + TUBE.height, nz * TUBE.radius, nx * TUBE.radius, edgeAt(theta), nz * TUBE.radius);
      normals.push(nx, 0, nz, nx, 0, nz);
      if (i < WALL_SEGMENTS) { const k = i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    g.setIndex(index); return g;
  })();
  const loop = (height: (theta: number) => number) => new THREE.CatmullRomCurve3(
    Array.from({ length: WALL_SEGMENTS }, (_, i) => { const theta = i / WALL_SEGMENTS * Math.PI * 2; return new THREE.Vector3(Math.sin(theta) * TUBE.radius, height(theta), Math.cos(theta) * TUBE.radius); }), true);
  const tubeTopLipGeo = new THREE.TubeGeometry(loop(() => TUBE.rimTop + TUBE.height), WALL_SEGMENTS * 2, TUBE.wall, 6, true);
  const tubeBottomLipGeo = new THREE.TubeGeometry(loop(edgeAt), WALL_SEGMENTS * 2, TUBE.wall, 6, true);
  type TubeSpecLike = { side: number; angle: number; owners: number[] };
  interface TubeRig { side: number; root: THREE.Group; owners: number[]; sim: TubeState; meshes: Array<THREE.Mesh<THREE.LatheGeometry, THREE.MeshStandardMaterial>>; motion: RimMotion; target: number }
  const tubeRigs = new Map<number, TubeRig>();
  let tubeListener: ((event: TubeEvent, x: number, y: number) => void) | null = null;
  function tubeDiscMesh(owner: number) {
    const look = discLook(owner);
    const mesh = new THREE.Mesh(discGeo, look.bodyMaterial.clone()); mesh.castShadow = true; mesh.userData.owner = owner;
    const face = new THREE.Mesh(discAppearance.style === 'wood' ? woodFaceGeo : discFaceGeo, look.faceMaterial);
    face.rotation.x = -Math.PI / 2; face.position.y = DISC.height / 2; face.receiveShadow = true; mesh.add(face);
    return mesh;
  }
  function applyTube(rig: TubeRig) {
    rig.sim.discs.forEach((d, i) => { const m = rig.meshes[i]; if (m) { m.position.set(d.x, TUBE.rimTop + d.y, d.z); m.rotation.set(d.tx, 0, d.tz); } });
  }
  function fillTubeMeshes(rig: TubeRig) {
    for (const m of rig.meshes) { rig.root.remove(m); m.clear(); m.material.dispose(); }
    rig.meshes = rig.sim.discs.map(d => { const m = tubeDiscMesh(d.owner); rig.root.add(m); return m; });
    applyTube(rig);
  }
  function placeTubeRoot(rig: TubeRig) {
    rig.root.position.set(Math.sin(rig.motion.a) * TUBE.centre, 0, Math.cos(rig.motion.a) * TUBE.centre);
    // The tube's own frame: local x runs along the rim, local z points outward.
    rig.root.rotation.y = rig.motion.a;
  }
  function makeTubeRig(spec: TubeSpecLike): TubeRig {
    const root = new THREE.Group();
    const wall = new THREE.Mesh(tubeWallGeo, tubeGlass); wall.renderOrder = 6;
    const topLip = new THREE.Mesh(tubeTopLipGeo, tubeEdge); topLip.renderOrder = 6;
    const bottomLip = new THREE.Mesh(tubeBottomLipGeo, tubeEdge); bottomLip.renderOrder = 6;
    root.add(wall, topLip, bottomLip); scene.add(root);
    const rig: TubeRig = { side: spec.side, root, owners: [...spec.owners], sim: createTube(spec.owners, spec.side + 1), meshes: [], motion: { a: spec.angle, w: 0 }, target: spec.angle };
    placeTubeRoot(rig); fillTubeMeshes(rig); return rig;
  }
  function removeTubeRig(rig: TubeRig) {
    scene.remove(rig.root); for (const m of rig.meshes) { m.clear(); m.material.dispose(); }
  }
  // Tube discs share the disc looks, so a new look rebuilds the meshes (not the simulation).
  function rebuildTubes() { for (const rig of tubeRigs.values()) fillTubeMeshes(rig); }
  function setTubes(specs: TubeSpecLike[]) {
    const keep = new Set(specs.map(s => s.side));
    for (const [side, rig] of tubeRigs) if (!keep.has(side)) { removeTubeRig(rig); tubeRigs.delete(side); }
    for (const spec of specs) {
      const rig = tubeRigs.get(spec.side);
      if (!rig) { tubeRigs.set(spec.side, makeTubeRig(spec)); continue; }
      rig.target = spec.angle;
      // A jump (new game, mode change) places the tube without rattling it.
      if (Math.abs(Math.atan2(Math.sin(spec.angle - rig.motion.a), Math.cos(spec.angle - rig.motion.a))) > 1.2) { rig.motion = { a: spec.angle, w: 0 }; placeTubeRoot(rig); }
      if (spec.owners.length === rig.owners.length && spec.owners.every((o, i) => o === rig.owners[i])) continue;
      const extra = spec.owners.length - rig.owners.length;
      if (extra > 0 && extra <= 2 && rig.owners.every((o, i) => o === spec.owners[i])) {
        // New 20s fall in from the top and land on the stack.
        for (const owner of spec.owners.slice(rig.owners.length)) if (dropDisc(rig.sim, owner)) { const m = tubeDiscMesh(owner); rig.root.add(m); rig.meshes.push(m); }
        applyTube(rig);
      } else { rig.sim = createTube(spec.owners, spec.side + 1); fillTubeMeshes(rig); }
      rig.owners = [...spec.owners];
    }
  }
  function stepTubes(dt: number) {
    for (const rig of tubeRigs.values()) {
      const { motion, accel } = stepRim(rig.motion, rig.target, dt);
      rig.motion = motion; placeTubeRoot(rig);
      const wasAwake = rig.sim.awake;
      stepTube(rig.sim, dt, rimFrameAccel(accel, motion.w, TUBE.centre), tubeListener ? event => tubeListener!(event, rig.root.position.x, rig.root.position.z) : undefined);
      if (wasAwake || rig.sim.awake) applyTube(rig);
    }
  }
  // Which tube, if any, is under a screen point. The tube is a tall thin target,
  // so test distance to its centre line in pixels with a generous finger margin.
  const tubeA = new THREE.Vector3(), tubeB = new THREE.Vector3();
  function tubeHit(clientX: number, clientY: number): number | null {
    const rect = canvas.getBoundingClientRect(); let best: number | null = null, bestDistance = Infinity;
    const toPx = (v: THREE.Vector3) => { v.project(camera); return { x: rect.left + (v.x + 1) * rect.width / 2, y: rect.top + (1 - v.y) * rect.height / 2 }; };
    for (const rig of tubeRigs.values()) {
      const bx = Math.sin(rig.motion.a) * TUBE.centre, bz = Math.cos(rig.motion.a) * TUBE.centre;
      const base = toPx(tubeA.set(bx, TUBE.rimTop, bz)), top = toPx(tubeB.set(bx, TUBE.rimTop + TUBE.height, bz));
      const side = toPx(tubeA.set(bx + TUBE.radius, TUBE.rimTop, bz)), reach = Math.max(26, Math.hypot(side.x - base.x, side.y - base.y) * 1.6 + 14);
      const sx = top.x - base.x, sy = top.y - base.y, length2 = sx * sx + sy * sy || 1;
      const t = Math.max(0, Math.min(1, ((clientX - base.x) * sx + (clientY - base.y) * sy) / length2));
      const distance = Math.hypot(clientX - (base.x + sx * t), clientY - (base.y + sy * t));
      if (distance <= reach && distance < bestDistance) { best = rig.side; bestDistance = distance; }
    }
    return best;
  }

  function syncDiscs(discs: Disc[], review: ShotReview | null = null) {
    const active = activeHighlightEnabled ? discs.find(d => d.id === activeDisc && d.state === 'board') : undefined;
    const age = (animationNow() - highlightAt) / 1000;
    // The camera turns during handover. Blink twice once the new disc is in view.
    const blinkAge = age - 0.8;
    const pulse = reducedMotion.matches || blinkAge < 0 || blinkAge >= 0.8 ? 0 : Math.sin(Math.PI * (blinkAge % 0.4) / 0.4) ** 4;
    activeRing.visible = !!active;
    if (active) {
      activeRing.position.set(active.x, 0.025, active.y);
      activeRing.scale.setScalar(1 + pulse * 0.16);
      ringBorder.material.opacity = 0.55 + pulse * 0.35;
      ringLight.material.opacity = 0.75 + pulse * 0.25;
    }
    const removals = new Map(review?.removed.map(d => [d.id, d]) ?? []);
    const visible = new Set(discs.filter(d => d.state !== 'sunk' || !d.holeCleared || removals.has(d.id)).map(d => d.id));
    for (const [id, mesh] of meshes) if (!visible.has(id)) removeDiscMesh(id, mesh);
    for (const [id, marker] of markers) if (!removals.has(id)) { scene.remove(marker); marker.material.dispose(); markers.delete(id); }
    for (const d of discs) {
      if (!visible.has(d.id)) continue;
      let mesh = meshes.get(d.id);
      if (!mesh) {
        const look = discLook(d.owner);
        mesh = new THREE.Mesh(discGeo, look.bodyMaterial.clone()); mesh.castShadow = true;
        mesh.userData.owner = d.owner;
        const face = new THREE.Mesh(discAppearance.style === 'wood' ? woodFaceGeo : discFaceGeo, look.faceMaterial);
        face.rotation.x = -Math.PI / 2; face.position.y = DISC.height / 2; face.receiveShadow = true;
        mesh.add(face); discFaces.set(d.id, face); meshes.set(d.id, mesh); scene.add(mesh);
      }
      const source = removals.get(d.id) ?? d;
      const tilt = source.hole?.tilt ?? 0, lean = source.hole?.lean ?? 0;
      mesh.position.set(source.x, discHalfHeight(source) + source.z - (source.hole?.dip ?? 0), source.y);
      mesh.quaternion.setFromAxisAngle(new THREE.Vector3(Math.sin(lean), 0, -Math.cos(lean)), tilt);
      // Simulation CCW in (x,y) maps to negative yaw in Three's (x,z) plane.
      mesh.rotateY((source.hole?.rollPhase ?? 0) - source.angle);
      mesh.visible = true;
      mesh.material.emissive.set(d.id === active?.id ? '#ffe1a0' : '#000000');
      mesh.material.emissiveIntensity = d.id === active?.id ? 0.12 + pulse * 1.15 : 0;
      if (source.state === 'sunk') {
        if (mesh.userData.sinkAt === undefined) {
          mesh.userData.sinkAt = animationNow();
          mesh.userData.sinkStart = mesh.position.clone();
          // Preserve a visible falling phase when capture happens between frames.
          mesh.userData.sinkStart.y = Math.max(mesh.position.y, DISC.height / 2 - 0.06);
        }
        const t = reducedMotion.matches ? 1 : Math.min(1, (animationNow() - mesh.userData.sinkAt) / 380);
        const ease = t * t * (3 - 2 * t);
        const start = mesh.userData.sinkStart as THREE.Vector3;
        mesh.position.copy(start).lerp(new THREE.Vector3(0, DISC.height / 2 - cavityDepth, 0), ease);
        const offset = Math.hypot(source.x, source.y);
        const angle = Math.atan2(-source.y, -source.x);
        const tip = Math.min(0.38, offset * 0.65) * Math.sin(Math.PI * t);
        mesh.quaternion.setFromAxisAngle(new THREE.Vector3(Math.sin(angle), 0, -Math.cos(angle)), tilt * (1 - ease) + tip);
        mesh.rotateY((source.hole?.rollPhase ?? 0) - source.angle + 0.12 * Math.sin(2 * Math.PI * t) * (1 - t));
      }
      let progress = 0;
      if (d.state === 'out') {
        if (mesh.userData.state !== 'out') mesh.userData.outAt = mesh.userData.state === 'board' ? animationNow() : -1000;
        progress = review && removals.has(d.id)
          ? THREE.MathUtils.clamp((review.elapsed - review.hold) / REVIEW_TIMING.removal, 0, 1)
          : THREE.MathUtils.clamp((animationNow() - mesh.userData.outAt) / 450, 0, 1);
        const angle = (d.ditchSlot ?? 0) / DITCH_SLOTS * Math.PI * 2;
        // The gutter accommodates a full flat disc, with a clear margin on both sides.
        const parkedRadius = (BOARD.playRadius + BOARD.ditchOuterRadius) / 2;
        const target = new THREE.Vector3(Math.cos(angle) * parkedRadius, -0.395 + DISC.height / 2, Math.sin(angle) * parkedRadius);
        const targetRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -source.angle);
        const t = reducedMotion.matches ? Number(progress >= 1) : progress * progress * (3 - 2 * progress);
        mesh.position.lerp(target, t);
        if (!reducedMotion.matches) mesh.position.y += Math.sin(Math.PI * progress) * 0.8;
        mesh.quaternion.slerp(targetRotation, t);
      }
      if (review && removals.has(d.id)) {
        let marker = markers.get(d.id);
        if (!marker) {
          marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture, depthTest: false, depthWrite: false }));
          marker.scale.set(1.9, 1.9, 1); marker.renderOrder = 5; markers.set(d.id, marker); scene.add(marker);
        }
        marker.position.copy(mesh.position); marker.position.y += 0.45;
        marker.material.opacity = (reducedMotion.matches ? 0.8 : 0.6 + 0.3 * Math.cos(review.elapsed / review.hold * Math.PI * 4)) * (1 - progress);
      }
      mesh.userData.state = d.state;
    }
  }
  const raycaster = new THREE.Raycaster();
  // Flicks target the visible top face; placement explicitly uses height zero.
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DISC.height);
  function boardPoint(x: number, y: number, height = DISC.height) {
    plane.constant = -height;
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), camera);
    const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    return point ? { x: point.x, y: point.z } : null;
  }

  // Floor of the recessed twenty pocket.
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(BOARD.holeRadius, 48),
    ditchRing.material,
  );
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = -cavityDepth;
  hole.receiveShadow = true;
  scene.add(hole);

  function makeSurfaceTexture(skin = 'maple', art?: HTMLImageElement): THREE.CanvasTexture {
    const S = 1024;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d')!;
    // Maple wood base: warm radial tone + long grain streaks + speckle.
    const grad = ctx.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S / 2);
    grad.addColorStop(0, '#e0b26a');
    grad.addColorStop(0.6, '#cd9a4b');
    grad.addColorStop(1, '#a5752c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);

    // Grain: horizontal wavy streaks, alpha varies — reads as maple plywood.
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 130; i++) {
      const y0 = rand() * S;
      const amp = 2 + rand() * 7;
      const dark = rand() > 0.35;
      ctx.strokeStyle = dark
        ? `rgba(122, 79, 28, ${0.05 + rand() * 0.1})`
        : `rgba(246, 222, 170, ${0.05 + rand() * 0.09})`;
      ctx.lineWidth = 0.6 + rand() * 2.2;
      ctx.beginPath();
      for (let x = -10; x <= S + 10; x += 14) {
        const y = y0 + Math.sin(x * 0.008 + i) * amp + Math.sin(x * 0.03 + i * 2.7) * 1.5;
        if (x === -10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Fine speckle for pore texture.
    for (let i = 0; i < 2600; i++) {
      const x = rand() * S;
      const y = rand() * S;
      ctx.fillStyle = rand() > 0.5 ? 'rgba(110, 70, 25, 0.05)' : 'rgba(250, 230, 180, 0.05)';
      ctx.fillRect(x, y, 1.4, 1.4);
    }

    if (skin !== 'maple') {
      ctx.fillStyle = skin === 'walnut' ? 'rgba(75,35,18,0.55)' : 'rgba(30,50,59,0.88)';
      ctx.fillRect(0, 0, S, S);
    }
    if (art) {
      const scale = Math.max(S / art.width, S / art.height);
      ctx.globalAlpha = 0.7;
      // Keep uploaded artwork in its original orientation. The board texture's
      // UV mapping already presents the canvas upright to the player.
      ctx.drawImage(art, (S - art.width * scale) / 2, (S - art.height * scale) / 2, art.width * scale, art.height * scale);
      ctx.globalAlpha = 1;
    }
    const toPx = (inches: number) => (inches / (BOARD.playRadius * 2)) * S;
    const cx = S / 2;
    // Scoring boundaries share their physical line width with the rules engine.
    ctx.strokeStyle = skin === 'maple' && !art ? '#2b1a08' : '#fff3d7';
    ctx.shadowColor = '#241a10'; ctx.shadowBlur = art ? 5 : 0;
    ctx.lineWidth = toPx(BOARD.lineWidth);
    for (const r of [BOARD.ring15, BOARD.ring10, BOARD.ring5]) {
      ctx.beginPath();
      ctx.arc(cx, cx, toPx(r), 0, Math.PI * 2);
      ctx.stroke();
    }
    // Quadrant lines
    ctx.lineWidth = toPx(BOARD.lineWidth);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * toPx(BOARD.ring10), cx + Math.sin(a) * toPx(BOARD.ring10));
      ctx.lineTo(cx + Math.cos(a) * toPx(BOARD.ring5), cx + Math.sin(a) * toPx(BOARD.ring5));
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Shift framing upward without changing the player's zoom or orbit.
    camera.setViewOffset(w, h, 0, h * 0.05, w, h);
    camDist = 48 / Math.min(1, camera.aspect);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();
  placeCamera();

  let raf = 0;
  const clock = new THREE.Clock();
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (pausedAt !== null) { raf = requestAnimationFrame(tick); return; }
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 9);
    yaw += (yawTarget - yaw) * blend;
    polar += (polarTarget - polar) * blend;
    pull += (reducedMotion.matches ? 0 - pull : (pullTarget - pull) * (1 - Math.exp(-dt / PULLBACK.tau)));
    if (Math.abs(pullTarget - pull) < 0.0005) pull = pullTarget;
    // The view's pan gain eases between modes, so switching never snaps.
    panGain += ((focusTarget !== null ? (focusTuning.gain ?? FAR_PAN) : panGain) - panGain) * (1 - Math.exp(-dt / 0.6));
    const zoom = zoomGoal();
    if (camera.zoom !== zoom) {
      camera.zoom = Math.abs(zoom - camera.zoom) > 0.0001 ? camera.zoom + (zoom - camera.zoom) * blend : zoom;
      camera.updateProjectionMatrix();
    }
    const near = closenessTarget();
    closeness = Math.abs(near - closeness) > 0.0005 ? closeness + (near - closeness) * blend : near;
    const gliding = focusTarget !== null && !reducedMotion.matches && clock.elapsedTime >= focusStart;
    if (gliding) {
      // limitFocus keeps the target on the board; the glide itself is slow and speed-capped.
      const goal = limitFocus(focusTarget!, shotDisc ?? { x: 0, y: 0 }, focusTuning);
      focusPan = stepFocus(focusPan, goal, dt, focusTuning);
      // At the shooter view the anchor rides the same glide instead of panning the lens.
      if (shotDisc && closeness > 0) { shotAnchor.x = focusPan.x; shotAnchor.y = focusPan.y; }
    } else if (focusTarget === null) {
      // Ease the pan back out once the next turn begins.
      focusPan = stepFocus(focusPan, { x: 0, y: 0 }, dt, RETURN);
    }
    if (shotDisc && focusTarget === null) {
      shotAnchor.x += (shotDisc.x - shotAnchor.x) * blend; shotAnchor.y += (shotDisc.y - shotAnchor.y) * blend;
    }
    placeCamera();
    stepTubes(dt);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  tick();

  return {
    highlightDisc: (id: number | null) => { activeDisc = id; highlightAt = animationNow(); },
    setActiveDiscHighlight: (enabled: boolean) => { activeHighlightEnabled = enabled; if (!enabled) activeRing.visible = false; },
    setPaused: (paused: boolean) => {
      if (paused && pausedAt === null) pausedAt = performance.now();
      else if (!paused && pausedAt !== null) { pausedDuration += performance.now() - pausedAt; pausedAt = null; }
    },
    syncDiscs,
    setTubes,
    setTubeListener: (listener: ((event: TubeEvent, x: number, y: number) => void) | null) => { tubeListener = listener; },
    tubeHit,
    tubeRimHeight: TUBE.rimTop,
    setDiscAppearance,
    boardPoint,
    getYaw: () => yaw,
    isViewMoving: () => Math.abs(yawTarget - yaw) > 0.003 || Math.abs(polarTarget - polar) > 0.003
      || Math.abs(zoomGoal() - camera.zoom) > 0.003
      || Math.abs(closenessTarget() - closeness) > 0.003
      || (focusTarget === null && Math.hypot(focusPan.x, focusPan.y) > 0.05)
      || (!!shotDisc && closeness > 0 && Math.hypot(shotDisc.x - shotAnchor.x, shotDisc.y - shotAnchor.y) > 0.01),
    pixelsPerInch,
    setZoom: (zoom: number) => { zoomTarget = THREE.MathUtils.clamp(zoom, 0.75, SHOT_VIEW.maxZoom); },
    // The disc waiting to be shot, or null when no shot is being lined up.
    setShotDisc: (disc: BoardPoint | null) => {
      if (disc && !shotDisc && closeness === 0) { shotAnchor.x = disc.x; shotAnchor.y = disc.y; }
      shotDisc = disc ? { x: disc.x, y: disc.y } : null;
    },
    setTheme: (theme: 'light' | 'dark') => { scene.background = new THREE.Color(theme === 'light' ? '#f3efe5' : '#171d1c'); },
    // Table is about 22 inches above the surface, 42 inches from center at the
    // base framing distance. Overview preserves the original standing look.
    // Glide toward a settled shot after delaySeconds; null returns the view.
    // 0..1: how far the lens eases out while discs are fast (Follow camera).
    setPullback: (amount: number) => { pullTarget = Math.max(0, Math.min(1, amount)); },
    setFocus: (point: Point | null, delaySeconds = 0, tuning: FocusTuning = GENTLE) => {
      focusTuning = tuning;
      // A new glide starts from where the view already is, so nothing snaps.
      if (point && focusTarget === null) focusPan = atRest(closeness > 0 ? shotAnchor : focusPan);
      focusTarget = point ? { ...point } : null; focusStart = clock.elapsedTime + delaySeconds;
    },
    setTilt: (radians: number) => {
      orbitAngle = { ...orbitAngle, polar: Math.max(TILT.min, Math.min(TILT.max, radians)) };
      polarTarget = orbitAngle.polar;
    },
    getTilt: () => polarTarget,
    setInvertVerticalDrag: (invert: boolean) => { invertVerticalDrag = invert; },
    snapView: () => {
      yaw = yawTarget; polar = polarTarget; closeness = closenessTarget();
      if (shotDisc) { shotAnchor.x = shotDisc.x; shotAnchor.y = shotDisc.y; }
      camera.zoom = shownZoom(zoomTarget, !!shotDisc); camera.updateProjectionMatrix();
      placeCamera();
    },
    // Where the camera is heading, for the seat rule and the camera icon.
    getTargetLevel: () => cameraLevel(polarTarget, closenessTarget()),
    setSkin: (skin: string, art?: HTMLImageElement) => {
      artworkPegCollars.visible = !!art;
      surfaceTopMat.map?.dispose(); surfaceTopMat.map = makeSurfaceTexture(skin, art); surfaceTopMat.needsUpdate = true;
    },
    setYawTarget: (radians: number) => {
      // Travel to the next player's side by the shortest route, then constrain
      // subsequent orbit offsets relative to that side, including across 0°.
      playerYaw = yaw + Math.atan2(Math.sin(radians - yaw), Math.cos(radians - yaw));
      orbitAngle = centeredOrbit(orbitAngle.polar);
      yawTarget = playerYaw; polarTarget = orbitAngle.polar;
    },
    dragView: (horizontal: number, vertical: number) => {
      orbitAngle = dragOrbit(orbitAngle, horizontal, vertical, invertVerticalDrag);
      yawTarget = playerYaw + orbitAngle.offset; polarTarget = orbitAngle.polar;
    },
    centerView: () => {
      orbitAngle = centeredOrbit(orbitAngle.polar);
      yawTarget = playerYaw; polarTarget = orbitAngle.polar;
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      for (const rig of tubeRigs.values()) removeTubeRig(rig); tubeRigs.clear();
      window.removeEventListener('resize', resize);
      resizeObserver.disconnect();
      for (const [id, mesh] of meshes) removeDiscMesh(id, mesh);
      for (const look of discLooks) if (look) disposeDiscLook(look);
      discLooks.fill(undefined); discPhotos = [];
      discGeo.dispose(); discFaceGeo.dispose(); woodFaceGeo.dispose();
      // Release shared board/highlight/marker assets exactly once as well.
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>([markerTexture]);
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        } else if (object instanceof THREE.Sprite) materials.add(object.material);
      });
      for (const material of materials) {
        if ('map' in material && material.map instanceof THREE.Texture) textures.add(material.map);
        material.dispose();
      }
      for (const geometry of geometries) geometry.dispose();
      for (const texture of textures) texture.dispose();
      markers.clear(); scene.clear();
      renderer.dispose();
    },
  };
}
