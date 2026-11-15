// Review Gate: a NASA-style design review. Ten checks; pass at 80% green.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
import { h } from './dom.js';
import { chip, status } from './kit.js';
import { store } from '../state.js';

export function renderReview(game) {
  const r = store.result;
  const why = Object.fromEntries(r.reasons.map((x) => [x.id, x]));
  const open = r.checks.length - r.greens;

  return h(
    'section',
    { class: 'sheet sheet--wide review', 'aria-labelledby': 'rev-h', style: `--n:${r.checks.length}` },
    h(
      'header',
      { class: 'sheet__head' },
      h('span', { class: 'stencil' }, 'Design review'),
      h('h1', { id: 'rev-h' }, r.reviewPass ? 'Review passed' : 'Review not passed'),
      h(
        'p',
        {},
        `${r.greens} of ${r.checks.length} checks are met. A review passes at 8 or more. `,
        chip('NASA: JPL CML'),
      ),
    ),
    h(
      'ol',
      { class: 'sheet__body checks' },
      ...r.checks.map((c, i) =>
        h(
          'li',
          { class: `check check--${c.status}`, style: `--i:${i}` },
          status(c.status),
          h('div', { class: 'check__main' }, h('strong', {}, c.label), h('span', { class: 'check__nums' }, `${c.value} (need ${c.need})`), chip(c.source)),
          why[c.id] ? h('p', { class: 'check__why' }, why[c.id].why, ' ', h('em', {}, why[c.id].fix)) : null,
        ),
      ),
    ),
    h(
      'footer',
      { class: 'sheet__foot' },
      h('button', { class: `btn${r.reviewPass ? '' : ' btn--primary'}`, 'data-autofocus': r.reviewPass ? null : true, onclick: () => game.go('lab') }, 'Back to the Design Lab'),
      h('button', { class: `btn${r.reviewPass ? ' btn--primary' : ''}`, 'data-autofocus': r.reviewPass ? true : null, onclick: () => game.go('flight') }, r.reviewPass ? 'Go for launch' : 'Launch anyway'),
      open > 0 ? h('p', { class: 'note' }, `Every check that is not met raises the chance of trouble in flight. ${open} ${open === 1 ? 'is' : 'are'} open.`) : null,
    ),
  );
}
