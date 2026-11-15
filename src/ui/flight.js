// Stage 3, Flight: lift-off on a shared launch, release from the deployer, commissioning on the CubeSat 101
// timeline, a time-lapse of science operations with seeded events, then the report.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
import { h } from './dom.js';
import { chip, soundToggle } from './kit.js';
import { sound } from '../audio.js';
import { simulateFlight } from '../sim/flight.js';
import { OBJECTIVES, ORBITS, PARTS } from '../sim/evaluate.js';
import { createAssembly } from '../scenes/assembly.js';
import { hinges, part, setDeploy, settle } from '../scenes/spacecraft.js';
import { reducedMotion } from '../scenes/renderer.js';
import { IGNITE_S, LAUNCH_S } from '../scenes/launch.js';
import constants from '../data/constants.json' with { type: 'json' };

// Real seconds for each phase of the sequence
const RELEASE_S = 5;
const COMMISSION_S = 7;
const OPS_S = 20;
const DEPLOY_MIN = constants.cubesat.antenna_deploy_min.value;
const BEACON_MIN = constants.cubesat.first_beacon_min.value;

const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const pad = (n) => String(Math.floor(n)).padStart(2, '0');

export function createFlight(orbit, game, launch) {
  const craft = createAssembly(orbit.mount);
  let deployerHinges = [];
  let design = null;
  let seed = 0;
  let choices = {};
  let run = null;
  let clock = 0; // real seconds since release, paused while an event card is open
  let liftT = 0; // real seconds into the launch shot
  let launchOn = false;
  let angle = 0.9;
  let spin = 0;
  let soc = 1;
  let shownEvents = new Set();
  let openEvent = null;
  let ready = false;
  let dom = null;
  let played = new Set();
  const once = (name, when) => {
    if (when && !played.has(name)) {
      played.add(name);
      sound.play(name);
    }
  };

  async function start(d, s) {
    design = structuredClone(d);
    seed = s;
    choices = {};
    run = simulateFlight(design, seed);
    clock = 0;
    liftT = 0;
    launchOn = false;
    soc = 1;
    shownEvents = new Set();
    played = new Set();
    openEvent = null;
    ready = false;
    orbit.configure({ altitudeKm: ORBITS[design.orbit]?.altitude_km ?? 500, stationCount: design.station?.count ?? 0 });
    // The launch shot is skipped if its models cannot be loaded; the flight still runs.
    const [deployer, , launchReady] = await Promise.all([
      part('mod_deployer_3u'),
      craft.sync(design, null, { stowed: true, yaw: 0 }),
      launch.load().then(() => true, () => false),
    ]);
    launchOn = launchReady;
    deployer.scale.set(PARTS[design.bus].units === 6 ? 0.23 : 0.1, 0.1, 0.1);
    deployer.position.y = -0.014;
    orbit.deployerMount.clear();
    orbit.deployerMount.add(deployer);
    deployerHinges = hinges(deployer);
    setDeploy(deployerHinges, 0);
    ready = true;
  }

  const objective = () => OBJECTIVES[design.objective];
  const days = () => objective().mission_years * 365;

  function update(dt) {
    if (!ready) {
      orbit.update({ angle, earthSpin: spin, pull: 0, slide: 0, dt });
      return;
    }
    const still = reducedMotion();
    if (launchOn) {
      // Reduced motion: hold the lift-off frame for a moment instead of the full climb
      const end = still ? 3 : LAUNCH_S;
      liftT += dt;
      launch.update(still ? Math.min(liftT, IGNITE_S + 1.2) : liftT, still);
      once('ignite', liftT >= IGNITE_S);
      if (dom) {
        dom.root.classList.add('is-launch');
        dom.phase.textContent = 'Launch';
        dom.clock.textContent = liftT < IGNITE_S ? 'Final count' : launch.altitude < 0.5 ? 'Engines at full thrust' : `Altitude ${Math.round(launch.altitude)} m`;
        dom.lift.classList.toggle('is-done', launch.altitude > 0.5 || (still && liftT > IGNITE_S));
        dom.fade.style.opacity = Math.max(1 - liftT / 0.5, (liftT - (end - 0.6)) / 0.6, 0).toFixed(3);
      }
      if (liftT >= end) {
        launchOn = false;
        sound.hush();
      }
      return;
    }
    if (!openEvent) clock += dt;

    // Phase timing
    const tRelease = clamp01(clock / RELEASE_S);
    const tCommission = clamp01((clock - RELEASE_S) / COMMISSION_S);
    const tOps = clamp01((clock - RELEASE_S - COMMISSION_S) / OPS_S);
    const phase = tRelease < 1 ? 'release' : tCommission < 1 ? 'commission' : 'ops';
    const missionMin = tCommission * BEACON_MIN;

    // Release: door swings open, then the spring pushes the spacecraft out
    setDeploy(deployerHinges, still ? 1 : settle(clamp01(clock / 1.4)));
    const slide = 34 * ease(clamp01((clock - 1.5) / 3.5)) + Math.max(0, clock - RELEASE_S) * 6;

    once('release', clock >= 1.5);

    // Commissioning: antennas at T+30 min, then the solar wings; beacon at T+45 min
    const antennaAt = RELEASE_S + (DEPLOY_MIN / BEACON_MIN) * COMMISSION_S;
    craft.pose('antenna', still ? (clock >= antennaAt ? 1 : 0) : settle(clamp01((clock - antennaAt) / 0.8)));
    craft.pose('instrument', still ? (clock >= antennaAt ? 1 : 0) : settle(clamp01((clock - antennaAt - 0.5) / 1.0)));
    craft.pose('solar', still ? (clock >= antennaAt ? 1 : 0) : settle(clamp01((clock - antennaAt - 0.9) / 1.1)));

    once('latch', clock >= antennaAt);
    once('beacon', tCommission >= 1);

    if (!openEvent) {
      angle += dt * (phase === 'ops' ? 0.5 : 0.1);
      spin += dt * (phase === 'ops' ? 0.05 : 0.004);
    }
    orbit.update({ angle, earthSpin: spin, pull: ease(clamp01((clock - RELEASE_S + 1) / 5)), slide, dt });

    // Battery: charges in sunlight, drains through each eclipse to the design's low point
    const e = run.evaluation.energy;
    const capacityWh = e.usableWh / constants.power.depth_of_discharge.value;
    const low = capacityWh > 0 ? Math.max(0, 1 - e.eclipseWh / capacityWh) : 0;
    soc += ((orbit.inEclipse ? low : 1) - soc) * Math.min(1, dt * (orbit.inEclipse ? 1.4 : 2.5));

    // Events fire as the time-lapse reaches them
    if (phase === 'ops' && !openEvent) {
      const due = run.events.find((ev) => tOps >= ev.at && !shownEvents.has(ev.id));
      if (due) {
        shownEvents.add(due.id);
        openEvent = due;
        sound.play(due.softened ? 'absorbed' : 'alarm');
        drawEvent();
      } else if (tOps >= 1) {
        ready = false;
        game.finish(run);
        return;
      }
    }

    if (dom) {
      dom.root.classList.remove('is-launch');
      dom.lift.classList.add('is-done');
      dom.fade.style.opacity = Math.max(0, 1 - clock / 0.7).toFixed(3);
      dom.phase.textContent = { release: 'Release', commission: 'Commissioning', ops: 'Science operations' }[phase];
      dom.clock.textContent =
        phase === 'ops' ? `Day ${Math.min(days(), Math.floor(tOps * days()) + 1)} of ${days()}` : `T+ 00:${pad(missionMin)}:${pad((missionMin % 1) * 60)}`;
      dom.steps[0].classList.toggle('is-done', clock > 3);
      dom.steps[1].classList.toggle('is-done', clock >= antennaAt + 0.8);
      dom.steps[2].classList.toggle('is-done', tCommission >= 1);
      dom.steps[3].classList.toggle('is-done', tOps >= 1);
      dom.battery.style.width = `${(soc * 100).toFixed(0)}%`;
      dom.batteryNum.textContent = `${Math.round(soc * 100)}%`;
      dom.sun.textContent = orbit.inEclipse ? 'In Earth\'s shadow' : 'In sunlight';
      dom.link.textContent = !run.outcome.alive ? 'No signal from the spacecraft' : tCommission < 1 ? 'Not yet transmitting' : orbit.linked ? 'In contact, sending data' : 'Out of view of a station';
      dom.link.classList.toggle('is-live', run.outcome.alive && orbit.linked && tCommission >= 1);
      dom.data.textContent = `${(run.outcome.returnedGb * tOps).toFixed(1)} of ${run.outcome.targetGb.toFixed(1)} GB`;
    }
  }

  function choose(optionId) {
    if (optionId) choices[openEvent.id] = optionId;
    run = simulateFlight(design, seed, choices);
    const resolved = run.events.find((ev) => ev.id === openEvent.id);
    if (optionId) {
      openEvent = { ...resolved, done: true };
      drawEvent();
    } else {
      addLog(resolved);
      openEvent = null;
      drawEvent();
    }
  }

  function addLog(ev) {
    dom?.log.append(h('li', { class: `is-done${ev.softened ? '' : ' is-hard'}` }, ev.title, h('span', {}, ev.softened ? 'Absorbed by the design' : ev.result)));
  }

  function drawEvent() {
    if (!dom) return;
    const ev = openEvent;
    dom.card.replaceChildren(
      ...(ev
        ? [
            h('span', { class: 'stencil' }, ev.softened ? 'Event, absorbed' : ev.done ? 'Event, outcome' : 'Event, decision needed'),
            h('h2', { id: 'event-h' }, ev.title),
            h('p', {}, ev.done ? ev.result : ev.text),
            h('p', { class: 'note' }, ev.lesson),
            h(
              'div',
              { class: 'event__actions' },
              ...(ev.softened || ev.done
                ? [h('button', { class: 'btn btn--primary', 'data-autofocus': true, onclick: () => choose(null) }, 'Continue the mission')]
                : ev.options.map((o) => h('button', { class: 'btn', onclick: () => choose(o.id) }, o.label))),
            ),
          ]
        : []),
    );
    dom.card.hidden = !ev;
    dom.card.querySelector('button')?.focus({ preventScroll: true });
  }

  /** Jumps to the next thing that needs the player: an event, or the report. */
  function skip() {
    if (openEvent || !ready) return;
    if (launchOn) {
      liftT = Infinity;
      return;
    }
    const opsStart = RELEASE_S + COMMISSION_S;
    const next = run.events.find((ev) => !shownEvents.has(ev.id));
    clock = Math.max(clock, opsStart + (next ? next.at : 1) * OPS_S);
  }

  function render() {
    const step = (label, source) => h('li', {}, label, source ? chip(source) : null);
    dom = {
      phase: h('h1', { class: 'hud__phase' }, 'Release'),
      clock: h('p', { class: 'hud__clock', role: 'timer' }, 'T+ 00:00:00'),
      lift: step('Lift-off as a shared-ride payload', 'NASA: CubeSat 101'),
      ride: h('p', { class: 'hud__ride' }, 'Your CubeSat rides to orbit inside its deployer, as a small extra payload on a shared launch. ', chip('NASA: CubeSat 101')),
      fade: h('div', { class: 'hud__fade', 'aria-hidden': 'true' }),
      steps: [
        step('Released from the deployer'),
        step(`Antennas deploy at T+${DEPLOY_MIN} min`, constants.cubesat.antenna_deploy_min.source),
        step(`First beacon at T+${BEACON_MIN} min`, constants.cubesat.first_beacon_min.source),
        step('End of planned mission'),
      ],
      battery: h('span', { class: 'hud__fill' }),
      batteryNum: h('strong', {}, '100%'),
      sun: h('span', {}, ''),
      link: h('strong', { class: 'hud__link' }, ''),
      data: h('strong', {}, ''),
      card: h('section', { class: 'event', role: 'dialog', 'aria-labelledby': 'event-h', hidden: true }),
    };
    dom.log = h('ol', { class: 'hud__steps' }, dom.lift, dom.steps[0], dom.steps[1], dom.steps[2]);
    const cell = (label, ...body) => h('div', { class: 'hud__cell' }, h('span', { class: 'stencil' }, label), ...body);
    dom.root = h(
      'section',
      { class: 'hud', 'data-scene': 'flight', 'aria-label': 'Flight' },
      dom.fade,
      h('header', { class: 'hud__head' }, h('span', { class: 'stencil' }, `Stage 3 of 3 / Flight / ${objective().name}`), dom.phase, dom.clock, dom.ride),
      h('div', { class: 'hud__log' }, dom.log, h('ol', { class: 'hud__steps hud__steps--end' }, dom.steps[3])),
      dom.card,
      h(
        'footer',
        { class: 'hud__foot' },
        cell('Battery', h('div', { class: 'hud__bar', 'aria-hidden': 'true' }, dom.battery), dom.batteryNum, dom.sun),
        cell('Ground link', dom.link),
        cell('Science data returned', dom.data),
        h('div', { class: 'hud__tools' }, soundToggle(), h('button', { class: 'btn btn--small', onclick: skip }, 'Skip ahead')),
      ),
    );
    return dom.root;
  }

  return {
    start,
    update,
    render,
    get seed() { return seed; },
    /** The scene and camera to draw this frame: the launch pad, then orbit. */
    get view() { return launchOn ? launch : orbit; },
  };
}
