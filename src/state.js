// The player's design and everything derived from it.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
import { evaluate, fitProblem, PARTS } from './sim/evaluate.js';

const INTERNAL = { battery: 'internal_1', computer: 'internal_2', adcs: 'internal_3' };

/** Which slot a part goes to when the player picks it from the catalog. */
export function homeSlot(part) {
  if (part.category === 'instrument') return 'payload';
  if (part.category === 'antenna') return part.slots[0];
  return INTERNAL[part.category] ?? null;
}

export const SHOWCASE = {
  objective: 'hurricanes',
  difficulty: 'trade',
  bus: 'bus_3u',
  orbit: 'leo_500',
  station: { id: 'gs_sband', count: 1 },
  snapshotsCompared: 0,
  slots: { face_px: 'solar_wing_3u', face_nx: 'solar_wing_3u', face_py: 'solar_body_3u', top: 'antenna_uhf' },
};

function blank(objective, difficulty) {
  return { objective, difficulty, bus: 'bus_3u', orbit: 'leo_500', station: { id: 'gs_uhf', count: 1 }, snapshotsCompared: 0, players: 1, slots: {} };
}

const listeners = new Set();

export const store = {
  design: blank('hurricanes', 'trade'),
  result: null,
  snapshots: { A: null, B: null, C: null },
  /** Slot touched by the latest change, so the 3D view can animate just that part. */
  changedSlot: null,
  cmlRaised: false,
  /** Hot-seat: which player (0-based) is at the controls. Not part of the design. */
  seat: 0,

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  commit(changedSlot = null) {
    const before = store.result?.cml ?? 0;
    store.result = evaluate(store.design);
    store.changedSlot = changedSlot;
    store.cmlRaised = store.result.cml > before;
    for (const fn of listeners) fn(store);
  },

  start(objective, difficulty) {
    store.design = blank(objective, difficulty);
    store.snapshots = { A: null, B: null, C: null };
    store.seat = 0;
    store.result = null;
    store.commit();
  },

  /** Re-draws the UI without touching the design (tab changes, learn cards). */
  refresh() {
    store.cmlRaised = false;
    store.changedSlot = null;
    for (const fn of listeners) fn(store);
  },

  setBrief(objective, difficulty) {
    store.design.objective = objective;
    store.design.difficulty = difficulty;
    store.commit();
  },

  setPlayers(n) {
    store.design.players = Math.min(4, Math.max(1, n));
    store.seat = 0;
    store.commit();
  },

  setSeat(index) {
    store.seat = index;
    store.refresh();
  },

  setBus(id) {
    const d = store.design;
    d.bus = id;
    for (const [slot, partId] of Object.entries(d.slots)) {
      if (fitProblem(partId, slot, id)) delete d.slots[slot];
    }
    store.commit('bus');
  },

  setSlot(slot, partId) {
    if (partId) store.design.slots[slot] = partId;
    else delete store.design.slots[slot];
    store.commit(slot);
  },

  /** Catalog click: fit the part in its home slot, or remove it if it is already there. */
  toggle(partId) {
    const slot = homeSlot(PARTS[partId]);
    if (!slot) return;
    store.setSlot(slot, store.design.slots[slot] === partId ? null : partId);
  },

  setOrbit(id) {
    store.design.orbit = id;
    store.commit();
  },

  setStation(id, count) {
    store.design.station = { id, count: Math.min(3, Math.max(1, count)) };
    store.commit();
  },

  saveSnapshot(key) {
    store.snapshots[key] = { design: structuredClone(store.design), result: evaluate(store.design) };
    store.commit();
  },

  loadSnapshot(key) {
    const snap = store.snapshots[key];
    if (!snap) return;
    const { snapshotsCompared, players } = store.design;
    store.design = structuredClone(snap.design);
    Object.assign(store.design, { snapshotsCompared, players });
    store.commit('bus');
  },

  /** Opening the comparison with two or more saved designs is the CML 3 step. */
  markCompared() {
    const n = Object.values(store.snapshots).filter(Boolean).length;
    if (n >= 2 && store.design.snapshotsCompared < n) {
      store.design.snapshotsCompared = n;
      store.commit();
    }
  },
};
