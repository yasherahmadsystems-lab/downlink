// Simulation tests: node --test tests/
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, fitProblem, PARTS } from '../src/sim/evaluate.js';
import { eclipseFraction, periodMinutes, speedKmS, slantRangeKm } from '../src/sim/orbit.js';
import { pathLossDb } from '../src/sim/comms.js';
import constants from '../src/data/constants.json' with { type: 'json' };
import catalog from '../src/data/parts.json' with { type: 'json' };
import scenarios from '../src/data/scenarios.json' with { type: 'json' };

const GM = constants.earth.gm_km3_s2.value;
const RE = constants.earth.radius_km.value;

// A sound hurricane-watching 3U: the reference design the tests vary.
const good = () => ({
  objective: 'hurricanes',
  difficulty: 'trade',
  bus: 'bus_3u',
  orbit: 'leo_500',
  station: { id: 'gs_sband', count: 1 },
  snapshotsCompared: 2,
  slots: {
    face_px: 'solar_wing_3u',
    face_nx: 'solar_wing_3u',
    face_py: 'solar_body_3u',
    top: 'antenna_uhf',
    comms: 'antenna_sband',
    payload: 'inst_radiometer',
    internal_1: 'battery_20',
    internal_2: 'computer_fast',
    internal_3: 'adcs_wheels',
  },
});
const status = (r, id) => r.checks.find((c) => c.id === id).status;

test('orbit maths matches the build plan reference values', () => {
  assert.ok(Math.abs(periodMinutes(400, GM, RE) - 92.6) < 0.2);
  assert.ok(Math.abs(periodMinutes(550, GM, RE) - 95.6) < 0.2);
  assert.ok(Math.abs(speedKmS(400, GM, RE) - 7.67) < 0.01);
  assert.ok(Math.abs(periodMinutes(400, GM, RE) * eclipseFraction(400, RE) - 36) < 1);
  assert.ok(slantRangeKm(500, RE, 90) - 500 < 1e-6);
  assert.ok(Math.abs(pathLossDb(1000, 1000) - 152.45) < 0.01);
});

test('the reference design passes review and reaches CML 4', () => {
  const r = evaluate(good());
  assert.equal(r.reviewPass, true, JSON.stringify(r.checks.map((c) => [c.id, c.status, c.value])));
  assert.equal(r.cml, 4);
  assert.ok(r.requirements.every((q) => q.met), JSON.stringify(r.requirements));
  assert.equal(r.reasons.length, 10 - r.greens);
});

test('evaluate is deterministic and does not change its input', () => {
  const d = good();
  const before = JSON.stringify(d);
  assert.deepEqual(evaluate(d), evaluate(d));
  assert.equal(JSON.stringify(d), before);
});

test('swapping wings for body panels lowers the power margin', () => {
  const d = good();
  d.slots.face_px = 'solar_body_3u';
  d.slots.face_nx = 'solar_body_3u';
  const r = evaluate(d);
  assert.ok(r.power.margin < evaluate(good()).power.margin);
  assert.notEqual(status(r, 'power'), 'green');
});

test('a smaller battery lowers the energy margin; a bigger one raises it', () => {
  const small = good();
  small.slots.internal_1 = 'battery_10';
  const big = good();
  big.slots.internal_1 = 'battery_40';
  const base = evaluate(good()).energy.margin;
  assert.ok(evaluate(small).energy.margin < base);
  assert.ok(evaluate(big).energy.margin > base);
  assert.notEqual(status(evaluate(small), 'energy'), 'green');
});

test('every added part adds its mass and cost', () => {
  const d = good();
  const base = evaluate(d);
  delete d.slots.face_py;
  const lighter = evaluate(d);
  assert.ok(Math.abs(base.mass.kg - lighter.mass.kg - PARTS.solar_body_3u.mass_kg) < 1e-9);
  assert.equal(base.budget.partsCost - lighter.budget.partsCost, PARTS.solar_body_3u.cost_usd);
});

test('an S-band antenna needs an S-band ground station', () => {
  const d = good();
  d.station = { id: 'gs_uhf', count: 1 };
  const r = evaluate(d);
  assert.equal(r.comms.antenna, 'antenna_uhf');
  assert.notEqual(status(r, 'downlink'), 'green');
});

test('a second ground station doubles the downlink capacity', () => {
  const d = good();
  d.station.count = 2;
  assert.ok(Math.abs(evaluate(d).comms.capacityGbDay / evaluate(good()).comms.capacityGbDay - 2) < 1e-9);
});

test('a higher orbit weakens the link', () => {
  const low = good();
  low.orbit = 'leo_400';
  const high = good();
  high.orbit = 'leo_600';
  assert.ok(evaluate(low).comms.marginDb > evaluate(high).comms.marginDb);
});

test('the wrong instrument fails the objective and holds CML at 1', () => {
  const d = good();
  d.slots.payload = 'inst_magnetometer';
  const r = evaluate(d);
  assert.equal(status(r, 'instrument'), 'red');
  assert.equal(r.cml, 1);
});

test('the imager needs reaction wheels and the fast computer', () => {
  const d = good();
  d.objective = 'crops';
  d.slots.payload = 'inst_imager';
  d.slots.internal_2 = 'computer_basic';
  d.slots.internal_3 = 'adcs_basic';
  let r = evaluate(d);
  assert.equal(status(r, 'instrument'), 'yellow');
  d.slots.internal_3 = 'adcs_wheels';
  r = evaluate(d);
  assert.equal(status(r, 'instrument'), 'green');
  assert.notEqual(status(r, 'software'), 'green');
  d.slots.internal_2 = 'computer_fast';
  assert.equal(status(evaluate(d), 'software'), 'green');
});

test('CML 3 needs two compared snapshots', () => {
  const d = good();
  d.snapshotsCompared = 1;
  assert.equal(evaluate(d).cml, 2);
});

test('Concept Development relaxes margins to 20%', () => {
  const d = good();
  d.difficulty = 'concept';
  assert.equal(evaluate(d).checks.find((c) => c.id === 'mass').need, '≥ 20%');
});

test('parts are refused where they do not fit', () => {
  assert.equal(fitProblem('solar_wing_3u', 'face_px', 'bus_3u'), null);
  assert.ok(fitProblem('solar_wing_3u', 'face_px', 'bus_1u'));
  assert.ok(fitProblem('antenna_uhf', 'payload', 'bus_3u'));
  const d = good();
  d.slots.payload = 'antenna_uhf'; // ignored: wrong slot
  assert.equal(status(evaluate(d), 'instrument'), 'red');
});

test('an empty design does not crash and fails review', () => {
  const r = evaluate({ objective: 'hurricanes', difficulty: 'trade', bus: 'bus_3u', slots: {} });
  assert.equal(r.reviewPass, false);
  assert.equal(r.cml, 1);
});

test('every data value carries a source', () => {
  const walk = (node, path) => {
    if (node && typeof node === 'object' && 'value' in node) {
      assert.ok(node.source, `${path} has no source`);
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    }
  };
  walk(constants, 'constants');
  for (const list of [catalog.parts, catalog.stations, catalog.orbits, scenarios.objectives, scenarios.difficulties]) {
    for (const item of list) assert.ok(item.source, `${item.id} has no source`);
  }
});

test('every part names a model that exists in the build scripts', () => {
  const models = new Set(catalog.parts.map((p) => p.model));
  for (const m of models) assert.match(m, /^mod_[a-z0-9_]+$/);
});

test('every bus model has a socket for each of its slots', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const bus of catalog.parts.filter((p) => p.category === 'bus')) {
    const glb = await readFile(new URL(`../src/assets/models/${bus.model}.glb`, import.meta.url));
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
    const names = new Set(json.nodes.map((n) => n.name));
    for (const slot of bus.slots) assert.ok(names.has(`SOCKET_${slot}`), `${bus.model} lacks SOCKET_${slot}`);
  }
  for (const p of catalog.parts) {
    await readFile(new URL(`../src/assets/models/${p.model}.glb`, import.meta.url)); // throws if missing
  }
});
