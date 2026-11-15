// Integration hall scene. Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
//
// World units are metres. Spacecraft GLBs are authored at 1 unit = 10 cm and
// are scaled by 0.1 when placed on the stand.
//
// Lighting: the hall's softboxes are baked into an environment map once at
// start-up (a small emissive room rendered through PMREM), plus one
// shadow-casting key light. No per-frame area lights, so it stays fast on
// integrated graphics.
import * as THREE from 'three';
import { part } from './spacecraft.js';

// Scene colours mirror src/ui/tokens.css.
const HALL = 0xe9e7e2;
const WALL = 0xb9b7b1;
const GRAPHITE = 0x2b2d2f;
const SIGNAL = 0xe5562a;

export const STAND_TOP = 1.012; // height of the mounting plate surface, m
const SOFTBOX = { xs: [-6, 0, 6], zs: [-6, -1, 4], w: 3.6, d: 1.2, y: 6 };

export function createHangar(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WALL);
  scene.fog = new THREE.Fog(WALL, 5, 40); // a little haze sets the back of the hall behind the spacecraft
  scene.environment = bakeEnvironment(renderer);
  scene.environmentIntensity = 1.0;

  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 80);

  // Square-on camera, left of the stand: the spacecraft sits in the right third
  // and the left of the frame stays clear for the UI.
  // Each screen has its own framing. `side` shifts the stand off-centre (0 = centred,
  // 0.5 = right edge) so it clears that screen's panels.
  const VIEWS = {
    title: { y: 1.44, z: 1.16, lookY: 1.2, side: 0.4 },
    briefing: { y: 1.46, z: 1.5, lookY: 1.2, side: 0.62 },
    lab: { y: 1.42, z: 1.34, lookY: 1.19, side: 0.04 },
    review: { y: 1.46, z: 1.6, lookY: 1.2, side: 0.6 },
  };
  const cam = { ...VIEWS.title };
  let goal = VIEWS.title;
  let zoom = 0;
  let spin = true;
  let yaw = 0;
  const frame = (drift = 0) => {
    const z = cam.z + zoom;
    const halfWidth = z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const x = -halfWidth * cam.side + drift;
    camera.position.set(x, cam.y, z);
    camera.lookAt(x, cam.lookY, 0);
  };
  frame();

  // Floor: poured epoxy
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: HALL, roughness: 0.3, metalness: 0.0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Back wall. A plain panelled wall stands in until the hall model (env_hall.glb: wall system,
  // thermal-vacuum chamber, control rack, aisle lines) has loaded, and stays if it cannot load.
  const blockout = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: WALL, roughness: 0.8 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 10), wallMat);
  wall.position.set(0, 5, -9);
  blockout.add(wall);
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x8f8d88, roughness: 0.7 });
  for (let x = -38.4; x <= 38.4; x += 1.2) {
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 10), seamMat);
    seam.position.set(x, 5, -8.995);
    blockout.add(seam);
  }
  const kick = new THREE.Mesh(new THREE.BoxGeometry(80, 0.14, 0.05), seamMat);
  kick.position.set(0, 0.07, -8.97);
  blockout.add(kick);
  scene.add(blockout);
  part('env_hall')
    .then((hall) => {
      hall.traverse((o) => {
        if (o.isMesh) o.castShadow = o.receiveShadow = false; // outside the key light's shadow area
      });
      // The model only covers the wall up to 7 m and 40 m wide: keep a plain wall behind it.
      wall.position.z = -9.2;
      blockout.remove(...blockout.children.filter((c) => c !== wall));
      scene.add(hall, ...contactShadows());
    })
    .catch((err) => console.warn('Hall model not loaded; using the plain wall.', err));

  // Keep-out box painted on the floor around the stand
  const paint = new THREE.MeshStandardMaterial({ color: SIGNAL, roughness: 0.55 });
  const BOX = 1.1;
  const LINE = 0.05;
  for (const [w, d, x, z] of [
    [BOX * 2 + LINE, LINE, 0, BOX],
    [BOX * 2 + LINE, LINE, 0, -BOX],
    [LINE, BOX * 2 + LINE, BOX, 0],
    [LINE, BOX * 2 + LINE, -BOX, 0],
  ]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(w, d), paint);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.002, z);
    line.receiveShadow = true;
    scene.add(line);
  }

  // Ceiling softboxes (the same layout is baked into the environment map)
  const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const x of SOFTBOX.xs) {
    for (const z of SOFTBOX.zs) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(SOFTBOX.w, SOFTBOX.d), panelMat);
      panel.rotation.x = Math.PI / 2;
      panel.position.set(x, SOFTBOX.y, z);
      scene.add(panel);
    }
  }

  // Key light: gives the hard-edged grounding shadows the environment cannot
  const key = new THREE.DirectionalLight(0xfff4e6, 1.6);
  key.position.set(1.6, 3.4, 2.2);
  key.target.position.set(0, 1.1, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -0.7, right: 0.7, top: 0.8, bottom: -1.4, near: 0.5, far: 8 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.004;
  scene.add(key, key.target);

  scene.add(buildStand());

  // Turntable: whatever is mounted on the stand goes in here
  const mount = new THREE.Group();
  mount.name = 'StandMount';
  mount.position.y = STAND_TOP;
  scene.add(mount);

  let lastSec = 0;
  function update(timeSec, animate) {
    const dt = Math.min(Math.max(timeSec - lastSec, 0), 0.1);
    lastSec = timeSec;
    // Ease toward the current screen's framing (about a second to settle)
    const k = animate ? 1 - Math.exp(-dt * 4.2) : 1;
    for (const key of ['y', 'z', 'lookY', 'side']) cam[key] += (goal[key] - cam[key]) * k;
    if (spin && animate) yaw += dt * 0.09;
    mount.rotation.y = yaw;
    frame(animate && spin ? Math.sin(timeSec * 0.13) * 0.018 : 0);
  }

  return {
    scene,
    camera,
    mount,
    update,
    /** Moves the camera to a screen's framing; the turntable only idles on quiet screens. */
    setView(name) {
      goal = VIEWS[name] ?? VIEWS.title;
      spin = name !== 'lab'; // the player turns it by hand in the Design Lab
      zoom = 0;
    },
    rotateBy(radians) {
      yaw += radians;
    },
    zoomBy(metres) {
      zoom = Math.min(0.7, Math.max(-0.5, zoom + metres));
    },
  };
}

/**
 * Renders a simple emissive model of the hall (walls, floor, softboxes and
 * tall side lights) into a prefiltered environment map. Values above 1 are
 * intentional: they are the light sources.
 */
function bakeEnvironment(renderer) {
  const env = new THREE.Scene();
  const flat = (hex, k = 1) =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(24, 7, 24), [
    flat(WALL, 0.34),
    flat(WALL, 0.34), // +x, -x walls
    flat(0x9a9892, 0.22), // ceiling
    flat(HALL, 0.6), // floor
    flat(WALL, 0.34),
    flat(WALL, 0.34), // +z, -z walls
  ]);
  room.position.y = 3.5 - 1.2; // seen from stand height
  env.add(room);

  const glow = (k) =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.93).multiplyScalar(k), side: THREE.DoubleSide });
  for (const x of SOFTBOX.xs) {
    for (const z of SOFTBOX.zs) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(SOFTBOX.w, SOFTBOX.d), glow(22));
      p.rotation.x = Math.PI / 2;
      p.position.set(x, SOFTBOX.y - 1.2 - 0.05, z);
      env.add(p);
    }
  }
  // Tall strip lights: long vertical highlights on rails and panels
  for (const [x, z, k] of [
    [-7, 3, 7],
    [8, 1, 4],
    [3, 9, 3],
  ]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 4.2), glow(k));
    s.position.set(x, 1.2, z);
    s.lookAt(0, 0, 0);
    env.add(s);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.015).texture;
  pmrem.dispose();
  env.traverse((o) => {
    o.geometry?.dispose();
    [].concat(o.material ?? []).forEach((m) => m.dispose());
  });
  return texture;
}

/** Soft dark patches that sit the chamber and rack on the floor (they are outside the shadow map). */
function contactShadows() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.3)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false });
  // [x, z, width, depth] in metres, matching art/blender/build_p6_hall.py
  return [[-2.6, -8.25, 2.6, 2.5], [-4.2, -8.5, 1.5, 1.6], [-1.76, -8.3, 0.8, 1.0]].map(([x, z, w, d]) => {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x, 0.004, z);
    patch.renderOrder = 1;
    return patch;
  });
}

/** Pedestal stand with a small mounting plate, sized for a CubeSat. */
function buildStand() {
  const anodized = new THREE.MeshStandardMaterial({ color: GRAPHITE, roughness: 0.4, metalness: 1.0 });
  const blasted = new THREE.MeshStandardMaterial({ color: 0xc4c6c8, roughness: 0.45, metalness: 1.0 });
  const stand = new THREE.Group();
  stand.name = 'IntegrationStand';

  const add = (geo, mat, y, x = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    stand.add(m);
  };

  add(new THREE.CylinderGeometry(0.27, 0.29, 0.03, 72), anodized, 0.015); // base
  add(new THREE.CylinderGeometry(0.028, 0.028, 0.95, 40), blasted, 0.505); // column
  add(new THREE.CylinderGeometry(0.042, 0.042, 0.05, 40), anodized, 0.4); // height clamp
  add(new THREE.CylinderGeometry(0.045, 0.03, 0.03, 40), anodized, 0.975); // neck
  add(new THREE.CylinderGeometry(0.088, 0.088, 0.016, 72), blasted, 1.0); // mounting plate
  add(new THREE.CylinderGeometry(0.09, 0.09, 0.006, 72), anodized, 0.99); // plate lip
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    add(new THREE.CylinderGeometry(0.022, 0.026, 0.02, 20), blasted, 0.01, Math.cos(a) * 0.245, Math.sin(a) * 0.245);
  }
  return stand;
}
