import * as THREE from 'three';
import { discHalfHeight } from '../sim/hole';
import type { Disc } from '../sim/physics';
import { BOARD, DISC, PEGS, pegPositions } from '../sim/constants';

import { centeredOrbit, dragOrbit, type BoardView } from './orbit';
export type { BoardView } from './orbit';

// Disc cross-section with a real round-over on top/bottom edges
// (see reference photo: flat faces, softly rounded rim, ~1/16" radius).
// Exported so the sim phase reuses the exact same geometry.
export function makeDiscGeometry(): THREE.LatheGeometry {
  const R = DISC.radius;
  const H = DISC.height / 2;
  const er = 1 / 16; // edge round-over radius
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
  let polar = THREE.MathUtils.degToRad(25);
  let polarTarget = polar;
  let zoomTarget = 1;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let yaw = 0;
  let yawTarget = 0;
  let playerYaw = 0;
  let orbitView: BoardView = 'standing';
  let orbitAngle = centeredOrbit(orbitView);

  function placeCamera() {
    camera.position.set(
      Math.sin(polar) * Math.sin(yaw) * camDist,
      Math.cos(polar) * camDist,
      Math.sin(polar) * Math.cos(yaw) * camDist,
    );
    camera.lookAt(0, 0, 0);
  }

  // Lights
  scene.add(new THREE.AmbientLight('#fff4e0', 0.55));
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(8, 18, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 0.1, far: 60 });
  key.shadow.bias = -0.001;
  scene.add(key);

  // Wooden frame: 26" playing surface, 1" ditch, and a slim 1/4" wall.
  // The wall rises +0.4"
  // above the play surface, 1.8" total board thickness.
  // flatShading is essential: LatheGeometry smooths normals across the
  // square profile corners, which fakes a curved round-over in lighting.
  const DITCH_OUT = 14.0;
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
    new THREE.CylinderGeometry(BOARD.playRadius, BOARD.playRadius, 0.4, 192),
    [surfaceSideMat, surfaceTopMat, surfaceSideMat],
  );
  surface.position.y = -0.2;
  surface.receiveShadow = true;
  scene.add(surface);

  // Pegs
  const pegMat = new THREE.MeshStandardMaterial({ color: '#d8cfc0', roughness: 0.4 });
  const pegGeo = new THREE.CylinderGeometry(PEGS.radius, PEGS.radius, PEGS.height, 24);
  for (const p of pegPositions()) {
    const peg = new THREE.Mesh(pegGeo, pegMat);
    peg.position.set(p.x, PEGS.height / 2, p.y);
    peg.castShadow = true;
    scene.add(peg);
  }

  const discGeo = makeDiscGeometry();
  const meshes = new Map<number, THREE.Mesh>();
  const colors = ['#dc6853', '#6cabbe', '#e7b95c', '#94ad76'];
  const materials = colors.map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.3 }));
  function syncDiscs(discs: Disc[]) {
    const visible = new Set(discs.filter(d => d.state === 'board').map(d => d.id));
    for (const [id, mesh] of meshes) if (!visible.has(id)) { scene.remove(mesh); meshes.delete(id); }
    for (const d of discs) {
      if (d.state !== 'board') continue;
      let mesh = meshes.get(d.id);
      if (!mesh) { mesh = new THREE.Mesh(discGeo, materials[d.owner]); mesh.castShadow = true; meshes.set(d.id, mesh); scene.add(mesh); }
      const tilt = d.hole?.tilt ?? 0, lean = d.hole?.lean ?? 0;
      const halfHeight = discHalfHeight(d);
      mesh.position.set(d.x, halfHeight + d.z - (d.hole?.dip ?? 0), d.y);
      mesh.quaternion.setFromAxisAngle(new THREE.Vector3(Math.sin(lean), 0, -Math.cos(lean)), tilt);
      mesh.rotateY(d.hole?.rollPhase ?? 0);
    }
  }
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DISC.height / 2);
  function boardPoint(x: number, y: number) {
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1), camera);
    const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    return point ? { x: point.x, y: point.z } : null;
  }

  // Center hole (dark inset)
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(BOARD.holeRadius, 48),
    new THREE.MeshBasicMaterial({ color: '#000000' }),
  );
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.005;
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
      // Cylinder top UVs turn canvas artwork sideways relative to the players.
      ctx.save();
      ctx.translate(S / 2, S / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(art, -art.width * scale / 2, -art.height * scale / 2, art.width * scale, art.height * scale);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    const toPx = (inches: number) => (inches / (BOARD.playRadius * 2)) * S;
    const cx = S / 2;
    // Rings: 15/10/5 + outer line. Lines drawn opaque (skins rule: art under, lines over).
    ctx.strokeStyle = skin === 'maple' && !art ? '#2b1a08' : '#fff3d7';
    ctx.shadowColor = '#241a10'; ctx.shadowBlur = art ? 5 : 0;
    ctx.lineWidth = 4;
    for (const r of [BOARD.ring15, BOARD.ring10, BOARD.ring5, BOARD.playRadius - 0.15]) {
      ctx.beginPath();
      ctx.arc(cx, cx, toPx(r), 0, Math.PI * 2);
      ctx.stroke();
    }
    // Quadrant lines
    ctx.lineWidth = 3;
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
    camDist = 48 / Math.min(1, camera.aspect);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  placeCamera();

  let raf = 0;
  const clock = new THREE.Clock();
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const blend = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 9);
    yaw += (yawTarget - yaw) * blend;
    polar += (polarTarget - polar) * blend;
    if (Math.abs(camera.zoom - zoomTarget) > 0.0001) {
      camera.zoom += (zoomTarget - camera.zoom) * blend;
      camera.updateProjectionMatrix();
    }
    placeCamera();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  tick();

  return {
    syncDiscs,
    boardPoint,
    getYaw: () => yaw,
    isViewMoving: () => Math.abs(yawTarget - yaw) > 0.003 || Math.abs(polarTarget - polar) > 0.003 || Math.abs(zoomTarget - camera.zoom) > 0.003,
    setZoom: (zoom: number) => { zoomTarget = THREE.MathUtils.clamp(zoom, 0.75, 2.5); },
    setView: (view: BoardView) => {
      // Seated: about 22 inches above the surface, 42 inches from center
      // at the base framing distance. Standing preserves the original overview.
      if (view !== orbitView) {
        orbitView = view; orbitAngle.polar = centeredOrbit(view).polar;
        polarTarget = orbitAngle.polar;
      }
    },
    setSkin: (skin: string, art?: HTMLImageElement) => {
      surfaceTopMat.map?.dispose(); surfaceTopMat.map = makeSurfaceTexture(skin, art); surfaceTopMat.needsUpdate = true;
    },
    setYawTarget: (radians: number) => {
      // Travel to the next player's side by the shortest route, then constrain
      // subsequent orbit offsets relative to that side, including across 0°.
      playerYaw = yaw + Math.atan2(Math.sin(radians - yaw), Math.cos(radians - yaw));
      orbitAngle = centeredOrbit(orbitView);
      yawTarget = playerYaw; polarTarget = orbitAngle.polar;
    },
    dragView: (horizontal: number, vertical: number) => {
      orbitAngle = dragOrbit(orbitAngle, horizontal, vertical, orbitView);
      yawTarget = playerYaw + orbitAngle.offset; polarTarget = orbitAngle.polar;
    },
    centerView: () => {
      orbitAngle = centeredOrbit(orbitView);
      yawTarget = playerYaw; polarTarget = orbitAngle.polar;
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.dispose();
    },
  };
}
