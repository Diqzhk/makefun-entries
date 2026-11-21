// audio.js — all sound is synthesised WebAudio: two radio stations with
// different loops, an engine hum that follows the car's speed, and the small
// blips and thumps the UI and the SPD make. Nothing starts until the player
// clicks — browsers demand a gesture, and the menu click is ours.
export const STATIONS = [
  { name: 'SUNWAVE FM', tag: 'Coastal Drive · Nonstop Sun' },
  { name: 'RADIO BRISA', tag: 'Salsa y Sol · 24 Horas' },
];

const CHORDS = {
  sunwave: [ // A minor, lazy and warm: Am F C G
    [110.0, 130.8, 164.8], [87.3, 110.0, 130.8], [130.8, 164.8, 196.0], [98.0, 123.5, 146.8],
  ],
  brisa: [ // C major, brighter: C G Am F
    [130.8, 164.8, 196.0], [98.0, 123.5, 146.8], [110.0, 130.8, 164.8], [87.3, 110.0, 130.8],
  ],
};

export function createAudio() {
  let ctx = null, master = null;
  let stationIdx = 0, radioOn = true, musicTimer = null, barAt = 0, chordIdx = 0;
  let engine = null; // {osc, gain, filter}

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    barAt = ctx.currentTime + 0.1;
    musicTimer = setInterval(schedule, 240);
  }

  function tone(freq, t, dur, type, gain, dest) {
    const o = ctx.createOscillator();
    const gn = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(gain, t + 0.03);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(dest || master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function schedule() {
    if (!ctx || !radioOn) return;
    const brisa = stationIdx === 1;
    const barLen = brisa ? 1.7 : 2.3;
    while (barAt < ctx.currentTime + 0.5) {
      const chords = brisa ? CHORDS.brisa : CHORDS.sunwave;
      const chord = chords[chordIdx % chords.length];
      const t = Math.max(barAt, ctx.currentTime + 0.02);
      for (const f of chord) tone(f, t, barLen * 0.95, 'triangle', 0.05, master);
      tone(chord[0] / 2, t, barLen * 0.6, 'sine', 0.11, master);
      // arp sparkle / brisa clave-ish ticks
      const steps = brisa ? 8 : 4;
      for (let s = 0; s < steps; s++) {
        const f = chord[s % chord.length] * (s % 2 ? 2 : 4);
        tone(f, t + (barLen / steps) * s, 0.16, brisa ? 'square' : 'sine', brisa ? 0.016 : 0.02, master);
      }
      chordIdx++;
      barAt += barLen;
    }
  }

  return {
    init,
    get station() { return STATIONS[stationIdx]; },
    get stationIndex() { return stationIdx; },
    setStation(i) { stationIdx = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length; chordIdx = 0; },
    nextStation() { this.setStation(stationIdx + 1); this.blip(660); return this.station; },
    setRadio(on) { radioOn = on; },
    blip(freq = 740) {
      if (!ctx) return;
      tone(freq, ctx.currentTime, 0.09, 'square', 0.05, master);
      tone(freq * 1.5, ctx.currentTime + 0.09, 0.07, 'square', 0.03, master);
    },
    click() { if (ctx) tone(1200, ctx.currentTime, 0.05, 'sine', 0.06, master); },
    cash() {
      if (!ctx) return;
      tone(988, ctx.currentTime, 0.1, 'square', 0.05, master);
      tone(1319, ctx.currentTime + 0.09, 0.16, 'square', 0.05, master);
    },
    shot() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const gn = ctx.createGain(); gn.gain.value = 0.22;
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1800;
      src.connect(fl); fl.connect(gn); gn.connect(master);
      src.start(t);
      tone(70, t, 0.14, 'sine', 0.25, master);
    },
    engineStart() {
      if (!ctx || engine) return;
      const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 55;
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 320;
      const gn = ctx.createGain(); gn.gain.value = 0.0;
      osc.connect(fl); fl.connect(gn); gn.connect(master);
      osc.start();
      engine = { osc, gain: gn, filter: fl };
    },
    engineUpdate(speedRatio, dt) {
      if (!engine || !ctx) return;
      const target = 0.05 + Math.abs(speedRatio) * 0.05;
      engine.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engine.osc.frequency.setTargetAtTime(52 + Math.abs(speedRatio) * 165, ctx.currentTime, 0.06);
      engine.filter.frequency.setTargetAtTime(280 + Math.abs(speedRatio) * 900, ctx.currentTime, 0.1);
    },
    engineStop() {
      if (!engine || !ctx) return;
      engine.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      const e = engine; engine = null;
      setTimeout(() => { try { e.osc.stop(); } catch { /* already gone */ } }, 300);
    },
  };
}
