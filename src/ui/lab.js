// Stage 2, Design Lab (CML 2 to 4): part catalog, resource dashboard, CML meter, snapshots.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
import { h } from './dom.js';
import { chip, CML_NAMES, LEARN, money, nextStep, rate, soundToggle, status } from './kit.js';
import { playerCount, rolesOf, seatOf, tabOwner } from '../sim/roles.js';
import { homeSlot, store } from '../state.js';
import { DIFFICULTIES, fitProblem, OBJECTIVES, PARTS } from '../sim/evaluate.js';
import catalog from '../data/parts.json' with { type: 'json' };

// The catalog follows NASA's four mission segments (Design and Develop Science Missions).
const TABS = [
  { id: 'bus', label: 'Structure', segment: 'Space segment' },
  { id: 'solar', label: 'Power', segment: 'Space segment' },
  { id: 'antenna', label: 'Comms', segment: 'Space segment' },
  { id: 'computer', label: 'Computer', segment: 'Space segment' },
  { id: 'adcs', label: 'Attitude', segment: 'Space segment' },
  { id: 'instrument', label: 'Instrument', segment: 'Space segment' },
  { id: 'ground', label: 'Stations', segment: 'Ground segment' },
  { id: 'orbit', label: 'Orbit', segment: 'Launch segment' },
];
const FACE_NAMES = { face_px: 'Side +X', face_nx: 'Side −X', face_py: 'Sun side', face_py2: 'Sun side, 2nd' };
const INTERNAL_TABS = new Set(['computer', 'adcs']);

let tab = 'bus';
let openLearn = null;
export const currentTab = () => tab;

const spec = (label, value) => h('div', { class: 'spec' }, h('dt', {}, label), h('dd', {}, value));

function keyStats(p) {
  switch (p.category) {
    case 'bus':
      return [spec('Mass limit', `${p.max_mass_kg} kg`), spec('Launch', money(p.launch_cost_usd))];
    case 'solar':
      return [spec('Cell area', `${Math.round(p.area_m2 * 1e4)} cm²`), spec('Tracks Sun', p.tracking ? 'Yes' : 'No')];
    case 'battery':
      return [spec('Stores', `${p.capacity_wh} Wh`)];
    case 'computer':
      return [spec('Capacity', `${p.capacity} units`)];
    case 'adcs':
      return [spec('Pointing', p.pointing === 'fine' ? 'Fine' : 'Coarse'), spec('Software', `${p.cpu_load} units`)];
    case 'antenna':
      return [spec('Data rate', rate(p.rate_bps)), spec('Gain', `${p.gain_dbi} dBi`)];
    case 'instrument':
      return [spec('Makes', `${((p.data_rate_bps * p.duty * 86400) / 8e9).toFixed(3)} GB/day`), spec('Software', `${p.cpu_load} units`)];
    default:
      return [];
  }
}

function partCard(p, { selected, problem, onpick, slot = null }) {
  const sources = Object.entries(p.sources ?? {}).map(([field, src]) => chip(`${field.replace(/_(kg|usd)$/, '').replace(/_/g, ' ')}: ${src}`));
  return h(
    'button',
    {
      class: `part${selected ? ' is-selected' : ''}`,
      type: 'button',
      'aria-pressed': String(selected),
      'aria-disabled': problem ? 'true' : null,
      'data-key': `part-${p.id}`,
      'data-slot': problem ? null : slot,
      'data-part': problem ? null : p.id,
      onclick: problem ? null : onpick,
    },
    h('span', { class: 'part__name' }, p.name, selected ? h('span', { class: 'part__fitted' }, 'Fitted') : null),
    h('span', { class: 'part__blurb' }, problem ?? p.blurb),
    problem
      ? null
      : h(
          'dl',
          { class: 'part__specs' },
          spec('Mass', `${p.mass_kg} kg`),
          p.power_w ? spec('Draws', `${p.power_w} W`) : null,
          spec('Cost', money(p.cost_usd)),
          ...keyStats(p),
          spec('TRL', String(p.trl)),
        ),
    problem ? null : h('span', { class: 'part__chips' }, chip(p.source), ...sources),
  );
}

function catalogBody(d) {
  const of = (category) => catalog.parts.filter((p) => p.category === category);
  const cards = (category) =>
    of(category).map((p) => {
      const slot = homeSlot(p);
      let problem = fitProblem(p.id, slot, d.bus);
      if (!problem && p.category === 'instrument' && !p.objectives.includes(d.objective)) {
        problem = `Not suited to this objective (${OBJECTIVES[d.objective].name.toLowerCase()}).`;
      }
      return partCard(p, { selected: d.slots[slot] === p.id, problem, slot, onpick: () => store.toggle(p.id) });
    });

  if (tab === 'bus') {
    return of('bus').map((p) => partCard(p, { selected: d.bus === p.id, onpick: () => store.setBus(p.id) }));
  }
  if (tab === 'solar') {
    const faces = PARTS[d.bus].slots.filter((s) => s.startsWith('face_'));
    const choices = of('solar').filter((p) => !p.fits || p.fits.includes(d.bus));
    const rows = faces.map((slot) =>
      h(
        'div',
        { class: 'face', role: 'group', 'aria-label': FACE_NAMES[slot], 'data-slot': slot },
        h('span', { class: 'face__name' }, FACE_NAMES[slot]),
        h(
          'div',
          { class: 'seg' },
          h('button', { type: 'button', 'aria-pressed': String(!d.slots[slot]), 'data-key': `${slot}-none`, onclick: () => store.setSlot(slot, null) }, 'Bare'),
          ...choices
            .filter((p) => p.slots.includes(slot))
            .map((p) =>
              h(
                'button',
                { type: 'button', 'aria-pressed': String(d.slots[slot] === p.id), 'data-key': `${slot}-${p.id}`, onclick: () => store.setSlot(slot, p.id) },
                p.tracking ? 'Wing' : 'Panel',
              ),
            ),
        ),
      ),
    );
    const legend = choices.map((p) =>
      h('div', { class: 'part part--static' }, h('span', { class: 'part__name' }, p.tracking ? 'Wing' : 'Panel', h('span', { class: 'part__fitted' }, p.name)),
        h('span', { class: 'part__blurb' }, p.blurb),
        h('dl', { class: 'part__specs' }, spec('Mass', `${p.mass_kg} kg`), spec('Cost', money(p.cost_usd)), ...keyStats(p), spec('TRL', String(p.trl))),
        h('span', { class: 'part__chips' }, chip(p.source))),
    );
    return [h('h3', { class: 'stencil' }, 'Solar panels, by face'), ...rows, ...legend, h('h3', { class: 'stencil' }, 'Battery'), ...cards('battery')];
  }
  if (tab === 'ground') {
    return [
      ...catalog.stations.map((s) =>
        h(
          'button',
          { class: `part${d.station.id === s.id ? ' is-selected' : ''}`, type: 'button', 'aria-pressed': String(d.station.id === s.id), 'data-key': `gs-${s.id}`, onclick: () => store.setStation(s.id, d.station.count) },
          h('span', { class: 'part__name' }, s.name, d.station.id === s.id ? h('span', { class: 'part__fitted' }, 'Chosen') : null),
          h('span', { class: 'part__blurb' }, s.blurb),
          h('dl', { class: 'part__specs' }, spec('Cost', `${money(s.cost_usd_per_year)}/yr each`), spec('Hears', Object.keys(s.gain_dbi).map((b) => (b === 's' ? 'S-band' : 'UHF')).join(', '))),
          h('span', { class: 'part__chips' }, chip(s.source)),
        ),
      ),
      h(
        'div',
        { class: 'face', role: 'group', 'aria-label': 'Number of stations' },
        h('span', { class: 'face__name' }, 'How many stations'),
        h(
          'div',
          { class: 'seg' },
          ...[1, 2, 3].map((n) => h('button', { type: 'button', 'aria-pressed': String(d.station.count === n), 'data-key': `gs-n${n}`, onclick: () => store.setStation(d.station.id, n) }, String(n))),
        ),
      ),
      h('p', { class: 'note' }, chip('NASA: CubeSat 101'), ' An inadequate ground station is a known mission killer. More stations mean more passes a day and a backup.'),
    ];
  }
  if (tab === 'orbit') {
    return [
      ...catalog.orbits.map((o) =>
        h(
          'button',
          { class: `part${d.orbit === o.id ? ' is-selected' : ''}`, type: 'button', 'aria-pressed': String(d.orbit === o.id), 'data-key': `orbit-${o.id}`, onclick: () => store.setOrbit(o.id) },
          h('span', { class: 'part__name' }, `${o.name} circular`, d.orbit === o.id ? h('span', { class: 'part__fitted' }, 'Chosen') : null),
          h('span', { class: 'part__blurb' }, o.blurb),
          h('dl', { class: 'part__specs' }, spec('Stays up', `${o.lifetime_years} yr`), spec('Passes', `${o.passes_per_day}/day`), spec('Pass', `${o.pass_seconds / 60} min`)),
          h('span', { class: 'part__chips' }, chip(o.source)),
        ),
      ),
      h('p', { class: 'note' }, 'Launch: a shared ride in a standard deployer. ', chip('NASA: CubeSat 101'), ' The price depends on the structure size.'),
    ];
  }
  return cards(tab);
}

function meter(result, reviewOpen) {
  return h(
    'div',
    { class: `meter${store.cmlRaised ? ' is-raised' : ''}`, role: 'group', 'aria-label': `Concept maturity level ${result.cml} of 4` },
    h('span', { class: 'stencil' }, 'Maturity'),
    h(
      'ol',
      { class: 'meter__steps' },
      ...[1, 2, 3, 4].map((n) =>
        h('li', { class: n <= result.cml ? 'is-lit' : null, 'aria-current': n === result.cml ? 'step' : null }, h('span', { class: 'meter__n' }, `CML ${n}`), h('span', { class: 'meter__name' }, CML_NAMES[n])),
      ),
    ),
    h('p', { class: 'meter__next', 'aria-live': 'polite' }, nextStep(result, reviewOpen)),
    chip('NASA: JPL CML'),
  );
}

function dashboard(result) {
  const row = (c) => {
    const hasBar = typeof c.amount === 'number';
    // The threshold sits at the middle of the bar; twice the threshold fills it.
    const fill = hasBar ? Math.min(Math.max(c.amount / (c.target * 2), 0), 1) : 0;
    const open = openLearn === c.id;
    return h(
      'li',
      { class: `gauge gauge--${c.status}` },
      h(
        'div',
        { class: 'gauge__top' },
        h('span', { class: 'gauge__label' }, c.label),
        h('button', { class: 'gauge__why', type: 'button', 'aria-expanded': String(open), 'aria-label': `What is ${c.label.toLowerCase()}?`, 'data-key': `why-${c.id}`, onclick: () => { openLearn = open ? null : c.id; store.refresh(); } }, '?'),
        status(c.status),
      ),
      hasBar ? h('div', { class: 'gauge__bar', 'aria-hidden': 'true' }, h('span', { class: 'gauge__fill', style: `width:${(fill * 100).toFixed(1)}%` }), h('span', { class: 'gauge__mark' })) : null,
      h('div', { class: 'gauge__nums' }, h('span', {}, c.value), h('span', { class: 'gauge__need' }, `need ${c.need}`, chip(c.source))),
      open ? h('p', { class: 'gauge__learn' }, LEARN[c.id]) : null,
    );
  };
  return h('ul', { class: 'gauges' }, ...result.checks.map(row));
}

function compareDialog() {
  const snaps = Object.entries(store.snapshots).filter(([, s]) => s);
  const rows = [
    ['Mass', (r) => `${r.mass.kg.toFixed(2)} kg`],
    ['Power margin', (r) => (Number.isFinite(r.power.margin) ? `${Math.round(r.power.margin * 100)}%` : 'none')],
    ['Link margin', (r) => (Number.isFinite(r.comms.marginDb) ? `${r.comms.marginDb.toFixed(1)} dB` : 'no link')],
    ['Data returned', (r) => `${r.data.downlinkGbDay.toFixed(3)} GB/day`],
    ['Total cost', (r) => money(r.budget.totalCost)],
    ['Build time', (r) => `${r.time.buildMonths} months`],
    ['Review checks met', (r) => `${r.greens} of 10`],
  ];
  const dialog = h(
    'dialog',
    { class: 'credits compare', 'aria-labelledby': 'cmp-h' },
    h('h2', { id: 'cmp-h' }, 'Compare saved designs'),
    h(
      'table',
      { class: 'reqs' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), ...snaps.map(([k]) => h('th', { scope: 'col' }, `Design ${k}`)))),
      h('tbody', {}, ...rows.map(([label, f]) => h('tr', {}, h('th', { scope: 'row' }, label), ...snaps.map(([, s]) => h('td', {}, f(s.result)))))),
    ),
    h('p', { class: 'note' }, 'Comparing options before choosing one is the "Trade Space" step, CML 3. ', chip('NASA: JPL CML')),
    h(
      'div',
      { class: 'compare__actions' },
      ...snaps.map(([k]) => h('button', { class: 'btn', type: 'button', onclick: () => { dialog.close(); store.loadSnapshot(k); } }, `Continue with ${k}`)),
      h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Close'),
    ),
  );
  dialog.addEventListener('close', () => { dialog.remove(); store.markCompared(); });
  document.body.append(dialog);
  dialog.showModal();
}

/** Hot-seat strip: who is at the controls, and that player's priority cards. */
function seatStrip(players, r) {
  const mine = rolesOf(players, store.seat);
  return h(
    'div',
    { class: 'lab__seat panel', role: 'group', 'aria-label': 'Players' },
    h('div', { class: 'seat__who' }, h('span', { class: 'stencil' }, 'At the controls'),
      h('div', { class: 'seg' }, ...Array.from({ length: players }, (_, i) => h('button', { type: 'button', 'aria-pressed': String(store.seat === i), 'data-key': `seat-${i}`, onclick: () => store.setSeat(i) }, `Player ${i + 1}`)))),
    h(
      'ul',
      { class: 'seat__cards' },
      ...mine.map((role) => h('li', {}, status(role.met(r) ? 'green' : 'red', role.met(r) ? 'Met' : 'Not yet'), h('span', {}, h('strong', {}, `${role.name}. `), role.card))),
    ),
  );
}

export function renderLab(game) {
  const d = store.design;
  const r = store.result;
  const players = playerCount(d);
  const team = players > 1;
  if (store.seat >= players) store.seat = 0;
  const owner = tabOwner(tab);
  const locked = team && owner && seatOf(players, owner.id) !== store.seat;
  const leadSeat = seatOf(players, 'lead');
  const notLead = team && leadSeat !== store.seat;
  const objective = OBJECTIVES[d.objective];
  const reviewOpen = r.cml >= 4 || !DIFFICULTIES[d.difficulty].review_required;
  const saved = Object.values(store.snapshots).filter(Boolean).length;
  game.setXray(INTERNAL_TABS.has(tab));

  let segment = null;
  const nav = TABS.flatMap((t) => {
    const head = t.segment !== segment ? [h('span', { class: 'stencil catalog__seg' }, (segment = t.segment))] : [];
    const other = team && seatOf(players, tabOwner(t.id).id) !== store.seat;
    return [...head, h('button', { type: 'button', role: 'tab', class: other ? 'is-other' : null, title: other ? `${tabOwner(t.id).name}, Player ${seatOf(players, tabOwner(t.id).id) + 1}` : null, 'aria-selected': String(tab === t.id), 'data-key': `tab-${t.id}`, onclick: () => { tab = t.id; store.refresh(); } }, t.label)];
  });

  return h(
    'section',
    { class: 'lab', 'aria-label': 'Design Lab' },
    h(
      'header',
      { class: 'lab__top panel' },
      h('div', { class: 'lab__brief' }, h('span', { class: 'stencil' }, 'Stage 2 of 3 / Design Lab'), h('strong', {}, objective.name)),
      meter(r, reviewOpen),
    ),
    h(
      'aside',
      { class: 'lab__catalog panel', 'aria-label': 'Part catalog' },
      h('nav', { class: 'catalog__tabs', role: 'tablist', 'aria-orientation': 'vertical' }, ...nav),
      h(
        'div',
        { class: 'catalog__body', role: 'tabpanel' },
        locked ? h('p', { class: 'catalog__lock' }, h('strong', {}, `This is the ${owner.name}'s call. `), `Pass the controls to Player ${seatOf(players, owner.id) + 1} to change it.`) : null,
        h('div', { class: `catalog__items${locked ? ' is-locked' : ''}`, inert: locked ? '' : null }, ...catalogBody(d)),
      ),
    ),
    h(
      'aside',
      { class: 'lab__dash panel', 'aria-label': 'Resources' },
      h('div', { class: 'dash__head' }, h('span', { class: 'stencil' }, 'Resources against NASA thresholds'), h('span', { class: 'dash__count' }, `${r.greens} of 10 met`)),
      dashboard(r),
      h(
        'div',
        { class: 'dash__snaps' },
        h('span', { class: 'stencil' }, 'Save as'),
        h('div', { class: 'seg' }, ...['A', 'B', 'C'].map((k) => h('button', { type: 'button', class: store.snapshots[k] ? 'has-snap' : null, disabled: notLead, 'data-key': `snap-${k}`, onclick: () => store.saveSnapshot(k) }, k))),
        h('button', { class: 'btn btn--small', type: 'button', disabled: saved < 2 || notLead, 'data-key': 'compare', onclick: compareDialog }, saved < 2 ? `Compare (save ${2 - saved} more)` : 'Compare designs'),
      ),
      h('button', { class: 'btn btn--primary btn--wide', type: 'button', disabled: !reviewOpen || notLead, 'data-key': 'review', onclick: () => game.go('review') }, 'Request design review'),
      notLead ? h('p', { class: 'note' }, `The Mission Lead (Player ${leadSeat + 1}) saves designs and requests the review.`) : reviewOpen ? null : h('p', { class: 'note' }, 'Opens at CML 4.'),
    ),
    team ? seatStrip(players, r) : null,
    soundToggle('lab__sound'),
    h('p', { class: 'lab__hint stencil' }, 'Drag to turn / Scroll to zoom'),
    h('button', { class: 'btn btn--small lab__back', type: 'button', onclick: () => game.go('briefing') }, 'Back to briefing'),
  );
}
