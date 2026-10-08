'use strict';
// Allt ljud skapas med Web Audio (inga ljudfiler): effekter, bakgrundsmusik och väderljud.
window.Snd = (function () {
  let ac = null, out, sfx, mus, amb, verbIn, noiseBuf, brownBuf;
  let muted = false;
  try { muted = localStorage.getItem('smita-mute') === '1'; } catch (e) { }

  function gainNode(v, to) { const g = ac.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
  function makeNoise(sec, brown) {
    const n = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }
  function impulse(sec, decay) {
    const n = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    comp.connect(ac.destination);
    out = gainNode(muted ? 0 : 0.9, comp);
    const verb = ac.createConvolver(); verb.buffer = impulse(1.8, 3.2); verb.connect(gainNode(0.45, out));
    verbIn = gainNode(1, verb);
    sfx = gainNode(1, out); mus = gainNode(0.28, out); amb = gainNode(0.8, out);
    noiseBuf = makeNoise(2, false); brownBuf = makeNoise(4, true);
    startLoops();
  }

  // Envelopp: snabb attack, ev. hållning, exponentiell avklingning
  function env(p, t0, a, v, d, hold) {
    p.setValueAtTime(0.0001, t0);
    p.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + a);
    if (hold) p.setValueAtTime(Math.max(0.0002, v), t0 + a + hold);
    p.exponentialRampToValueAtTime(0.0001, t0 + a + hold + d);
  }
  function finish(g, o, t0, len) {
    g.connect(o.bus || sfx);
    if (o.rev) g.connect(gainNode(o.rev, verbIn));
    return t0 + len + 0.05;
  }
  // Ton: {f, f2, glide, type, t, a, d, hold, v, lp, q, vib, vibD, rev, bus}
  function T(o) {
    if (!ac) return;
    const t0 = ac.currentTime + (o.t || 0), a = o.a || 0.005, d = o.d || 0.2, hold = o.hold || 0;
    const osc = ac.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + (o.glide || a + hold + d));
    let node = osc;
    if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 0.7; node.connect(f); node = f; }
    const g = ac.createGain(); env(g.gain, t0, a, o.v || 0.2, d, hold); node.connect(g);
    const end = finish(g, o, t0, a + hold + d);
    if (o.vib) {
      const lfo = ac.createOscillator(); lfo.frequency.value = o.vib;
      const lg = gainNode(o.vibD || 10); lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t0); lfo.stop(end);
    }
    osc.start(t0); osc.stop(end);
  }
  // Brus: {t, a, d, hold, v, f, f2, q, type, brown, rev, bus}
  function N(o) {
    if (!ac) return;
    const t0 = ac.currentTime + (o.t || 0), a = o.a || 0.004, d = o.d || 0.2, hold = o.hold || 0;
    const src = ac.createBufferSource(); src.buffer = o.brown ? brownBuf : noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t0 + a + hold + d);
    f.Q.value = o.q === undefined ? 1 : o.q;
    const g = ac.createGain(); env(g.gain, t0, a, o.v || 0.2, d, hold);
    src.connect(f); f.connect(g);
    const end = finish(g, o, t0, a + hold + d);
    src.start(t0, Math.random() * 1.5); src.stop(end);
  }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- Ljudeffekter ----------
  const fx = {
    // Visselpipa med kula: snabb drill (frekvensmodulering) och lite luft
    whistle() {
      for (const [t, h] of [[0, 0.1], [0.24, 0.1], [0.5, 0.5]]) {
        T({ f: 2850, t, a: 0.01, hold: h, d: 0.12, v: 0.13, vib: 34, vibD: 230, rev: 0.25 });
        N({ t, f: 3000, q: 2, a: 0.01, hold: h, d: 0.1, v: 0.04 });
      }
    },
    item() {
      [72, 76, 79, 84].forEach((m, k) => {
        T({ f: mtof(m), type: 'triangle', t: k * 0.065, d: 0.22, v: 0.13, rev: 0.25 });
        T({ f: mtof(m + 24), t: k * 0.065, d: 0.12, v: 0.025 });
      });
    },
    bun() {
      N({ f: 2600, q: 0.8, d: 0.05, v: 0.22 }); N({ t: 0.07, f: 2200, q: 0.8, d: 0.05, v: 0.18 });
      T({ f: 220, f2: 275, type: 'triangle', t: 0.12, a: 0.03, d: 0.25, v: 0.1, lp: 900 });
      T({ f: 1568, t: 0.02, d: 0.15, v: 0.05, rev: 0.3 });
    },
    bad() {
      T({ f: 330, f2: 250, type: 'sawtooth', d: 0.25, v: 0.09, lp: 1300 });
      T({ f: 250, f2: 160, type: 'sawtooth', t: 0.26, d: 0.4, v: 0.09, lp: 1100, vib: 6, vibD: 8 });
    },
    slip() {
      T({ f: 1400, f2: 240, d: 0.45, v: 0.16 });
      T({ f: 120, f2: 45, t: 0.42, d: 0.25, v: 0.45 });
      N({ type: 'lowpass', f: 450, t: 0.42, d: 0.18, v: 0.3 });
    },
    splash() {
      N({ type: 'lowpass', f: 3500, f2: 300, d: 0.4, v: 0.35 });
      for (let k = 0; k < 6; k++) { const f = 900 + Math.random() * 1200; T({ f, f2: f * 1.6, t: 0.05 + Math.random() * 0.35, d: 0.05, v: 0.05 }); }
    },
    puddle() {
      N({ type: 'lowpass', f: 2200, f2: 500, d: 0.18, v: 0.16 });
      T({ f: 700, f2: 1300, t: 0.03, d: 0.05, v: 0.04 });
    },
    fart() {
      T({ f: 95, f2: 58, type: 'sawtooth', a: 0.02, d: 0.7, v: 0.32, lp: 420, q: 3, vib: 23, vibD: 28 });
      N({ type: 'lowpass', f: 300, a: 0.02, d: 0.6, v: 0.14 });
    },
    phone() {
      for (let k = 0; k < 2; k++) T({ f: 1350, type: 'square', t: k * 0.6, a: 0.005, hold: 0.36, d: 0.03, v: 0.05, lp: 3200, vib: 20, vibD: 180 });
    },
    warn() {
      T({ f: 620, type: 'triangle', d: 0.14, v: 0.15 });
      T({ f: 465, type: 'triangle', t: 0.16, d: 0.24, v: 0.15 });
    },
    // Spårvagnens "pling-pling": klocka med oharmoniska deltoner
    bell() {
      for (const t of [0, 0.3]) [[1, 0.9, 0.11], [2.76, 0.5, 0.05], [5.4, 0.25, 0.03], [8.93, 0.12, 0.015]].forEach(([r, d, v]) =>
        T({ f: 1040 * r, t, a: 0.002, d, v, rev: 0.3 }));
    },
    caught() {
      [[62, 0.35], [61, 0.35], [60, 0.35], [59, 1.1]].forEach(([m, d], k) =>
        T({ f: mtof(m - 12), type: 'sawtooth', t: k * 0.38, a: 0.02, d, v: 0.14, lp: 1100, vib: k === 3 ? 6 : 0, vibD: 10, rev: 0.2 }));
    },
    boing() { T({ f: 220, f2: 620, d: 0.25, v: 0.16 }); T({ f: 440, f2: 1240, d: 0.18, v: 0.04 }); },
    horn() {
      for (const f of [110, 138.6]) T({ f, type: 'sawtooth', a: 0.06, hold: 0.7, d: 0.35, v: 0.09, lp: 600, rev: 0.5 });
    },
    gull() {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) T({ f: 2000 - k * 60, f2: 1300, t: k * 0.28, a: 0.02, d: 0.22, v: 0.035, vib: 28, vibD: 70, rev: 0.5 });
    },
    thunder() {
      N({ type: 'lowpass', f: 2500, d: 0.25, v: 0.25 });
      N({ brown: true, type: 'lowpass', f: 420, f2: 70, a: 0.08, d: 3.2, v: 0.9, rev: 0.4 });
    },
    engineStart() { T({ f: 60, f2: 140, type: 'sawtooth', d: 0.55, v: 0.14, lp: 700 }); },
    heart() { T({ f: 62, d: 0.12, v: 0.4 }); T({ f: 55, t: 0.17, d: 0.12, v: 0.28 }); },
    swoosh() { N({ type: 'bandpass', f: 600, f2: 2500, q: 1.5, d: 0.25, v: 0.12 }); },
    step(kind) {
      if (kind === 'grass') N({ f: 900, q: 0.8, d: 0.05, v: 0.05 });
      else if (kind === 'snow') N({ f: 3400, q: 0.6, d: 0.09, v: 0.07 });
      else if (kind === 'wet') { N({ type: 'highpass', f: 2200, d: 0.06, v: 0.05 }); N({ f: 1100, q: 2, d: 0.04, v: 0.03 }); }
      else if (kind === 'wood') T({ f: 210, type: 'triangle', d: 0.05, v: 0.06 });
      else { N({ f: kind === 'cobble' ? 3000 : 2300, q: 1.6, d: 0.03, v: 0.06 }); T({ f: 170, d: 0.03, v: 0.03 }); }
    }
  };

  // ---------- Bilmotor ----------
  let eng = null;
  function engine(spd) {
    if (!ac) return;
    if (spd < 0) { if (eng) { eng.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.08); const e = eng; setTimeout(() => { e.a.stop(); e.b.stop(); }, 400); eng = null; } return; }
    if (!eng) {
      const a = ac.createOscillator(), b = ac.createOscillator(), f = ac.createBiquadFilter(), g = gainNode(0.0001, sfx);
      a.type = 'sawtooth'; b.type = 'square'; f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 2;
      a.connect(f); b.connect(f); f.connect(g); a.start(); b.start();
      eng = { a, b, f, g };
    }
    const t = ac.currentTime, base = 42 + spd * 7;
    eng.a.frequency.setTargetAtTime(base, t, 0.05); eng.b.frequency.setTargetAtTime(base / 2, t, 0.05);
    eng.f.frequency.setTargetAtTime(500 + spd * 60, t, 0.05);
    eng.g.gain.setTargetAtTime(0.05 + spd * 0.004, t, 0.05);
  }

  // ---------- Bakgrundsljud: stad, regn, vind ----------
  const loops = {};
  function loop(buf, type, f, q) {
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = gainNode(0, amb); src.connect(fl); fl.connect(g); src.start();
    return { src, fl, g };
  }
  let ambWant = { city: 0, rain: 0, wind: 0 };
  function startLoops() {
    loops.city = loop(brownBuf, 'lowpass', 260, 0.7);
    loops.rain = loop(noiseBuf, 'highpass', 900, 0.5);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    loops.rain.fl.disconnect(); loops.rain.fl.connect(lp); lp.connect(loops.rain.g);
    loops.wind = loop(brownBuf, 'bandpass', 500, 0.8);
    // Vindbyar: långsam modulering av filter och volym
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.13; const lg = gainNode(260); lfo.connect(lg); lg.connect(loops.wind.fl.frequency); lfo.start();
    setAmb(ambWant);
  }
  function setAmb(a) {
    ambWant = Object.assign({}, ambWant, a);
    if (!ac) return;
    const t = ac.currentTime;
    loops.city.g.gain.setTargetAtTime(ambWant.city * 0.5, t, 0.8);
    loops.rain.g.gain.setTargetAtTime(ambWant.rain * 0.35, t, 0.8);
    loops.wind.g.gain.setTargetAtTime(ambWant.wind * 0.7, t, 0.8);
  }

  // ---------- Musik ----------
  // Ackord Am – F – C – G. Lugn smygmusik i ledet, snabbare när läraren letar och jagar.
  const CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const MEL_CALM = [
    [[0, 69, 2], [3, 72, 1], [4, 71, 1], [6, 69, 2], [10, 64, 2], [12, 69, 3]],
    [[0, 65, 2], [3, 69, 1], [4, 72, 2], [8, 74, 1], [10, 72, 2], [12, 69, 3]],
    [[0, 67, 2], [3, 72, 1], [4, 76, 2], [8, 74, 1], [10, 72, 2], [12, 67, 3]],
    [[0, 71, 2], [3, 74, 1], [4, 79, 2], [8, 77, 1], [10, 74, 2], [12, 71, 2], [14, 68, 2]]
  ];
  const MEL_CHASE = [
    [[0, 76], [2, 76], [4, 72], [6, 76], [8, 79], [12, 67]],
    [[0, 77], [2, 77], [4, 72], [6, 77], [8, 81], [12, 69]],
    [[0, 76], [2, 79], [4, 84], [6, 79], [8, 76], [10, 72], [12, 76]],
    [[0, 74], [2, 74], [4, 71], [6, 74], [8, 79], [10, 78], [12, 79], [14, 74]]
  ];
  let mMode = 'off', mWant = 'off', mNext = 0, mStep = 0;
  const bass = (m, t, d, v) => { T({ f: mtof(m), type: 'sawtooth', t, d, v, lp: 520, q: 4, bus: mus }); T({ f: mtof(m), t, d, v: v * 0.9, bus: mus }); };
  const pluck = (m, t, v) => T({ f: mtof(m), type: 'triangle', t, a: 0.003, d: 0.22, v, lp: 3000, bus: mus });
  const lead = (m, t, d, v, type) => T({ f: mtof(m), type, t, a: 0.01, d, v, lp: 2400, vib: 5.5, vibD: 5, rev: 0.25, bus: mus });
  const kick = t => T({ f: 150, f2: 40, glide: 0.12, t, d: 0.2, v: 0.55, bus: mus });
  const snare = t => { N({ t, f: 1800, q: 0.7, d: 0.12, v: 0.2, bus: mus }); T({ f: 190, type: 'triangle', t, d: 0.06, v: 0.1, bus: mus }); };
  const hat = (t, v) => N({ t, type: 'highpass', f: 7500, d: 0.03, v, bus: mus });
  function playStep(n, t, st) {
    const bar = Math.floor(n / 16) % 4, s = n % 16, ch = CH[bar], cyc = Math.floor(n / 64);
    if (mMode === 'chase') {
      if (s % 4 === 0) kick(t);
      if (s === 4 || s === 12) snare(t);
      hat(t, s % 2 ? 0.03 : 0.06);
      if (s % 2 === 0) bass(ch[0] - 12 + (s % 8 === 6 ? 12 : 0), t, st * 1.6, 0.2);
      for (const [ms, m] of MEL_CHASE[bar]) if (ms === s) lead(m, t, st * 1.7, 0.07, 'square');
    } else {
      const search = mMode === 'search';
      if (s === 0 || s === 8 || (search && (s === 6 || s === 14))) bass(s === 8 ? ch[0] - 5 : ch[0] - 12, t, st * 3, 0.22);
      if (s % 2 === 0) pluck(ch[[0, 1, 2, 1][(s / 2) % 4]] + 12, t, search ? 0.07 : 0.06);
      if (s % 4 === 2 || (search && s % 2 === 1)) hat(t, 0.025);
      if (search && s % 8 === 4) kick(t);
      if (cyc % 2 === 1) for (const [ms, m, len] of MEL_CALM[bar]) if (ms === s) lead(m, t, st * len * 1.2, 0.08, 'triangle');
    }
  }
  function music(mode) { mWant = mode; }
  function update() {
    if (!ac || muted) return;
    if (mWant !== mMode) { mMode = mWant; mNext = ac.currentTime + 0.05; mStep = 0; }
    if (mMode === 'off') return;
    const bpm = mMode === 'chase' ? 148 : mMode === 'search' ? 120 : 104, st = 60 / bpm / 4;
    if (mNext < ac.currentTime - 0.25) mNext = ac.currentTime + 0.05;
    while (mNext < ac.currentTime + 0.15) { playStep(mStep, mNext - ac.currentTime, st); mNext += st; mStep++; }
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('smita-mute', m ? '1' : '0'); } catch (e) { }
    if (ac) out.gain.setTargetAtTime(m ? 0 : 0.9, ac.currentTime, 0.05);
  }
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend(); else ac.resume();
  });

  const api = { init, music, update, engine, setAmb, setMuted, isMuted: () => muted };
  for (const k in fx) api[k] = (...a) => { if (ac && !muted) fx[k](...a); };
  return api;
})();
