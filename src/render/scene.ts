import * as THREE from 'three';
import { BOARD, DISC, PEGS, pegPositions } from '../sim/constants';

// Phase 1: static 3D board preview. No sim, no input yet.
// Camera yaw rig exists so Phase 7 rotation just animates `yawTarget`.

export function createScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a120b');

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const rig = new THREE.Group();
  scene.add(rig);
  rig.add(camera);

  const camDist = 30;
  const polar = THREE.MathUtils.degToRad(58); // tilted top-down
  let yaw = 0;
  let yawTarget = 0;

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
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key);

  // Board base (ditch + rail visual)
  const baseMat = new THREE.MeshStandardMaterial({ color: '#2a1c10', roughness: 0.85 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(15.25, 15.5, 1.2, 96), baseMat);
  base.position.y = -0.7;
  base.receiveShadow = true;
  scene.add(base);

  // Playing surface with line layer drawn on canvas texture
  const surfaceTex = makeSurfaceTexture();
  const surfaceMat = new THREE.MeshStandardMaterial({ map: surfaceTex, roughness: 0.35, metalness: 0.05 });
  const surface = new THREE.Mesh(new THREE.CylinderGeometry(BOARD.playRadius, BOARD.playRadius, 0.4, 96), surfaceMat);
  surface.position.y = -0.2;
  surface.receiveShadow = true;
  scene.add(surface);

  // Rail torus
  const rail = new THREE.Mesh(
    new THREE.TorusGeometry(14.1, 0.55, 24, 96),
    new THREE.MeshStandardMaterial({ color: '#4a2c14', roughness: 0.5 }),
  );
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 0.35;
  rail.castShadow = true;
  scene.add(rail);

  // Pegs
  const pegMat = new THREE.MeshStandardMaterial({ color: '#d8cfc0', roughness: 0.4 });
  const pegGeo = new THREE.CylinderGeometry(PEGS.radius, PEGS.radius, PEGS.height, 24);
  for (const p of pegPositions()) {
    const peg = new THREE.Mesh(pegGeo, pegMat);
    peg.position.set(p.x, PEGS.height / 2, p.y);
    peg.castShadow = true;
    scene.add(peg);
  }

  // Demo discs (static preview of team colors)
  const discGeo = new THREE.CylinderGeometry(DISC.radius, DISC.radius, DISC.height, 48);
  const demoDiscs: THREE.Mesh[] = [];
  const colors = ['#1c1c1e', '#f2ede2', '#b3312a', '#2456a6'];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(
      discGeo,
      new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.3 }),
    );
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    m.position.set(Math.cos(a) * 10, DISC.height / 2, Math.sin(a) * 10);
    m.castShadow = true;
    scene.add(m);
    demoDiscs.push(m);
  }

  // Center hole (dark inset)
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(BOARD.holeRadius, 48),
    new THREE.MeshBasicMaterial({ color: '#000000' }),
  );
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.005;
  scene.add(hole);

  function makeSurfaceTexture(): THREE.CanvasTexture {
    const S = 1024;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d')!;
    // Wood base
    const grad = ctx.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S / 2);
    grad.addColorStop(0, '#d9a960');
    grad.addColorStop(0.6, '#c68f3f');
    grad.addColorStop(1, '#a06a26');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);

    const toPx = (inches: number) => (inches / (BOARD.playRadius * 2)) * S;
    const cx = S / 2;
    // Rings: 15/10/5 + outer line. Lines drawn opaque (skins rule: art under, lines over).
    ctx.strokeStyle = '#2b1a08';
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
      ctx.moveTo(cx + Math.cos(a) * toPx(BOARD.ring5), cx + Math.sin(a) * toPx(BOARD.ring5));
      ctx.lineTo(cx + Math.cos(a) * toPx(BOARD.playRadius - 0.15), cx + Math.sin(a) * toPx(BOARD.playRadius - 0.15));
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
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  placeCamera();

  // Gentle auto-orbit so the static preview feels alive until real input lands.
  let dragging = false;
  let lastX = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    yawTarget += (e.clientX - lastX) * 0.005;
    lastX = e.clientX;
  });
  canvas.addEventListener('pointerup', () => {
    dragging = false;
  });

  let raf = 0;
  const clock = new THREE.Clock();
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    yaw += (yawTarget - yaw) * Math.min(1, dt * 6);
    if (!dragging) yawTarget += dt * 0.05;
    placeCamera();
    // Bob demo discs slightly so shadows read as 3D
    const t = clock.elapsedTime;
    demoDiscs.forEach((d, i) => {
      d.position.y = DISC.height / 2 + Math.sin(t * 1.2 + i) * 0.02;
    });
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  tick();

  return {
    setYawTarget: (radians: number) => {
      yawTarget = radians;
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      renderer.dispose();
    },
  };
}
