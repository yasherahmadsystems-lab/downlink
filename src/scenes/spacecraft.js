// Loads part GLBs and assembles spacecraft through their SOCKET_* nodes.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
//
// Asset contract (docs/PLAN.md §3, art/blender/common.py):
//   - a part's origin is its attach point; parent it to a socket with no offset
//   - HINGE_<name> nodes move; HINGE_<name>_DEPLOYED holds the deployed rotation
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const urls = import.meta.glob('../assets/models/*.glb', { eager: true, query: '?url', import: 'default' });
const loader = new GLTFLoader();
const cache = new Map();

/** Returns a fresh copy of a part, e.g. part('mod_bus_3u'). */
export async function part(name) {
  if (!cache.has(name)) {
    const url = urls[`../assets/models/${name}.glb`];
    if (!url) throw new Error(`No model named ${name}`);
    cache.set(
      name,
      loader.loadAsync(url).then((gltf) => {
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          for (const map of [o.material.map, o.material.normalMap, o.material.roughnessMap]) {
            if (map) map.anisotropy = 8;
          }
          // Cover glass: cells are dark but mirror the hall lights strongly
          if (o.material.name === 'SolarCells') o.material.envMapIntensity = 3.2;
        });
        return gltf.scene;
      }),
    );
  }
  const copy = (await cache.get(name)).clone(true);
  copy.name = name;
  return copy;
}

export function attach(child, parent, socketName) {
  const socket = parent.getObjectByName(socketName);
  if (!socket) throw new Error(`${parent.name} has no ${socketName}`);
  socket.add(child);
  return child;
}

/** Collects the hinges under a part as { node, stowed, deployed } quaternions. */
export function hinges(root) {
  const out = [];
  root.traverse((o) => {
    if (!o.name.startsWith('HINGE_') || o.name.endsWith('_DEPLOYED')) return;
    const twin = o.parent.children.find((c) => c.name === `${o.name}_DEPLOYED`);
    if (twin) out.push({ node: o, stowed: new THREE.Quaternion(), deployed: twin.quaternion.clone() });
  });
  return out;
}

/** Sets every hinge to t in 0..1 (0 stowed, 1 deployed). */
export function setDeploy(hingeList, t) {
  for (const h of hingeList) h.node.quaternion.slerpQuaternions(h.stowed, h.deployed, t);
}

/** Overshoot-and-settle curve for parts that swing out on a spring. */
export const settle = (t) => {
  const c = 1.4;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};

/**
 * The P1 hero: 3U bus, one body-mounted panel, two deployable wings, UHF whip.
 * Returns the root (in asset units, 1 = 10 cm) and its hinges grouped for staging.
 */
export async function buildHeroCubeSat() {
  const [bus, body, wingA, wingB, uhf] = await Promise.all([
    part('mod_bus_3u'),
    part('mod_solar_body_3u'),
    part('mod_solar_wing_3u'),
    part('mod_solar_wing_3u'),
    part('mod_antenna_uhf'),
  ]);
  attach(body, bus, 'SOCKET_face_py');
  attach(wingA, bus, 'SOCKET_wing_px');
  attach(wingB, bus, 'SOCKET_wing_nx');
  attach(uhf, bus, 'SOCKET_top');
  return { root: bus, wings: [...hinges(wingA), ...hinges(wingB)], antenna: hinges(uhf) };
}
