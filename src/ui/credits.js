// Credits and AI disclosure dialog. Written by Claude (AI) for Team AETHELGARD.
// Keep this list in step with README.md; every library, font, HDRI, texture
// and sound added later gets a row with its licence.
import { h } from './dom.js';

const CREDITS = [
  ['Team', 'AETHELGARD (Peshawar Local Event): concept, direction, decisions'],
  ['AI disclosure', 'Claude (Anthropic) wrote the code and helped with the data tables'],
  ['three.js', 'MIT licence'],
  ['Vite', 'MIT licence'],
  ['Fonts', 'Barlow Condensed, IBM Plex Mono, IBM Plex Sans: SIL Open Font License 1.1, served by Google Fonts'],
  ['Earth imagery', 'NASA Scientific Visualization Studio, Blue Marble (svs.gsfc.nasa.gov/2915): public domain'],
  ['Sound', 'No audio files. Every sound is synthesised in the browser by code Claude wrote (Web Audio API)'],
  ['NASA rules', 'JPL Concept Maturity Levels; CubeSat 101; Design and Develop Science Missions; Mission Design Lab; Planetary Fact Sheets. Each rule in the game carries its source.'],
  ['Game balance', 'Part masses, costs, power and data rates are invented for play and labelled as such'],
  ['Notice', 'Not affiliated with or endorsed by NASA. No NASA insignia are used.'],
];

let dialog;

export function openCredits() {
  if (!dialog) {
    dialog = h(
      'dialog',
      { class: 'credits', 'aria-labelledby': 'credits-h' },
      h('h2', { id: 'credits-h' }, 'Credits and sources'),
      h('dl', {}, ...CREDITS.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      h('form', { method: 'dialog' }, h('button', { class: 'btn' }, 'Close')),
    );
    document.body.append(dialog);
  }
  dialog.showModal();
}
