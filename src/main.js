// Entry point and game state machine.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026. See README for credits.
//
// title -> briefing -> lab -> review -> flight -> report (docs/PLAN.md §1)
import './ui/tokens.css';
import './ui/base.css';
import './ui/screens.css';
import { createRenderer, fitToCanvas, reducedMotion } from './scenes/renderer.js';
import { createHangar } from './scenes/hangar.js';
import { createPost } from './scenes/post.js';
import { createAssembly } from './scenes/assembly.js';
import { SHOWCASE, store } from './state.js';
import { renderTitle } from './ui/title.js';
import { renderBriefing } from './ui/briefing.js';
import { currentTab, renderLab } from './ui/lab.js';
import { renderReview } from './ui/review.js';
import { renderStub } from './ui/stub.js';
import { createOrbit } from './scenes/orbit.js';
import { createLaunch } from './scenes/launch.js';
import { createFlight } from './ui/flight.js';
import { recordScore, renderReport } from './ui/report.js';
import { decodeShare } from './sim/flight.js';
import { sound } from './audio.js';
import { createDemo } from './demo.js';

const REVIEW_LEAD_MS = 320; // matches --review-lead and --review-step in screens.css
const REVIEW_STEP_MS = 95;
const STATES = ['title', 'briefing', 'lab', 'review', 'flight', 'report'];
const SCREENS = { title: renderTitle, briefing: renderBriefing, lab: renderLab, review: renderReview, flight: () => flight.render(), report: renderReport };

const ui = document.getElementById('ui');
const canvas = document.getElementById('scene');
const renderer = createRenderer(canvas);
const hangar = createHangar(renderer);
fitToCanvas(renderer, hangar.camera);
const post = createPost(renderer, hangar.scene, hangar.camera);
const assembly = createAssembly(hangar.mount);
const orbit = createOrbit(renderer);
fitToCanvas(renderer, orbit.camera);
const launch = createLaunch(renderer);
fitToCanvas(renderer, launch.camera);

// Rebuild the 3D craft only when its parts actually changed.
let shownModel = '';
function showModel(design, changedSlot = null) {
  const signature = JSON.stringify([design.bus, design.slots]);
  if (signature === shownModel) return;
  shownModel = signature;
  assembly.sync(design, changedSlot).catch((err) => console.error('Could not build the spacecraft:', err));
}

let shownTab = null;
let shownState = null;
function render() {
  // Keep keyboard focus and scroll positions across re-renders.
  const focusKey = document.activeElement?.dataset?.key;
  const scroll = Object.fromEntries(['.catalog__body', '.gauges', '.sheet__body'].map((s) => [s, ui.querySelector(s)?.scrollTop ?? 0]));
  const sameTab = shownTab === currentTab();
  shownTab = currentTab();

  // "Entering" is true for the first render of a screen: entrance motion plays once, not on every refresh.
  game.entering = shownState !== game.state;
  shownState = game.state;
  ui.classList.toggle('is-entering', game.entering);
  assembly.hint(null);

  ui.replaceChildren((SCREENS[game.state] ?? ((g) => renderStub(g, game.state)))(game));

  for (const [selector, top] of Object.entries(scroll)) {
    const el = ui.querySelector(selector);
    if (el && (selector !== '.catalog__body' || sameTab)) el.scrollTop = top;
  }
  const target = (focusKey && ui.querySelector(`[data-key="${focusKey}"]`)) || ui.querySelector('[data-autofocus]');
  target?.focus({ preventScroll: true });
}

const game = {
  state: 'title',
  go(next) {
    if (!STATES.includes(next)) throw new Error(`Unknown state: ${next}`);
    const changed = next !== game.state;
    game.state = next;
    document.body.dataset.state = next;
    if (next !== 'title' && !store.result) store.commit();
    if (next !== 'lab') assembly.setXray(false);
    hangar.setView(next === 'report' ? 'review' : next);
    if (next === 'flight' && changed) {
      // A shared link replays its own seed once; otherwise every launch is a new flight.
      const seed = game.replaySeed ?? (Math.random() * 2 ** 32) >>> 0;
      game.replaySeed = null;
      flight.start(store.design, seed).catch((err) => console.error('Could not start the flight:', err));
    }
    if (changed && next === 'review') {
      // The checks are read out one by one, then the verdict lands
      const checks = store.result.checks.length;
      const verdict = store.result.reviewPass ? 'pass' : 'fail';
      if (reducedMotion()) sound.play(verdict);
      else {
        for (let i = 0; i < checks; i++) setTimeout(() => game.state === 'review' && sound.play('tick'), REVIEW_LEAD_MS + i * REVIEW_STEP_MS);
        setTimeout(() => game.state === 'review' && sound.play(verdict), REVIEW_LEAD_MS + checks * REVIEW_STEP_MS + 120);
      }
      assembly.redeploy();
    }
    if (changed && next === 'report') sound.play('report');
    showModel(next === 'title' ? SHOWCASE : store.design);
    if (changed) document.activeElement?.blur();
    render();
  },
  setXray: (on) => assembly.setXray(on),
  run: null,
  board: null,
  replaySeed: null,
  /** Called by the flight when the mission ends. */
  finish(run) {
    game.run = run;
    game.board = recordScore(run, store.design);
    game.go('report');
  },
};
const flight = createFlight(orbit, game, launch);

store.subscribe(() => {
  if (game.state === 'title') return;
  if (game.state === 'lab') {
    const slot = store.changedSlot;
    if (slot) sound.play(slot === 'bus' || store.design.slots[slot] ? 'fit' : 'remove');
    if (store.cmlRaised) sound.play('raise');
  }
  showModel(store.design, store.changedSlot);
  render();
});

// Pointing at a part in the catalog marks its place on the spacecraft.
const hintFrom = (el) => {
  const target = game.state === 'lab' ? el?.closest?.('[data-slot]') : null;
  assembly.hint(target?.dataset.slot ?? null, target?.dataset.part ?? null);
};
ui.addEventListener('pointerover', (e) => hintFrom(e.target));
ui.addEventListener('focusin', (e) => hintFrom(e.target));
ui.addEventListener('pointerleave', () => assembly.hint(null));
// A soft tick on navigation buttons and tabs (parts have their own fit and remove sounds)
ui.addEventListener('click', (e) => {
  if (e.target.closest?.('.btn, [role="tab"], .seg button') && !e.target.closest('.sound, .face')) sound.play('tick');
});

// Drag to turn the spacecraft and scroll to zoom, in the Design Lab only.
let dragX = null;
canvas.addEventListener('pointerdown', (e) => {
  if (game.state !== 'lab') return;
  dragX = e.clientX;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (dragX == null) return;
  hangar.rotateBy((e.clientX - dragX) * 0.008);
  dragX = e.clientX;
});
canvas.addEventListener('pointerup', () => (dragX = null));
canvas.addEventListener('pointercancel', () => (dragX = null));
canvas.addEventListener(
  'wheel',
  (e) => {
    if (game.state !== 'lab') return;
    e.preventDefault();
    hangar.zoomBy(e.deltaY * 0.0012);
  },
  { passive: false },
);
window.addEventListener('keydown', (e) => {
  if (game.state !== 'lab' || e.target.closest?.('input, dialog')) return;
  if (e.key === 'ArrowLeft') hangar.rotateBy(-0.2);
  if (e.key === 'ArrowRight') hangar.rotateBy(0.2);
});

let frozenAt = null; // seconds; set by the QA handle to get repeatable screenshots

let lastMs = 0;
renderer.setAnimationLoop((ms) => {
  const dt = Math.min((ms - lastMs) / 1000, 0.1);
  lastMs = ms;
  if (game.state === 'flight') {
    flight.update(dt);
    const view = flight.view;
    renderer.render(view.scene, view.camera);
    return;
  }
  hangar.update(frozenAt ?? ms / 1000, frozenAt == null && !reducedMotion());
  assembly.update(frozenAt != null ? 1e12 : performance.now());
  post.render(ms);
});

// A share link (#m=...) opens that design in the Lab, ready to refly with the same seed.
const shared = location.hash.startsWith('#m=') ? decodeShare(location.hash.slice(3)) : null;
if (shared) {
  store.design = shared.design;
  store.commit();
  game.replaySeed = shared.seed;
  history.replaceState(null, '', location.pathname);
  game.go('lab');
} else {
  game.go('title');
}

// ?demo plays the whole game once by itself, for recording the demo video.
const demo = createDemo({ game, store, ui });
game.demo = () => demo.run();
if (new URLSearchParams(location.search).has('demo')) demo.offer();

// Debug handle for the visual QA skill; stripped from production builds.
if (import.meta.env.DEV) {
  window.__game = {
    game,
    store,
    renderer,
    post,
    assembly,
    flight,
    orbit,
    launch,
    scene: hangar.scene,
    camera: hangar.camera,
    freezeTime(seconds) {
      frozenAt = seconds;
    },
  };
}
