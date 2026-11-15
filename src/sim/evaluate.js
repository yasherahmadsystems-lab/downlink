// The design evaluator: one pure, deterministic function from a design to its
// margins, review checklist, CML level and plain-language reasons.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
//
// A design is plain data:
//   { objective, difficulty, bus, slots: { <slot>: <partId> }, orbit,
//     station: { id, count }, snapshotsCompared }
// The UI reads only what this returns. Formulas: docs build plan v3 §5.
import constants from '../data/constants.json' with { type: 'json' };
import catalog from '../data/parts.json' with { type: 'json' };
import scenarios from '../data/scenarios.json' with { type: 'json' };
import { eclipseFraction, periodMinutes, slantRangeKm } from './orbit.js';
import { linkMarginDb } from './comms.js';

const C = constants;
const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
export const PARTS = byId(catalog.parts);
export const STATIONS = byId(catalog.stations);
export const ORBITS = byId(catalog.orbits);
export const OBJECTIVES = byId(scenarios.objectives);
export const DIFFICULTIES = byId(scenarios.difficulties);

const sum = (list, f) => list.reduce((acc, x) => acc + (f(x) ?? 0), 0);
/** NASA margin convention: (allocation - estimate) / estimate. */
const margin = (allocation, estimate) => (estimate > 0 ? (allocation - estimate) / estimate : Infinity);
const POINTING_RANK = { none: 0, coarse: 1, fine: 2 };

/** Can this part go in this slot of this bus? Returns null if yes, else the reason. */
export function fitProblem(partId, slot, busId) {
  const part = PARTS[partId];
  const bus = PARTS[busId];
  if (!part) return 'Unknown part';
  if (!bus?.slots.includes(slot)) return `The ${bus?.name ?? 'bus'} has no such mounting point`;
  if (part.fits && !part.fits.includes(busId)) return `Does not fit a ${bus.name}`;
  if (!part.slots?.includes(slot)) return 'Does not mount there';
  return null;
}

export function evaluate(design) {
  const objective = OBJECTIVES[design.objective];
  const difficulty = DIFFICULTIES[design.difficulty] ?? DIFFICULTIES.trade;
  const bus = PARTS[design.bus];
  const orbit = ORBITS[design.orbit];
  const station = STATIONS[design.station?.id];
  const stationCount = station ? Math.max(1, design.station.count ?? 1) : 0;

  const fitted = Object.entries(design.slots ?? {})
    .filter(([slot, id]) => id && bus && fitProblem(id, slot, bus.id) === null)
    .map(([, id]) => PARTS[id]);
  const of = (category) => fitted.filter((p) => p.category === category);
  const instruments = of('instrument');
  const antennas = of('antenna');
  const adcs = of('adcs')[0];
  const pointing = adcs?.pointing ?? 'none';

  const T = C.thresholds;
  const marginNeed = (key) => difficulty.margin_override ?? T[key].value;

  // ---- Mass
  const massKg = (bus?.mass_kg ?? 0) + sum(fitted, (p) => p.mass_kg);
  const massMargin = bus ? margin(bus.max_mass_kg, massKg) : -1;

  // ---- Power (orbit average)
  const eclipse = orbit ? eclipseFraction(orbit.altitude_km, C.earth.radius_km.value) : 0.4;
  const pf = C.power.pointing_factor;
  const generatedW = sum(of('solar'), (p) => {
    const factor = p.tracking ? pf[`tracking_${pointing}`].value : pf.fixed.value;
    return (
      p.area_m2 * C.power.cell_efficiency.value * C.solar_irradiance_w_m2.value * factor * (1 - eclipse) * C.power.end_of_life_factor.value
    );
  });
  const loadW = sum(fitted, (p) => p.power_w);
  const powerMargin = loadW > 0 ? margin(generatedW, loadW) : generatedW > 0 ? Infinity : -1;

  // ---- Energy: the battery must carry the load through each eclipse
  const periodMin = orbit ? periodMinutes(orbit.altitude_km, C.earth.gm_km3_s2.value, C.earth.radius_km.value) : 95;
  const eclipseMin = periodMin * eclipse;
  const usableWh = sum(of('battery'), (p) => p.capacity_wh) * C.power.depth_of_discharge.value;
  const eclipseWh = (loadW * eclipseMin) / 60;
  const energyMargin = eclipseWh > 0 ? margin(usableWh, eclipseWh) : usableWh > 0 ? Infinity : -1;

  // ---- Flight software: processor and memory headroom
  const cpuCapacity = sum(of('computer'), (p) => p.capacity);
  const cpuLoad = sum(fitted, (p) => p.cpu_load);
  const softwareMargin = cpuCapacity === 0 ? -1 : cpuLoad > 0 ? margin(cpuCapacity, cpuLoad) : Infinity;

  // ---- Data and comms: each antenna is rated against the chosen ground station
  const generatedMbDay = sum(instruments, (p) => (p.data_rate_bps * p.duty * 86400) / 1e6);
  const rangeKm = orbit ? slantRangeKm(orbit.altitude_km, C.earth.radius_km.value, C.link.min_elevation_deg.value) : 0;
  const links = antennas.map((a) => {
    const rxGain = station?.gain_dbi[a.band];
    const aimed = !a.needs_pointing || POINTING_RANK[pointing] >= POINTING_RANK[a.needs_pointing];
    if (rxGain == null || !orbit) return { antenna: a, marginDb: -Infinity, mbDay: 0, usable: false, aimed };
    const marginDb = linkMarginDb({
      txPowerW: a.tx_power_w,
      txGainDbi: aimed ? a.gain_dbi : 0, // an unaimed dish is no better than a bare feed
      rxGainDbi: rxGain,
      noiseTempK: station.noise_temp_k,
      rateBps: a.rate_bps,
      distanceKm: rangeKm,
      freqMhz: a.freq_mhz,
      lossesDb: C.link.losses_db.value,
      requiredEbN0Db: C.link.required_ebn0_db.value,
      boltzmann: C.link.boltzmann_dbw_k_hz.value,
    });
    const closes = marginDb >= 0;
    const mbDay = closes ? (a.rate_bps * orbit.passes_per_day * orbit.pass_seconds * stationCount) / 1e6 : 0;
    return { antenna: a, marginDb, mbDay, usable: closes, aimed };
  });
  const best = links.reduce((b, l) => (l.mbDay > (b?.mbDay ?? -1) ? l : b), null);
  const linkMargin = best ? best.marginDb : -Infinity;
  const capacityMbDay = best?.mbDay ?? 0;
  const downlinkMbDay = Math.min(generatedMbDay, capacityMbDay);
  const downlinkFraction = generatedMbDay > 0 ? downlinkMbDay / generatedMbDay : 0;

  // ---- Time
  const S = C.schedule;
  const lowTrl = [bus, ...fitted].filter(Boolean).filter((p) => p.trl < T.ready_trl.value);
  const buildMonths =
    S.base_months.value +
    instruments.length * S.months_per_instrument.value +
    sum(lowTrl, (p) => (T.ready_trl.value - p.trl) * S.months_per_missing_trl.value) +
    (bus?.extra_months ?? 0);
  const lifetimeYears = orbit?.lifetime_years ?? 0;
  const missionYears = objective?.mission_years ?? 1;

  // ---- Budget
  const partsCost = (bus?.cost_usd ?? 0) + sum(fitted, (p) => p.cost_usd);
  const launchCost = bus?.launch_cost_usd ?? 0;
  const opsCost = missionYears * (C.ops_cost_usd_per_year.value + (station?.cost_usd_per_year ?? 0) * stationCount);
  const totalCost = partsCost + launchCost + opsCost;
  const costCap = (objective?.cost_cap_usd ?? 0) * difficulty.budget_scale;
  const budgetReserve = costCap > 0 ? (costCap - totalCost) / costCap : -1;

  // ---- Compatibility
  const matching = instruments.filter((p) => p.objectives.includes(design.objective));
  const unaimed = instruments.filter((p) => p.needs_pointing && POINTING_RANK[pointing] < POINTING_RANK[p.needs_pointing]);
  const instrumentOk = matching.length > 0 && unaimed.length === 0;
  const launchOk = Boolean(bus && orbit) && massKg <= bus.max_mass_kg;
  const mitigated = stationCount >= 2 || antennas.length >= 2;
  const scheduleOk = buildMonths <= (objective?.schedule_months ?? 24);

  // ---- Review checklist (v3 §5.4): 10 items, pass at 80% green
  const pct = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : x > 0 ? 'no load' : 'none');
  const grade = (value, need, yellowAt) => (value >= need ? 'green' : value >= yellowAt ? 'yellow' : 'red');
  const marginCheck = (id, label, value, key) => {
    const need = marginNeed(key);
    return { id, label, status: grade(value, need, need * 0.6), amount: value, target: need, value: pct(value), need: `≥ ${Math.round(need * 100)}%`, source: T[key].source };
  };
  const checks = [
    marginCheck('mass', 'Dry mass margin', massMargin, 'mass_margin'),
    marginCheck('power', 'Power margin', powerMargin, 'power_margin'),
    marginCheck('energy', 'Battery energy margin', energyMargin, 'energy_margin'),
    {
      id: 'software', label: 'Flight software margin',
      status: grade(softwareMargin, T.software_margin.value, T.software_margin.value * 0.6), amount: softwareMargin, target: T.software_margin.value,
      value: pct(softwareMargin), need: '≥ 100%', source: T.software_margin.source,
    },
    {
      id: 'link', label: 'Link margin',
      status: grade(linkMargin, T.link_margin_db.value, T.link_margin_db.value - 3), amount: linkMargin, target: T.link_margin_db.value,
      value: Number.isFinite(linkMargin) ? `${linkMargin.toFixed(1)} dB` : 'no link', need: `≥ ${T.link_margin_db.value} dB`, source: T.link_margin_db.source,
    },
    {
      id: 'budget', label: 'Budget with reserve',
      status: grade(budgetReserve, T.budget_reserve.value, 0), amount: budgetReserve, target: T.budget_reserve.value,
      value: `${Math.round(budgetReserve * 100)}% reserve`, need: '≥ 10% reserve', source: T.budget_reserve.source,
    },
    {
      id: 'launch', label: 'Launcher, orbit and mass compatible',
      status: launchOk ? 'green' : 'red',
      value: bus ? `${massKg.toFixed(2)} kg of ${bus.max_mass_kg} kg` : 'no structure', need: 'within the deployer limit', source: 'NASA: CubeSat 101',
    },
    {
      id: 'instrument', label: 'Instrument fits the objective',
      status: instrumentOk ? 'green' : matching.length ? 'yellow' : 'red',
      value: matching.length ? (unaimed.length ? 'cannot be aimed' : matching[0].name) : 'no matching instrument', need: 'matches the science objective', source: 'NASA: A Learning Game About Telescopes (mechanic)',
    },
    {
      id: 'downlink', label: 'Data downlinked',
      status: grade(downlinkFraction, T.downlink_fraction.value, 0.6), amount: downlinkFraction, target: T.downlink_fraction.value,
      value: `${Math.round(downlinkFraction * 100)}% of data`, need: '≥ 90%', source: T.downlink_fraction.source,
    },
    {
      id: 'schedule', label: 'Schedule and top risk',
      status: scheduleOk && mitigated ? 'green' : scheduleOk ? 'yellow' : 'red',
      value: `${buildMonths} months${mitigated ? ', backup link' : ', no backup link'}`, need: `≤ ${objective?.schedule_months ?? 24} months, with a backup`, source: 'Game balance',
    },
  ];
  const greens = checks.filter((c) => c.status === 'green').length;
  const reviewPass = greens / checks.length >= T.review_pass_fraction.value;

  // ---- Concept Maturity Level (v3 §2)
  const marginsMet = ['mass', 'power', 'energy', 'software', 'link'].every((id) => checks.find((c) => c.id === id).status === 'green');
  let cml = 0;
  if (objective) cml = 1;
  if (cml === 1 && launchOk && matching.length > 0 && generatedW > loadW) cml = 2;
  if (cml === 2 && (design.snapshotsCompared ?? 0) >= 2) cml = 3;
  if (cml === 3 && marginsMet) cml = 4;

  // ---- Mission requirements from the briefing
  const metrics = {
    instrument_match: instrumentOk ? 1 : 0,
    pointing_fine: pointing === 'fine' ? 1 : 0,
    downlink_gb_day: downlinkMbDay / 8000,
    lifetime_years: lifetimeYears,
    budget_reserve: budgetReserve,
  };
  const requirements = (objective?.requirements ?? []).map((r) => ({ ...r, actual: metrics[r.metric], met: metrics[r.metric] >= r.value }));

  return {
    mass: { kg: massKg, limitKg: bus?.max_mass_kg ?? 0, margin: massMargin },
    power: { generatedW, loadW, margin: powerMargin, eclipseFraction: eclipse },
    energy: { usableWh, eclipseWh, eclipseMin, periodMin, margin: energyMargin },
    software: { capacity: cpuCapacity, load: cpuLoad, margin: softwareMargin },
    comms: { marginDb: linkMargin, rangeKm, antenna: best?.antenna.id ?? null, capacityGbDay: capacityMbDay / 8000 },
    data: { generatedGbDay: generatedMbDay / 8000, downlinkGbDay: downlinkMbDay / 8000, fraction: downlinkFraction },
    time: { buildMonths, limitMonths: objective?.schedule_months ?? 24, lifetimeYears, missionYears },
    budget: { partsCost, launchCost, opsCost, totalCost, costCap, reserve: budgetReserve },
    pointing,
    checks,
    greens,
    reviewPass,
    cml,
    requirements,
    reasons: reasons({ checks, loadW, generatedW, pointing, best, station, stationCount, generatedMbDay, capacityMbDay, lowTrl, unaimed, massKg, bus }),
  };
}

/** One plain sentence and one suggested fix for every check that is not green. */
function reasons(x) {
  const out = [];
  const add = (id, why, fix) => {
    if (x.checks.find((c) => c.id === id).status !== 'green') out.push({ id, why, fix });
  };
  add('mass', `The spacecraft weighs ${x.massKg.toFixed(2)} kg, too close to the ${x.bus?.max_mass_kg ?? 0} kg limit.`, 'Swap a heavy part for a lighter one, or move to a bigger structure.');
  add('power', `The panels make ${x.generatedW.toFixed(1)} W on average but the parts draw ${x.loadW.toFixed(1)} W.`,
    x.pointing === 'fine' ? 'Add a solar panel or remove a power-hungry part.' : 'Add a deployable wing, or add reaction wheels so wings can track the Sun.');
  add('energy', 'The battery cannot carry the load through Earth\'s shadow with enough to spare.', 'Fit a larger battery or lower the power draw.');
  add('software', 'The flight computer has too little processor and memory headroom for these parts.', 'Fit the high-performance computer or a simpler instrument.');
  add('link', !x.best ? 'There is no antenna that the ground station can hear.' : !x.best.aimed ? 'The dish antenna cannot be aimed without reaction wheels.' : 'The signal reaching the ground is too weak for this data rate.',
    !x.station ? 'Choose a ground station.' : 'Match the antenna to the ground station, or use a higher-gain antenna or a lower orbit.');
  add('budget', 'The mission costs too much to keep a 10% reserve.', 'Remove a costly part, use fewer ground stations, or choose a smaller structure.');
  add('launch', 'The spacecraft is heavier than its deployer allows.', 'Remove parts or use a bigger structure.');
  add('instrument', x.unaimed.length ? `The ${x.unaimed[0].name.toLowerCase()} needs fine pointing to work.` : 'No instrument on board can meet this science objective.',
    x.unaimed.length ? 'Fit reaction wheels.' : 'Fit the instrument that matches the objective.');
  add('downlink', `The instrument makes ${(x.generatedMbDay / 8000).toFixed(2)} GB a day but only ${(x.capacityMbDay / 8000).toFixed(2)} GB can be sent down.`,
    'Use a faster antenna, add a ground station, or pick an orbit with longer passes.');
  add('schedule', x.lowTrl.length ? `${x.lowTrl.map((p) => p.name).join(' and ')} is not flight-proven, which adds development time.` : 'There is no backup if the only link to the ground fails.',
    x.lowTrl.length ? 'Use flight-proven parts.' : 'Add a second antenna or a second ground station.');
  return out;
}
