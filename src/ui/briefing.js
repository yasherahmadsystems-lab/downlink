// Stage 1, Briefing (CML 1): objective, difficulty, limits and requirements, before any design choice.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
import { h } from './dom.js';
import { chip, money } from './kit.js';
import { store } from '../state.js';
import { playerCount, rolesOf, ROLE_SOURCE } from '../sim/roles.js';
import scenarios from '../data/scenarios.json' with { type: 'json' };

export function renderBriefing(game) {
  const d = store.design;
  const objective = scenarios.objectives.find((o) => o.id === d.objective);
  const difficulty = scenarios.difficulties.find((x) => x.id === d.difficulty);
  const sandbox = !difficulty.review_required;
  const players = playerCount(d);
  const pick = (objectiveId, difficultyId) => {
    store.setBrief(objectiveId, difficultyId);
    game.go('briefing');
  };

  const option = (item, selected, onpick, group, key) =>
    h(
      'label',
      { class: `option${selected ? ' is-selected' : ''}` },
      h('input', { type: 'radio', name: group, checked: selected, 'data-key': key, onchange: onpick }),
      h('span', { class: 'option__name' }, item.name),
      h('span', { class: 'option__text' }, item.summary ?? item.rules),
    );

  return h(
    'section',
    { class: 'sheet', 'aria-labelledby': 'brief-h' },
    h(
      'header',
      { class: 'sheet__head' },
      h('span', { class: 'stencil' }, 'Stage 1 of 3 / Briefing'),
      h('h1', { id: 'brief-h' }, 'Choose the mission'),
      h('p', {}, 'Pick what the spacecraft is for. The objective sets the limits you design against.'),
    ),
    h(
      'div',
      { class: 'sheet__body' },
      h(
        'fieldset',
        { class: 'options' },
        h('legend', { class: 'stencil' }, 'Science objective'),
        ...scenarios.objectives.map((o) => option(o, o.id === d.objective, () => pick(o.id, d.difficulty), 'objective', `obj-${o.id}`)),
      ),
      h(
        'fieldset',
        { class: 'options options--row' },
        h('legend', { class: 'stencil' }, 'Study level'),
        ...scenarios.difficulties.map((x) => option(x, x.id === d.difficulty, () => pick(d.objective, x.id), 'difficulty', `dif-${x.id}`)),
      ),
      h(
        'fieldset',
        { class: 'options crew' },
        h('legend', { class: 'stencil' }, 'Players at this screen'),
        h('div', { class: 'seg' }, ...[1, 2, 3, 4].map((n) => h('button', { type: 'button', 'aria-pressed': String(players === n), 'data-key': `players-${n}`, onclick: () => store.setPlayers(n) }, String(n)))),
        players === 1
          ? h('p', { class: 'note' }, 'Solo: you make every call.')
          : h(
              'ul',
              { class: 'crew__list' },
              ...Array.from({ length: players }, (_, i) => h('li', {}, h('strong', {}, `Player ${i + 1}`), rolesOf(players, i).map((r) => r.name).join(' and '))),
            ),
        players === 1 ? null : h('p', { class: 'note' }, 'Each role owns part of the Design Lab and holds a priority card. The cards pull against each other, so you have to trade. ', chip(ROLE_SOURCE)),
      ),
      h(
        'div',
        { class: 'limits' },
        h('div', {}, h('span', { class: 'stencil' }, 'Cost cap'), h('strong', {}, sandbox ? 'None' : money(objective.cost_cap_usd * difficulty.budget_scale))),
        h('div', {}, h('span', { class: 'stencil' }, 'Ready to launch in'), h('strong', {}, `${objective.schedule_months} months`)),
        h('div', {}, h('span', { class: 'stencil' }, 'Mission length'), h('strong', {}, `${objective.mission_years} ${objective.mission_years === 1 ? 'year' : 'years'}`)),
        h('div', {}, h('span', { class: 'stencil' }, 'Class'), h('strong', {}, 'CubeSat, low Earth orbit')),
      ),
      h(
        'table',
        { class: 'reqs' },
        h('caption', { class: 'stencil' }, 'Mission requirements, and how each will be checked'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'The mission shall'), h('th', { scope: 'col' }, 'Verified by'))),
        h('tbody', {}, ...objective.requirements.map((r) => h('tr', {}, h('td', {}, r.text), h('td', {}, r.verify)))),
      ),
      h('p', { class: 'note' }, chip('NASA: Design and Develop Science Missions'), ' Requirements come first and each one names its check. The mission report grades you against this list. ', chip('Study levels: NASA Mission Design Lab'), ' ', chip('Cost cap and dates: Game balance')),
    ),
    h(
      'footer',
      { class: 'sheet__foot' },
      h('button', { class: 'btn', onclick: () => game.go('title') }, 'Back'),
      h('button', { class: 'btn btn--primary', 'data-autofocus': true, 'data-key': 'open-lab', onclick: () => game.go('lab') }, 'Open the Design Lab'),
    ),
  );
}
