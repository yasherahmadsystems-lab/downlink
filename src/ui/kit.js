// Small shared UI pieces: status marks, source chips, number formats, learn-card text.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
import { h } from './dom.js';
import { sound } from '../audio.js';

const SVG = 'http://www.w3.org/2000/svg';
const PATHS = {
  green: 'M3 8.5l3.2 3.2L13 4.8', // tick
  yellow: 'M8 2.5l6 11H2z M8 6.8v3 M8 11.6v.4', // warning triangle
  red: 'M4 4l8 8 M12 4l-8 8', // cross
};
const WORDS = { green: 'Met', yellow: 'Close', red: 'Short' };

/** Status is never colour alone: a mark, a word and the colour together. */
export function status(level, word = WORDS[level]) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', PATHS[level]);
  svg.append(path);
  return h('span', { class: `status status--${level}` }, svg, word);
}

export const chip = (source) => h('span', { class: 'chip', title: 'Where this number comes from' }, source);

/** Sound on/off. The label is the state, so it never relies on an icon alone. */
export function soundToggle(extraClass = '') {
  const label = () => (sound.enabled ? 'Sound on' : 'Sound off');
  const button = h('button', { class: `btn btn--small sound ${extraClass}`, type: 'button', 'aria-pressed': String(sound.enabled), 'data-key': 'sound', onclick: () => {
    sound.toggle();
    button.textContent = label();
    button.setAttribute('aria-pressed', String(sound.enabled));
  } }, label());
  return button;
}

export function money(usd) {
  if (Math.abs(usd) >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  return `$${Math.round(usd / 1000)}k`;
}

export function rate(bps) {
  if (bps >= 1e6) return `${bps / 1e6} Mbps`;
  if (bps >= 1e3) return `${bps / 1e3} kbps`;
  return `${bps} bps`;
}

export const CML_NAMES = ['', 'Cocktail Napkin', 'Initial Feasibility', 'Trade Space', 'Point Design'];

export function nextStep(result, reviewOpen) {
  if (result.cml >= 4) return 'Every margin is met. The design is ready for review.';
  if (result.cml === 3) return 'Next, CML 4: bring mass, power, energy, software and link margins to "Met".';
  if (result.cml === 2) return 'Next, CML 3: save two different designs and compare them.';
  if (reviewOpen && result.cml < 2) return 'Sandbox mode: you can request a review at any time.';
  return 'Next, CML 2: fit the instrument for your objective and make more power than you use.';
}

/** Two plain sentences per dashboard row, for players with no space background. */
export const LEARN = {
  mass: 'Every part adds mass, and the deployer that carries a CubeSat has a hard limit. NASA teams keep 35% spare at this stage, because spacecraft always get heavier as the design matures.',
  power: 'The solar panels must make more power than the parts use, averaged over the whole orbit, including the time in Earth\'s shadow. The 35% margin covers ageing cells and parts that draw more than planned.',
  energy: 'For about a third of every orbit the Sun is hidden behind Earth, and the battery runs everything. Spare energy keeps the battery from draining deeply, which would wear it out.',
  software: 'The flight computer needs processor time and memory for every instrument and control task. NASA asks for 100% spare at this stage, because flight software always grows.',
  link: 'Link margin is how much stronger the signal is than the minimum the ground station needs, in decibels. 6 dB means four times the minimum, which covers rain, pointing errors and ageing parts.',
  downlink: 'An instrument is only useful if its data reaches the ground. The spacecraft can transmit only during passes over a ground station, a few minutes each, a few times a day.',
  budget: 'The cost covers the parts, the launch and running the mission. Keeping 10% in reserve pays for the surprises every project meets.',
  schedule: 'Parts that have not flown before take longer to get ready; that is what a technology readiness level (TRL) measures. A backup link protects against the most common mission killer, losing contact.',
  launch: 'CubeSats ride to orbit inside a standard deployer box, so their size and mass limits are fixed. A 3U may weigh up to 4 kg.',
  instrument: 'The science objective decides which instrument can do the job. Some instruments also need the spacecraft to aim them precisely.',
};
