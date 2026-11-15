// What happens after launch: seeded in-flight events, the mission outcome, the
// score and a plain-language cause chain. Pure and deterministic.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
//
//   simulateFlight(design, seed, choices) -> { events, outcome, scores, total, grade, chain }
// `choices` maps an event id to the option the player picked. Call once with no
// choices to learn which events will happen, then again with the answers.
import { DIFFICULTIES, evaluate, OBJECTIVES } from './evaluate.js';
import { cardsFor, playerCount } from './roles.js';
import constants from '../data/constants.json' with { type: 'json' };

const DOD = constants.power.depth_of_discharge.value;
const RESTART_SHARE = 0.25; // share of each orbit lost to restarting after a blackout (Game balance)
const NO_SCIENCE_CAP = 54; // top of grade D (Game balance)

/** Small seeded generator (mulberry32) so a share code replays the same flight. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Score weights. Defaults from the build plan (v3 §5.6); the team may change them.
export const WEIGHTS = { success: 0.25, science: 0.25, efficiency: 0.2, decisions: 0.2, robustness: 0.1 };
/** With two or more players the last category is Collaboration instead of Robustness (v3 §3). */
export const lastLabel = (team) => (team ? 'Collaboration' : 'Robustness');
const LABELS = { success: 'Mission success', science: 'Science value', efficiency: 'Resource efficiency', decisions: 'Decision quality', robustness: 'Robustness' };

/**
 * The event deck (v3 §5.5). Each event checks the design for the thing that
 * softens it. If that is missing, the player must choose between two costs.
 * Effects multiply: sci (science collected), down (data sent down), life
 * (mission length); cost adds dollars.
 */
const DECK = [
  {
    id: 'antenna_stuck', at: 0.02, title: 'An antenna did not deploy',
    softened: (c) => c.antennas >= 2,
    calm: 'One antenna stayed folded after release. Your second antenna took over the link, so nothing was lost.',
    alarm: 'Your only antenna stayed partly folded after release. The signal is far weaker than planned.',
    lesson: 'A second antenna is the backup for this.',
    options: (c) => [
      c.hasAdcs
        ? { id: 'shake', label: 'Spin the spacecraft to shake it free', result: 'The spin worked after three days of trying.', fx: { sci: 0.99 } }
        : { id: 'shake', label: 'Spin the spacecraft to shake it free', result: 'With no attitude control the spacecraft could not spin on command. The antenna stayed stuck.', fx: { down: 0.3 } },
      { id: 'accept', label: 'Accept the weak link', result: 'You kept flying with half the planned downlink.', fx: { down: 0.5 } },
    ],
  },
  {
    id: 'radiation_reset', at: 0.35, title: 'Radiation upset the flight computer',
    softened: (c) => c.r.software.margin >= 1,
    calm: 'A charged particle flipped a bit in memory. With plenty of processor headroom the computer checked itself and recovered within one orbit.',
    alarm: 'A charged particle flipped a bit in memory. The computer is running at its limit and cannot recover while it also runs the instrument.',
    lesson: 'Software margin is what lets a computer recover by itself.',
    options: () => [
      { id: 'reload', label: 'Stop science and reload the software', result: 'Ten days of science were lost while the software was reloaded from the ground.', fx: { sci: 0.9 } },
      { id: 'reduced', label: 'Keep going in a reduced mode', result: 'The instrument ran at a lower rate for the rest of the mission.', fx: { sci: 0.8 } },
    ],
  },
  {
    id: 'station_outage', at: 0.55, title: 'A ground station went offline',
    softened: (c) => c.stations >= 2,
    calm: 'A storm took one ground station off the air for three weeks. Your other station kept receiving.',
    alarm: 'A storm took your only ground station off the air for three weeks. Data is piling up on board.',
    lesson: 'A second ground station is the backup for this.',
    options: () => [
      { id: 'rent', label: 'Rent emergency antenna time ($40k)', result: 'A commercial station covered the gap, at a price.', fx: { cost: 40000 } },
      { id: 'wait', label: 'Wait for the station to return', result: 'The oldest data was overwritten before it could be sent down.', fx: { down: 0.85 } },
    ],
  },
  {
    id: 'battery_fade', at: 0.7, title: 'The battery is losing capacity',
    softened: (c) => c.r.energy.margin >= 0.35,
    calm: 'The battery has aged, as batteries do. Your energy margin absorbed the loss.',
    alarm: 'The battery has aged and there was little margin to begin with. It now runs nearly flat in every eclipse.',
    lesson: 'Energy margin is there because batteries fade.',
    options: () => [
      { id: 'rest', label: 'Switch the instrument off in eclipse', result: 'The battery survived, but the instrument missed the dark half of every orbit.', fx: { sci: 0.75 } },
      { id: 'push', label: 'Keep everything running', result: 'The battery failed early and the mission ended with it.', fx: { life: 0.6 } },
    ],
  },
];

function unmetCount(r) {
  return r.checks.length - r.greens;
}

export function simulateFlight(design, seed, choices = {}) {
  const r = evaluate(design);
  const objective = OBJECTIVES[design.objective];
  const difficulty = DIFFICULTIES[design.difficulty] ?? DIFFICULTIES.trade;
  const random = rng(seed);

  const slots = Object.values(design.slots ?? {});
  const ctx = {
    r,
    antennas: slots.filter((id) => id?.startsWith('antenna_')).length,
    hasAdcs: slots.some((id) => id?.startsWith('adcs_')),
    stations: design.station?.count ?? 0,
  };

  // How many events: the study level sets the base; open review items add more.
  const count = Math.min(DECK.length, difficulty.events + (unmetCount(r) >= 3 ? 1 : 0));
  // Weighted draw without replacement: unsoftened events are three times as likely.
  const pool = DECK.map((e) => ({ e, soft: e.softened(ctx) }));
  const drawn = [];
  for (let i = 0; i < count; i++) {
    const weights = pool.map((p) => (p.soft ? 1 : 3));
    let pick = random() * weights.reduce((a, b) => a + b, 0);
    const index = weights.findIndex((w) => (pick -= w) < 0);
    drawn.push(...pool.splice(index, 1));
  }
  drawn.sort((a, b) => a.e.at - b.e.at);

  const fx = { sci: 1, down: 1, life: 1, cost: 0 };
  const events = drawn.map(({ e, soft }) => {
    const options = soft ? [] : e.options(ctx);
    const chosen = options.find((o) => o.id === choices[e.id]) ?? null;
    if (chosen) {
      fx.sci *= chosen.fx.sci ?? 1;
      fx.down *= chosen.fx.down ?? 1;
      fx.life *= chosen.fx.life ?? 1;
      fx.cost += chosen.fx.cost ?? 0;
    }
    return {
      id: e.id, at: e.at, title: e.title, softened: soft,
      text: soft ? e.calm : e.alarm, lesson: e.lesson,
      options: options.map(({ id, label }) => ({ id, label })),
      chosen: chosen?.id ?? null, result: chosen?.result ?? null,
    };
  });
  const pending = events.find((e) => !e.softened && !e.chosen) ?? null;

  // ---- Outcome
  const reachedOrbit = r.checks.find((c) => c.id === 'launch').status === 'green';
  const plannedYears = objective.mission_years;
  // How much of the time the spacecraft can actually run (Game balance): it needs power to
  // match its load, a battery to carry it through each eclipse, and a computer that can keep up.
  const share = (have, need) => (need > 0 ? Math.min(1, Math.max(0, have / need)) : 1);
  const powerShare = share(r.power.generatedW, r.power.loadW);
  const batteryShare = share(r.energy.usableWh / DOD, r.energy.eclipseWh);
  const softwareShare = r.software.capacity > 0 ? share(r.software.capacity, r.software.load) : 0;
  // Without enough battery the spacecraft blacks out in every eclipse and loses more time restarting.
  const blackout = (r.power.eclipseFraction + RESTART_SHARE) * (1 - batteryShare);
  const uptime = powerShare * Math.max(0, 1 - blackout) * softwareShare;
  const alive = reachedOrbit && uptime > 0;
  const lifeYears = alive ? Math.min(r.time.lifetimeYears, plannedYears) * fx.life : 0;
  const generatedGb = r.data.generatedGbDay * 365 * lifeYears * fx.sci * uptime;
  const capacityGb = r.comms.capacityGbDay * 365 * lifeYears * fx.down;
  const returnedGb = Math.min(generatedGb, capacityGb);
  const dataReq = objective.requirements.find((q) => q.metric === 'downlink_gb_day');
  const targetGb = (dataReq?.value ?? 0) * 365 * plannedYears;
  const instrumentOk = r.checks.find((c) => c.id === 'instrument').status === 'green';
  const totalCost = r.budget.totalCost + fx.cost;
  const reserve = r.budget.costCap > 0 ? (r.budget.costCap - totalCost) / r.budget.costCap : -1;

  // ---- Scores, 0 to 100
  const scienceShare = instrumentOk && targetGb > 0 ? Math.min(1, returnedGb / targetGb) : 0;
  const hard = events.filter((e) => !e.softened).length;
  const marginIds = ['mass', 'power', 'energy', 'software', 'link'];
  const marginsUnmet = r.checks.filter((c) => marginIds.includes(c.id) && c.status !== 'green').length;
  const oversized = r.checks.filter((c) => marginIds.includes(c.id) && Number.isFinite(c.amount) && c.amount > c.target * 5).length;
  const clamp = (x) => Math.round(Math.min(100, Math.max(0, x)));
  const team = playerCount(design) > 1;
  const cards = cardsFor(r);
  const cardsMet = cards.filter((c) => c.met).length;
  const scores = {
    // In orbit and running, 30; no hard events, 20; full planned life, 20; the science goal, 30.
    // A spacecraft that reaches orbit but cannot switch on scores 15.
    success: clamp(!reachedOrbit ? 0 : !alive ? 15 : 30 + 20 * (1 - hard / Math.max(events.length, 1)) + 20 * (lifeYears / plannedYears) + 30 * scienceShare),
    science: clamp(100 * scienceShare),
    efficiency: clamp(100 - 15 * marginsUnmet - 6 * oversized - (reserve < 0.1 ? 20 : 0)),
    decisions: clamp(10 * r.greens - (r.reviewPass ? 0 : 20)),
    // Team play: 20 points per priority card met, 20 for passing the review.
    robustness: team ? clamp(20 * cardsMet + (r.reviewPass ? 20 : 0)) : clamp((ctx.antennas >= 2 ? 30 : 0) + (ctx.stations >= 2 ? 30 : 0) + (events.length ? 40 * (1 - hard / events.length) : 40)),
  };
  // A mission that returns no science cannot grade above D, however tidy the design.
  const weighted = Math.round(Object.entries(WEIGHTS).reduce((acc, [k, w]) => acc + scores[k] * w, 0));
  const total = scores.science === 0 ? Math.min(weighted, NO_SCIENCE_CAP) : weighted;
  const grade = total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 55 ? 'C' : total >= 40 ? 'D' : 'E';

  // ---- Cause chain: why each category scored what it did
  const reason = (id) => r.reasons.find((x) => x.id === id);
  const chain = [];
  const say = (key, why, fix) => chain.push({ key, label: key === 'robustness' ? lastLabel(team) : LABELS[key], score: scores[key], why, fix });
  // The first thing that stops the spacecraft running, if anything does
  const stall = powerShare < 1 ? 'power' : softwareShare < 1 ? 'software' : batteryShare < 1 ? 'energy' : null;
  const stallWhy = { power: 'the solar panels make less power than the parts use', software: r.software.capacity > 0 ? 'the flight computer cannot keep up with its tasks' : 'there is no flight computer on board', energy: 'the battery cannot carry it through the dark part of each orbit' }[stall];
  if (!reachedOrbit) {
    say('success', reason('launch')?.why ?? 'The spacecraft could not be launched.', reason('launch')?.fix ?? '');
  } else if (!alive) {
    say('success', `The spacecraft reached orbit but never ran, because ${stallWhy}.`, reason(stall)?.fix ?? '');
  } else if (scores.success < 100) {
    const lost = events.filter((e) => !e.softened);
    say('success', lost.length ? `${lost.map((e) => e.title).join(' and ')}, and the design had nothing to absorb it.` : `The orbit only lasts ${r.time.lifetimeYears} years of the ${plannedYears} planned.`,
      lost.length ? lost.map((e) => e.lesson).join(' ') : 'Choose a higher orbit.');
  }
  if (scores.science < 100) {
    const capNote = scores.science === 0 ? ' With no science returned, the grade cannot be higher than D.' : '';
    if (!instrumentOk) say('science', reason('instrument').why + capNote, reason('instrument').fix);
    else if (uptime < 1 && capacityGb >= generatedGb) {
      say('science', `You returned ${returnedGb.toFixed(1)} of the ${targetGb.toFixed(1)} GB the mission needed, because the instrument could run only ${Math.round(uptime * 100)}% of the time: ${stallWhy}.${capNote}`, reason(stall)?.fix ?? '');
    } else {
      const limited = capacityGb < generatedGb;
      say('science', `You returned ${returnedGb.toFixed(1)} of the ${targetGb.toFixed(1)} GB the mission needed${limited ? `, because only ${(r.comms.capacityGbDay * fx.down).toFixed(3)} GB a day could be sent down` : fx.sci < 1 ? ', because in-flight problems cut the time the instrument could run' : `, because the mission ran ${lifeYears.toFixed(1)} of ${plannedYears} years`}.`,
        limited ? reason('downlink')?.fix ?? 'Use a faster antenna or add a ground station.' : 'Build in the margins that soften in-flight events.');
      if (capNote) chain[chain.length - 1].why += capNote;
    }
  }
  if (scores.efficiency < 100) {
    const worst = r.reasons.find((x) => marginIds.includes(x.id)) ?? reason('budget');
    say('efficiency', worst ? worst.why : 'Some margins are far larger than needed, which wastes mass and money.', worst ? worst.fix : 'Trim oversized parts.');
  }
  if (scores.decisions < 100) {
    say('decisions', r.reviewPass ? `${unmetCount(r)} review ${unmetCount(r) === 1 ? 'check was' : 'checks were'} still open at launch.` : 'You launched without passing the design review.', 'Close every review item before launch.');
  }
  if (team && scores.robustness < 100) {
    const missed = cards.filter((c) => !c.met).map((c) => c.name);
    say('robustness', missed.length ? `${missed.join(' and ')} did not meet ${missed.length === 1 ? 'a priority card' : 'their priority cards'}${r.reviewPass ? '' : ', and the design launched without passing review'}.` : 'Every priority card was met, but the design launched without passing review.',
      'Trade between the roles until every card is met, then pass the review.');
  } else if (scores.robustness < 100) {
    say('robustness', ctx.antennas < 2 && ctx.stations < 2 ? 'There was a single antenna and a single ground station, so any one failure cut the link.' : 'One part of the link still had no backup.', 'Add a second antenna and a second ground station.');
  }

  return {
    seed, events, pending, scores, total, grade, chain, team, cards,
    outcome: { reachedOrbit, alive, uptime, lifeYears, plannedYears, returnedGb, targetGb, totalCost, reserve },
    requirements: r.requirements.map((q) => {
      if (q.metric === 'downlink_gb_day') return { ...q, met: instrumentOk && returnedGb >= targetGb * 0.999, actual: lifeYears > 0 ? returnedGb / (365 * plannedYears) : 0 };
      if (q.metric === 'lifetime_years') return { ...q, met: lifeYears >= q.value * 0.999, actual: lifeYears };
      if (q.metric === 'budget_reserve') return { ...q, met: reserve >= q.value, actual: reserve };
      return q;
    }),
    evaluation: r,
  };
}

/** Share code: the design and seed packed into a URL-safe string. */
export function encodeShare(design, seed) {
  return btoa(JSON.stringify({ d: design, s: seed })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeShare(code) {
  try {
    const { d, s } = JSON.parse(atob(code.replace(/-/g, '+').replace(/_/g, '/')));
    if (!d || typeof d !== 'object' || !OBJECTIVES[d.objective] || typeof d.slots !== 'object') return null;
    return { design: d, seed: Number(s) >>> 0 };
  } catch {
    return null;
  }
}
