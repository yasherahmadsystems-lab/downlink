// Builds the 3D spacecraft from a design and animates parts as they are fitted.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
import * as THREE from 'three';
import { PARTS } from '../sim/evaluate.js';
import { attach, hinges, part, setDeploy, settle } from './spacecraft.js';
import { reducedMotion } from './renderer.js';

const SEAT_MS = 320; // fly in and seat (PLAN.md §2: 200-400 ms)
const DEPLOY_MS = 800;
const FLY_FROM = 1.6; // asset units along the socket's outward axis

function socketFor(slot, p) {
  if (p.id === 'solar_wing_3u') return slot.replace('face_', 'SOCKET_wing_');
  return `SOCKET_${slot}`;
}

export function createAssembly(mount) {
  let root = null;
  let version = 0;
  let anims = [];
  let xray = false;
  let skins = [];
  let fitted = []; // { category, hinges } for every part on the craft
  // "This is where it goes": a ring on the socket of the part under the pointer
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.36, 0.42, 48),
    new THREE.MeshBasicMaterial({ color: 0xe5562a, transparent: true, depthTest: false, side: THREE.DoubleSide }),
  );
  marker.renderOrder = 5;
  marker.visible = false;
  let hinted = null; // socket name
  function applyHint() {
    const socket = hinted && root?.getObjectByName(hinted);
    marker.visible = Boolean(socket);
    if (socket) socket.add(marker);
    else marker.removeFromParent();
  }

  /** Rebuilds the craft. `changedSlot` animates that part in; 'bus' or null does not. */
  async function sync(design, changedSlot = null, { stowed = false, yaw = Math.PI * 0.72 } = {}) {
    const now = performance.now();
    const mine = ++version;
    const entries = Object.entries(design.slots).filter(([, id]) => PARTS[id]);
    const [bus, ...models] = await Promise.all([part(PARTS[design.bus].model), ...entries.map(([, id]) => part(PARTS[id].model))]);
    if (mine !== version) return; // a newer change overtook this one

    const next = [];
    const parts = [];
    skins = bus.children[0]?.children.filter((c) => c.isMesh && c.material.name === 'BeadBlastedAluminium') ?? [];
    entries.forEach(([slot, id], i) => {
      const p = PARTS[id];
      const model = models[i];
      model.userData.category = p.category;
      try {
        attach(model, bus, socketFor(slot, p));
      } catch {
        return; // the bus has no such socket; evaluate() already ignores the part
      }
      const hs = hinges(model);
      parts.push({ category: p.category, hinges: hs });
      const animate = slot === changedSlot && !reducedMotion();
      if (animate) {
        model.position.y = FLY_FROM;
        setDeploy(hs, 0);
        next.push({ start: now, duration: SEAT_MS, apply: (t) => (model.position.y = FLY_FROM * (1 - settle(t))) });
        if (hs.length) next.push({ start: now + SEAT_MS + 120, duration: DEPLOY_MS, apply: (t) => setDeploy(hs, settle(t)) });
      } else {
        setDeploy(hs, stowed ? 0 : 1);
      }
    });

    bus.scale.setScalar(0.1); // asset units (10 cm) to metres
    bus.rotation.y = yaw;
    if (root) mount.remove(root);
    root = bus;
    mount.add(root);
    anims = next;
    fitted = parts;
    applyXray();
    applyHint();
  }

  function applyXray() {
    for (const m of skins) m.visible = !xray;
    root?.traverse((o) => {
      if (o.userData.category === 'solar') o.visible = !xray;
    });
  }

  return {
    sync,
    /** Hides the skin and solar panels so the internal modules can be seen. */
    setXray(on) {
      xray = on;
      applyXray();
    },
    /** Marks the socket a slot uses (or clears the mark with null). */
    hint(slot, partId = null) {
      const p = partId ? PARTS[partId] : null;
      hinted = slot ? (p ? socketFor(slot, p) : `SOCKET_${slot}`) : null;
      applyHint();
    },
    update(now) {
      if (marker.visible) {
        const pulse = reducedMotion() ? 0 : Math.sin(now / 260);
        marker.material.opacity = 0.75 + 0.25 * pulse;
        marker.scale.setScalar(1 + 0.06 * pulse);
      }
      anims = anims.filter((a) => {
        const t = Math.min(Math.max((now - a.start) / a.duration, 0), 1);
        a.apply(t);
        return t < 1;
      });
    },
    /** Sets deployables of one category (or all, if null) to t in 0..1. */
    pose(category, t) {
      for (const f of fitted) if (!category || f.category === category) setDeploy(f.hinges, t);
    },
    /** Replays every deployable, as on the title screen. */
    redeploy(now = performance.now()) {
      if (!root || reducedMotion()) return;
      const hs = hinges(root);
      setDeploy(hs, 0);
      anims.push({ start: now + 500, duration: 1100, apply: (t) => setDeploy(hs, settle(t)) });
    },
    get root() {
      return root;
    },
  };
}
