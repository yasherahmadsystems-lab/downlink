// Placeholder for stages that are not built yet. Removed as each stage lands.
// Written by Claude (AI) for Team AETHELGARD.
import { h } from './dom.js';

const NAMES = {
  briefing: 'Briefing',
  lab: 'Design Lab',
  review: 'Design Review',
  flight: 'Flight',
  report: 'Mission Report',
};

export function renderStub(game, state) {
  return h(
    'section',
    { class: 'stub' },
    h('span', { class: 'stencil' }, 'Not built yet'),
    h('h2', {}, NAMES[state] ?? state),
    h('p', {}, 'This stage is still on the bench. The build is in progress during the hackathon weekend.'),
    h('button', { class: 'btn', 'data-autofocus': true, onclick: () => game.go('title') }, 'Back to title'),
  );
}
