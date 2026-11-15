// Mission report: score, requirement check, the "why" cause chain, real missions,
// share code and a local leaderboard.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
import { h } from './dom.js';
import { chip, money, status } from './kit.js';
import { encodeShare, lastLabel, WEIGHTS } from '../sim/flight.js';
import { playerCount, ROLE_SOURCE, seatOf } from '../sim/roles.js';
import { OBJECTIVES } from '../sim/evaluate.js';
import { store } from '../state.js';

const LABELS = { success: 'Mission success', science: 'Science value', efficiency: 'Resource efficiency', decisions: 'Decision quality', robustness: 'Robustness' };
const BOARD_KEY = 'smdg.leaderboard.v1';

function readBoard() {
  try {
    const list = JSON.parse(localStorage.getItem(BOARD_KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Records a finished flight once and returns the top five. */
export function recordScore(run, design) {
  const entry = { id: `${run.seed}:${encodeShare(design, run.seed).slice(-12)}`, total: run.total, grade: run.grade, objective: design.objective, when: new Date().toISOString().slice(0, 10) };
  const board = readBoard().filter((e) => e.id !== entry.id);
  board.push(entry);
  board.sort((a, b) => b.total - a.total);
  const top = board.slice(0, 5);
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(top));
  } catch {
    // Private windows may refuse storage; the report still works without it.
  }
  return { top, entry };
}

/** Counts a number up from zero the first time the report is shown. */
function countUp(el, value, animate, delayMs, suffix = '') {
  if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return el;
  const DURATION = 700;
  el.textContent = `0${suffix}`;
  const begin = performance.now() + delayMs;
  const step = (now) => {
    if (!el.isConnected && now > begin + 50) return; // the screen was replaced
    const t = Math.min(1, Math.max(0, (now - begin) / DURATION));
    el.textContent = `${Math.round(value * (1 - (1 - t) ** 3))}${suffix}`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return el;
}

export function renderReport(game) {
  const run = game.run;
  const design = store.design;
  const objective = OBJECTIVES[design.objective];
  const { top, entry } = game.board;
  const link = `${location.origin}${location.pathname}#m=${encodeShare(design, run.seed)}`;
  const o = run.outcome;

  const copied = h('span', { class: 'note', role: 'status' }, '');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      copied.textContent = 'Link copied.';
    } catch {
      copied.textContent = link;
    }
  };

  return h(
    'section',
    { class: 'sheet sheet--report', 'aria-labelledby': 'rep-h' },
    h(
      'header',
      { class: 'sheet__head report__head' },
      h('div', {}, h('span', { class: 'stencil' }, `Mission report / ${objective.name}`), h('h1', { id: 'rep-h' }, o.reachedOrbit ? 'Mission complete' : 'Mission did not launch')),
      h('div', { class: 'grade', 'aria-label': `Grade ${run.grade}, ${run.total} out of 100` }, h('strong', {}, run.grade), countUp(h('span', {}, `${run.total} / 100`), run.total, game.entering, 350 + 5 * 140, ' / 100')),
    ),
    h(
      'div',
      { class: 'sheet__body report' },
      h(
        'ul',
        { class: 'scores' },
        ...Object.keys(WEIGHTS).map((k, i) =>
          h(
            'li',
            { style: `--i:${i}` },
            h('span', { class: 'scores__label' }, k === 'robustness' ? lastLabel(run.team) : LABELS[k], h('span', { class: 'stencil' }, `weight ${Math.round(WEIGHTS[k] * 100)}%`)),
            h('div', { class: 'gauge__bar', 'aria-hidden': 'true' }, h('span', { class: 'gauge__fill', style: `width:${run.scores[k]}%` })),
            countUp(h('strong', {}, String(run.scores[k])), run.scores[k], game.entering, 350 + i * 140),
          ),
        ),
      ),
      h(
        'div',
        {},
        h('h2', { class: 'stencil' }, 'Why you scored this ', chip('Score weights: Game balance')),
        run.chain.length
          ? h('ol', { class: 'chain' }, ...run.chain.map((c) => h('li', {}, h('strong', {}, `${c.label}, ${c.score}: `), c.why, ' ', h('em', {}, `Next time: ${c.fix}`))))
          : h('p', {}, 'Every category scored full marks. The design met its margins, passed review and absorbed what the flight threw at it.'),
      ),
      h(
        'table',
        { class: 'reqs' },
        h('caption', { class: 'stencil' }, 'Mission requirements'),
        h('tbody', {}, ...run.requirements.map((q) => h('tr', {}, h('td', {}, status(q.met ? 'green' : 'red', q.met ? 'Met' : 'Missed')), h('td', {}, q.text)))),
      ),
      run.team
        ? h(
            'table',
            { class: 'reqs' },
            h('caption', { class: 'stencil' }, 'Priority cards ', chip(ROLE_SOURCE)),
            h('tbody', {}, ...run.cards.map((c) => h('tr', {}, h('td', {}, status(c.met ? 'green' : 'red', c.met ? 'Met' : 'Missed')), h('td', {}, h('strong', {}, `${c.name}, Player ${seatOf(playerCount(design), c.id) + 1}. `), c.card)))),
          )
        : null,
      h(
        'div',
        { class: 'limits' },
        h('div', {}, h('span', { class: 'stencil' }, 'Data returned'), h('strong', {}, `${o.returnedGb.toFixed(1)} GB`)),
        h('div', {}, h('span', { class: 'stencil' }, 'Time in service'), h('strong', {}, `${o.lifeYears.toFixed(1)} yr`)),
        h('div', {}, h('span', { class: 'stencil' }, 'Total cost'), h('strong', {}, money(o.totalCost))),
        h('div', {}, h('span', { class: 'stencil' }, 'Events met'), h('strong', {}, `${run.events.length}`)),
      ),
      objective.real_missions.length
        ? h(
            'div',
            {},
            h('h2', { class: 'stencil' }, 'Real missions like yours'),
            ...objective.real_missions.map((m) => h('p', {}, h('strong', {}, `${m.name}. `), m.note, ' ', chip('NASA'))),
          )
        : null,
      h(
        'div',
        {},
        h('h2', { class: 'stencil' }, 'Best flights on this computer'),
        h(
          'ol',
          { class: 'board' },
          ...top.map((e) => h('li', { class: e.id === entry.id ? 'is-you' : null }, h('strong', {}, `${e.grade} ${e.total}`), h('span', {}, OBJECTIVES[e.objective]?.name ?? e.objective), h('span', {}, e.id === entry.id ? 'This flight' : e.when))),
        ),
      ),
    ),
    h(
      'footer',
      { class: 'sheet__foot' },
      h('button', { class: 'btn btn--primary', 'data-autofocus': true, onclick: () => game.go('lab') }, 'Revise and refly'),
      h('button', { class: 'btn', onclick: copy }, 'Copy share link'),
      h('button', { class: 'btn', onclick: () => game.go('title') }, 'Title'),
      copied,
    ),
  );
}
