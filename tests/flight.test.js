// Flight simulation tests. Written by Claude (AI) for Team AETHELGARD.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeShare, encodeShare, rng, simulateFlight, WEIGHTS } from '../src/sim/flight.js';

const good = () => ({
  objective: 'hurricanes', difficulty: 'point', bus: 'bus_3u', orbit: 'leo_500',
  station: { id: 'gs_sband', count: 2 }, snapshotsCompared: 2,
  slots: {
    face_px: 'solar_wing_3u', face_nx: 'solar_wing_3u', face_py: 'solar_body_3u', top: 'antenna_uhf', comms: 'antenna_sband',
    payload: 'inst_radiometer', internal_1: 'battery_20', internal_2: 'computer_fast', internal_3: 'adcs_wheels',
  },
});
const fragile = () => {
  const d = good();
  d.station.count = 1;
  delete d.slots.top;
  d.slots.internal_1 = 'battery_10';
  d.slots.internal_2 = 'computer_basic';
  return d;
};
const answerAll = (design, seed, pick = 0) => {
  let run = simulateFlight(design, seed);
  const choices = {};
  while (run.pending) {
    choices[run.pending.id] = run.pending.options[pick].id;
    run = simulateFlight(design, seed, choices);
  }
  return run;
};

test('the generator is repeatable and in range', () => {
  const a = rng(42);
  const b = rng(42);
  for (let i = 0; i < 50; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test('score weights add up to 1', () => {
  assert.ok(Math.abs(Object.values(WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('the same design and seed give the same flight', () => {
  assert.deepEqual(simulateFlight(good(), 7), simulateFlight(good(), 7));
});

test('a robust design has every event softened and scores an A', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const run = simulateFlight(good(), seed);
    assert.equal(run.pending, null);
    assert.ok(run.events.length >= 2);
    assert.ok(run.events.every((e) => e.softened));
    assert.equal(run.grade, 'A', `seed ${seed}: ${run.total}`);
    assert.ok(run.requirements.filter((q) => q.metric !== 'budget_reserve').every((q) => q.met)); // Point Design's budget is tight on purpose
  }
});

test('a fragile design meets events it must decide on, and scores lower', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const first = simulateFlight(fragile(), seed);
    assert.ok(first.pending, `seed ${seed} had no decision`);
    assert.ok(first.pending.options.length === 2);
    const done = answerAll(fragile(), seed);
    assert.equal(done.pending, null);
    assert.ok(done.total < simulateFlight(good(), seed).total);
    assert.ok(done.chain.length > 0);
    assert.ok(done.chain.every((c) => c.why && c.fix));
  }
});

test('the choice changes the outcome', () => {
  const seed = [1, 2, 3, 4, 5, 6, 7, 8].find((s) => simulateFlight(fragile(), s).events.some((e) => e.id === 'battery_fade' && !e.softened));
  assert.ok(seed, 'no seed drew the battery event');
  const rest = simulateFlight(fragile(), seed, { battery_fade: 'rest' });
  const push = simulateFlight(fragile(), seed, { battery_fade: 'push' });
  assert.ok(push.outcome.lifeYears < rest.outcome.lifeYears);
});

test('Office Hours has no events', () => {
  const d = good();
  d.difficulty = 'office_hours';
  assert.equal(simulateFlight(d, 3).events.length, 0);
});

test('a share code round-trips and rejects junk', () => {
  const code = encodeShare(good(), 1234);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeShare(code), { design: good(), seed: 1234 });
  assert.equal(decodeShare('not-a-code'), null);
  assert.equal(decodeShare(''), null);
});
