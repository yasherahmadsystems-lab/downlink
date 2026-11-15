// Hot-seat role tests. Written by Claude (AI) for Team AETHELGARD.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../src/sim/evaluate.js';
import { simulateFlight } from '../src/sim/flight.js';
import { cardsFor, playerCount, ROLES, rolesOf, seatOf, seatsFor, tabOwner } from '../src/sim/roles.js';

const good = (players) => ({
  objective: 'hurricanes', difficulty: 'trade', bus: 'bus_3u', orbit: 'leo_500', players,
  station: { id: 'gs_sband', count: 1 }, snapshotsCompared: 2,
  slots: {
    face_px: 'solar_wing_3u', face_nx: 'solar_wing_3u', face_py: 'solar_body_3u', top: 'antenna_uhf', comms: 'antenna_sband',
    payload: 'inst_radiometer', internal_1: 'battery_20', internal_2: 'computer_fast', internal_3: 'adcs_wheels',
  },
});

test('every player count gives every role to exactly one player', () => {
  for (const n of [1, 2, 3, 4]) {
    const seats = seatsFor(n);
    assert.equal(seats.length, n);
    assert.deepEqual(seats.flat().sort(), ROLES.map((r) => r.id).sort());
    for (const role of ROLES) assert.ok(rolesOf(n, seatOf(n, role.id)).includes(role));
  }
});

test('player count is clamped to 1 to 4, and missing means solo', () => {
  assert.equal(playerCount({}), 1);
  assert.equal(playerCount({ players: 9 }), 4);
  assert.equal(playerCount({ players: 'x' }), 1);
});

test('every catalog tab has one owner and the Lead owns none', () => {
  for (const tab of ['bus', 'solar', 'computer', 'adcs', 'instrument', 'antenna', 'ground', 'orbit']) assert.ok(tabOwner(tab), tab);
  assert.equal(ROLES.find((r) => r.id === 'lead').tabs.length, 0);
});

test('a sound design meets all four cards; an empty one meets none of the build cards', () => {
  assert.ok(cardsFor(evaluate(good(1))).every((c) => c.met));
  const empty = cardsFor(evaluate({ ...good(1), slots: {} }));
  for (const id of ['engineer', 'science', 'ops']) assert.equal(empty.find((c) => c.id === id).met, false, id);
});

test('team play scores Collaboration from the cards; solo keeps Robustness', () => {
  const team = simulateFlight(good(4), 7);
  assert.equal(team.team, true);
  assert.equal(team.scores.robustness, 100);

  const weak = good(4);
  delete weak.slots.payload;
  const run = simulateFlight(weak, 7);
  assert.ok(run.scores.robustness < 100);
  assert.equal(run.chain.find((c) => c.key === 'robustness').label, 'Collaboration');

  const solo = simulateFlight(good(1), 7);
  assert.equal(solo.team, false);
  assert.ok(solo.chain.every((c) => c.label !== 'Collaboration'));
});

test('a spacecraft that cannot run returns no science and cannot grade above D', () => {
  for (const drop of [['face_px', 'face_nx', 'face_py'], ['internal_2'], ['payload']]) {
    const d = good(1);
    for (const slot of drop) delete d.slots[slot];
    for (let seed = 1; seed <= 20; seed++) {
      const run = simulateFlight(d, seed);
      assert.equal(run.scores.science, 0, drop.join());
      assert.ok(['D', 'E'].includes(run.grade), `${drop.join()} graded ${run.grade}`);
    }
  }
  const dead = good(1);
  delete dead.slots.internal_2;
  const run = simulateFlight(dead, 3);
  assert.equal(run.outcome.alive, false);
  assert.match(run.chain.find((c) => c.key === 'success').why, /never ran/);
});

test('no battery costs science, and never earns an A', () => {
  const d = good(1);
  delete d.slots.internal_1;
  for (let seed = 1; seed <= 30; seed++) {
    const run = simulateFlight(d, seed);
    assert.ok(run.outcome.uptime < 0.5);
    assert.notEqual(run.grade, 'A');
  }
});
