// audio.js — NEONFALL sound engine.
// Every sound is synthesized with WebAudio oscillators and filtered noise:
// no audio files, no network requests. The context is created lazily and
// only after a user gesture (initAudio is called from input handlers).

let actx = null;
let master = null;
let noiseBuf = null;
let muted = false;
const lastPlay = Object.create(null);

export function initAudio() {
  if (actx) {
    if (actx.state === 'suspended') actx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  actx = new AC();
  master = actx.createGain();
  master.gain.value = muted ? 0 : 0.32;
  master.connect(actx.destination);
  // One shared second of white noise, reused by every noise-based sound.
  const len = actx.sampleRate;
  noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
}

export function isMuted() {
  return muted;
}

export function setMuted(m) {
  muted = !!m;
  if (actx && master) {
    master.gain.setTargetAtTime(muted ? 0 : 0.32, actx.currentTime, 0.01);
  }
}

export function toggleMute() {
  setMuted(!muted);
  return muted;
}

// Prevent a sound from retriggering too often (e.g. shots at high fire rate).
function throttle(key, ms) {
  const now = performance.now();
  if (lastPlay[key] && now - lastPlay[key] < ms) return false;
  lastPlay[key] = now;
  return true;
}

// A single oscillator blip with an exponential pitch glide and a
// fast-attack / smooth-decay gain envelope.
function tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.15, vol = 0.4, delay = 0 }) {
  if (!actx || !master) return;
  const t0 = actx.currentTime + delay;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(20, f0), t0);
  if (f1 !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  }
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// A burst of white noise through a sweeping low-pass filter: explosions,
// impacts and other broadband sounds.
function noise({ dur = 0.3, vol = 0.4, f0 = 1600, f1 = 120, delay = 0, q = 0.8 }) {
  if (!actx || !master || !noiseBuf) return;
  const t0 = actx.currentTime + delay;
  const src = actx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const filter = actx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(f0, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
  const gain = actx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

export const sfx = {
  shoot() {
    if (!throttle('shoot', 45)) return;
    tone({ type: 'square', f0: 940, f1: 320, dur: 0.07, vol: 0.09 });
  },
  hit() {
    if (!throttle('hit', 35)) return;
    tone({ type: 'triangle', f0: 320, f1: 170, dur: 0.05, vol: 0.11 });
  },
  explosion(big = false) {
    if (!throttle('explosion', 40)) return;
    noise({ dur: big ? 0.65 : 0.26, vol: big ? 0.55 : 0.26, f0: big ? 1100 : 1500, f1: 55 });
    tone({ type: 'sine', f0: big ? 150 : 210, f1: 38, dur: big ? 0.55 : 0.24, vol: 0.32 });
  },
  pickup() {
    if (!throttle('pickup', 55)) return;
    tone({ type: 'sine', f0: 760, f1: 1240, dur: 0.08, vol: 0.12 });
  },
  levelup() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.16, vol: 0.2, delay: i * 0.07 }));
  },
  boss() {
    // Low two-tone alarm swell for the boss entrance.
    tone({ type: 'sawtooth', f0: 98, f1: 92, dur: 0.95, vol: 0.26 });
    tone({ type: 'sawtooth', f0: 103.8, f1: 98, dur: 0.95, vol: 0.26 });
    tone({ type: 'square', f0: 196, f1: 185, dur: 0.95, vol: 0.08 });
    noise({ dur: 0.9, vol: 0.06, f0: 420, f1: 160 });
  },
  shieldBreak() {
    tone({ type: 'sine', f0: 1250, f1: 420, dur: 0.2, vol: 0.2 });
    noise({ dur: 0.16, vol: 0.12, f0: 2600, f1: 500 });
  },
  hurt() {
    if (!throttle('hurt', 90)) return;
    tone({ type: 'sawtooth', f0: 210, f1: 65, dur: 0.2, vol: 0.22 });
  },
  gameover() {
    const notes = [392, 329.63, 261.63, 196];
    notes.forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.32, vol: 0.24, delay: i * 0.17 }));
    noise({ dur: 1.0, vol: 0.1, f0: 700, f1: 60, delay: 0.05 });
  },
  victory() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.24, vol: 0.2, delay: i * 0.09 }));
  },
};
