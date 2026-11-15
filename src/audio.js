// Sound effects, synthesised in the browser with the Web Audio API. There are no
// audio files: every sound is built here from oscillators and filtered noise.
// Written by Claude (AI) for Team AETHELGARD, NASA Space Apps 2026.
const KEY = 'smdg.sound.v1';

let ctx = null;
let master = null;
let noise = null;
let rumble = null; // the engine sound while it is running
let enabled = true;
try {
  enabled = localStorage.getItem(KEY) !== 'off';
} catch {
  // Storage can be blocked; sound simply starts on.
}

function ready() {
  if (!enabled) return false;
  const Ctor = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctor) return false;
  if (!ctx) {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // One second of white noise, reused for clicks and thumps
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return true;
}

/** A tone that can glide from `f` to `to`, with a fast attack and a smooth tail. */
function tone({ f, to = f, at = 0, dur = 0.14, type = 'sine', gain = 0.2 }) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** A burst of band-passed noise: the "metal on metal" part of a click. */
function burst({ at = 0, dur = 0.04, freq = 2400, q = 1.2, gain = 0.2 }) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  const band = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  src.buffer = noise;
  band.type = 'bandpass';
  band.frequency.value = freq;
  band.Q.value = q;
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(band).connect(amp).connect(master);
  src.start(t, Math.random() * 0.5, dur + 0.02);
}

/** Engine roar: looped noise through a low-pass that opens as thrust builds. */
function roar(seconds) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  const low = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  src.buffer = noise;
  src.loop = true;
  low.type = 'lowpass';
  low.frequency.setValueAtTime(90, t);
  low.frequency.exponentialRampToValueAtTime(520, t + 0.9);
  low.frequency.exponentialRampToValueAtTime(260, t + seconds);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(0.9, t + 0.7);
  amp.gain.exponentialRampToValueAtTime(0.35, t + seconds);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 1.2);
  src.connect(low).connect(amp).connect(master);
  src.start(t);
  src.stop(t + seconds + 1.3);
  rumble = { amp, src };
  src.onended = () => {
    if (rumble?.src === src) rumble = null;
  };
}

const SOUNDS = {
  // Lift-off: a sharp start, then the roar
  ignite() {
    burst({ dur: 0.12, freq: 700, q: 0.5, gain: 0.5 });
    tone({ f: 70, to: 38, dur: 1.1, gain: 0.5 });
    roar(7);
  },
  // A check read out, or a button pressed
  tick() {
    burst({ dur: 0.018, freq: 3600, q: 2, gain: 0.07 });
  },
  // A part seats on its socket: latch click over a short low knock
  fit() {
    burst({ dur: 0.03, freq: 3200, gain: 0.25 });
    tone({ f: 190, to: 95, dur: 0.11, gain: 0.3 });
  },
  remove() {
    burst({ dur: 0.025, freq: 1800, gain: 0.16 });
    tone({ f: 110, to: 150, dur: 0.08, gain: 0.18 });
  },
  // The maturity meter steps up
  raise() {
    tone({ f: 660, at: 0.18, dur: 0.16, gain: 0.14 });
    tone({ f: 990, at: 0.3, dur: 0.26, gain: 0.14 });
  },
  pass() {
    [523, 659, 784].forEach((f, i) => tone({ f, at: i * 0.11, dur: 0.3, gain: 0.13 }));
  },
  fail() {
    tone({ f: 330, dur: 0.22, type: 'triangle', gain: 0.16 });
    tone({ f: 247, at: 0.2, dur: 0.34, type: 'triangle', gain: 0.16 });
  },
  // The deployer spring lets go
  release() {
    burst({ dur: 0.05, freq: 900, q: 0.7, gain: 0.35 });
    tone({ f: 120, to: 48, dur: 0.4, gain: 0.4 });
  },
  latch() {
    burst({ dur: 0.025, freq: 4200, gain: 0.18 });
    tone({ f: 240, to: 160, dur: 0.06, gain: 0.16 });
  },
  // First beacon heard on the ground
  beacon() {
    [0, 0.16, 0.32].forEach((at) => tone({ f: 1240, at, dur: 0.09, gain: 0.1 }));
  },
  alarm() {
    [0, 0.3].forEach((at) => {
      tone({ f: 466, at, dur: 0.13, type: 'triangle', gain: 0.17 });
      tone({ f: 370, at: at + 0.14, dur: 0.13, type: 'triangle', gain: 0.17 });
    });
  },
  absorbed() {
    tone({ f: 587, dur: 0.18, gain: 0.11 });
    tone({ f: 784, at: 0.12, dur: 0.24, gain: 0.11 });
  },
  report() {
    [392, 494, 587].forEach((f) => tone({ f, dur: 0.7, gain: 0.08 }));
  },
};

export const sound = {
  get enabled() {
    return enabled;
  },
  play(name) {
    if (!SOUNDS[name] || !ready()) return;
    try {
      SOUNDS[name]();
    } catch {
      // A sound that cannot play must never break the game.
    }
  },
  /** Fades out the engine roar, for a cut away from the pad. */
  hush() {
    if (!rumble || !ctx) return;
    const t = ctx.currentTime;
    rumble.amp.gain.cancelScheduledValues(t);
    rumble.amp.gain.setTargetAtTime(0.0001, t, 0.12);
    rumble.src.stop(t + 0.8);
    rumble = null;
  },
  toggle() {
    enabled = !enabled;
    if (!enabled) sound.hush();
    try {
      localStorage.setItem(KEY, enabled ? 'on' : 'off');
    } catch {
      // Not saved; the choice still holds for this visit.
    }
    if (enabled) sound.play('latch');
    return enabled;
  },
};
