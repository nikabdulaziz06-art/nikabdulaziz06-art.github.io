// Lari Sihat: original cheerful background tune, synthesised live with Web Audio.
// API: KidsMusic.start() / stop() / pause(bool) / duck(bool) / setZone(n) / setEnabled(bool) / fanfare()
(function () {
  "use strict";
  let ac = null, master = null, timer = null, step = 0, nextT = 0, playing = false;
  let enabled = true, zone = 0, ducked = false, paused = false;
  try { enabled = localStorage.getItem("lariSihatMusic") !== "0"; } catch (e) {}

  const _ = 0;
  // 8 bars of 16 steps: A section (C G Am F) then B section (F G C C)
  const MEL = [
    72,_,72,76, 79,_,76,_, 77,_,79,_, 76,_,_,_,
    74,_,74,77, 79,_,77,_, 76,_,74,_, 71,_,_,_,
    72,_,72,76, 81,_,79,_, 76,_,77,_, 79,_,_,_,
    77,_,76,_, 74,_,72,_, 74,_,76,_, 72,_,_,_,
    81,_,81,_, 79,_,77,_, 76,_,77,_, 79,_,_,_,
    79,_,79,_, 77,_,76,_, 74,_,76,_, 77,_,_,_,
    76,_,79,_, 84,_,83,_, 81,_,79,_, 76,_,77,_,
    79,_,76,_, 74,_,71,_, 72,_,_,_, 72,_,_,_,
  ];
  const ROOT = [48, 43, 45, 41, 41, 43, 48, 48];
  const CHORD = [[60, 64, 67], [59, 62, 67], [60, 64, 69], [60, 65, 69], [60, 65, 69], [59, 62, 67], [60, 64, 67], [60, 64, 67]];
  const BASS = [1,_,_,_, 2,_,1,_, 1,_,_,_, 2,_,1,_];      // 1 = root, 2 = octave up
  const ZT = [0, 2, 4, 5, -3];                              // key change per zone
  const ZBPM = [132, 136, 140, 128, 144];

  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function vol() { return !enabled || paused ? 0 : ducked ? 0.05 : 0.13; }
  function setVol(fast) {
    if (!ac) return;
    const n = ac.currentTime;
    master.gain.cancelScheduledValues(n);
    master.gain.setTargetAtTime(vol(), n, fast ? 0.03 : 0.15);
  }

  function tone(t, f, dur, type, v, attack = 0.005) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function noise(t, dur, v, hp) {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = "highpass"; f.frequency.value = hp;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
  }
  function kick(t) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.2);
  }

  function playStep(i, t, s16) {
    const bar = (i >> 4) % 8, k = i % 16, tr = ZT[zone] || 0;
    const m = MEL[(i % 128)];
    if (m) {
      tone(t, hz(m + tr), s16 * 1.7, "square", 0.16);          // chirpy lead
      tone(t, hz(m + tr + 12), s16 * 1.2, "triangle", 0.06);    // sparkle
    }
    const b = BASS[k];
    if (b) tone(t, hz(ROOT[bar] + tr + (b === 2 ? 12 : 0)), s16 * 1.6, "triangle", 0.5);
    if (k % 4 === 2) CHORD[bar].forEach(n => tone(t, hz(n + tr), s16 * 0.9, "square", 0.035));
    if (k === 0 || k === 8 || (k === 10 && bar % 2)) kick(t);
    if (k === 4 || k === 12) noise(t, 0.12, 0.35, 1500);       // clap
    if (k % 2 === 0) noise(t, 0.035, 0.12, 7000);              // hi-hat
    if (bar === 7 && k >= 12) tone(t, hz(84 + tr + (k - 12) * 2), s16, "triangle", 0.05);  // little fill
  }

  function tick() {
    if (!playing) return;
    const s16 = 60 / (ZBPM[zone] || 132) / 4;
    while (nextT < ac.currentTime + 0.12) {
      if (!paused) playStep(step, nextT, s16);
      step = (step + 1) % 128; nextT += s16;
    }
  }

  const API = {
    start() {
      if (!ctx()) return;
      if (!playing) { playing = true; step = 0; nextT = ac.currentTime + 0.08; timer = setInterval(tick, 25); }
      paused = false; ducked = false; setVol();
    },
    stop() {
      playing = false; clearInterval(timer); timer = null;
      if (ac) setVol(true), master.gain.setTargetAtTime(0, ac.currentTime, 0.05);
    },
    pause(on) { paused = !!on; setVol(true); },
    duck(on) { ducked = !!on; setVol(); },
    setZone(z) { zone = Math.max(0, Math.min(4, z | 0)); },
    setEnabled(on) {
      enabled = !!on;
      try { localStorage.setItem("lariSihatMusic", enabled ? "1" : "0"); } catch (e) {}
      if (enabled && playing) ctx();
      setVol(true);
    },
    isEnabled() { return enabled; },
    fanfare() {
      if (!enabled || !ctx()) return;
      const t = ac.currentTime + 0.05, saved = paused;
      paused = false; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(0.14, t);
      [[72, 0], [76, .12], [79, .24], [84, .36], [79, .6], [84, .72]].forEach(([m, d]) =>
        tone(t + d, hz(m), d > .5 ? .7 : .2, "square", .2));
      [[48, 0], [55, .36], [60, .72]].forEach(([m, d]) => tone(t + d, hz(m), .5, "triangle", .5));
      paused = saved;
    },
  };
  window.KidsMusic = API;
})();
