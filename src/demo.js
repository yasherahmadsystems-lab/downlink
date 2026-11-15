// Demo run: the game plays itself once, start to finish, with a sound design.
// "Watch a demo run" on the title screen plays it at a pace you can follow; adding ?demo
// to the address plays it in about 28 seconds, for recording the demo video.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
import { h } from './ui/dom.js';

const STEP_MS = 430;

export function createDemo({ game, store, ui }) {
  let running = false;
  let pace = 1;
  // Space Apps asks for a visible mark on AI-generated imagery, so every frame of a recording carries one.
  const mark = h('p', { class: 'demo-mark stencil' }, 'Code generated with AI (Claude), directed by Team AETHELGARD');

  /** ?demo: browsers only allow sound after a click, so the fast run starts from one button. */
  function offer() {
    const start = h('button', { class: 'btn btn--primary demo-start', type: 'button' }, 'Start the demo run');
    document.body.append(start, mark);
    start.addEventListener('click', () => {
      start.remove();
      run(1);
    });
  }

  /** Plays the run once. `speed` above 1 slows every pause so a first-time viewer can follow. */
  async function run(speed = 1.7) {
    if (running) return;
    running = true;
    pace = speed;
    document.body.append(mark);
    try {
      await play();
    } finally {
      running = false;
      if (speed !== 1) mark.remove();
    }
  }

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms * pace));
  const tab = (id) => ui.querySelector(`[data-key="tab-${id}"]`)?.click();

  async function play() {
    await wait(1400);
    store.start('hurricanes', 'trade');
    game.go('briefing');
    await wait(1500);
    game.go('lab');
    await wait(500);

    // Build the spacecraft one part at a time, so every fit is seen
    const steps = [
      () => tab('solar'),
      () => store.setSlot('face_px', 'solar_wing_3u'),
      () => store.setSlot('face_nx', 'solar_wing_3u'),
      () => store.setSlot('face_py', 'solar_body_3u'),
      () => store.toggle('battery_20'),
      () => tab('computer'),
      () => store.toggle('computer_fast'),
      () => tab('adcs'),
      () => store.toggle('adcs_wheels'),
      () => tab('instrument'),
      () => store.toggle('inst_radiometer'),
      () => tab('antenna'),
      () => store.toggle('antenna_uhf'),
      () => store.toggle('antenna_sband'),
      () => {
        store.design.station = { id: 'gs_sband', count: 2 }; // a second station is the backup that earns the A
        store.saveSnapshot('A');
        store.saveSnapshot('B');
        store.design.snapshotsCompared = 2;
        store.commit();
      },
    ];
    for (const step of steps) {
      step();
      await wait(STEP_MS);
    }
    await wait(300);
    game.go('review');
    await wait(2700);
    game.go('flight');

    // Flight: watch the launch and release, then answer events and move ahead to the report
    await new Promise((resolve) => setTimeout(resolve, 8600 + 4600)); // the flight keeps its own clock
    while (game.state === 'flight') {
      const answer = ui.querySelector('.event:not([hidden]) button');
      if (answer) answer.click();
      else ui.querySelector('.hud__tools .btn:last-child')?.click();
      await wait(650);
    }
  }

  return { offer, run };
}
