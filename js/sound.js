/* =========================================================================
   sound.js — 경량 WebAudio 효과음(플레이스홀더). 리소스 교체 시 샘플로 대체 가능.
   ========================================================================= */

'use strict';

var Sound = {
  ctx: null,
  enabled: true,
  _waka: 0,

  // 배경음악(칩튠) 상태
  bgmOn: false,
  _bgmGain: null,
  _bgmTimer: 0,
  _step: 0,
  _nextNoteTime: 0,
  _tempo: 138,   // BPM (8분음표 단위로 스텝 진행)

  load: function () {
    try { if (localStorage.getItem('pac_sound') === '0') this.enabled = false; } catch (e) {}
  },
  unlock: function () {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (this.ctx && this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} }
  },
  toggle: function () {
    this.enabled = !this.enabled;
    try { localStorage.setItem('pac_sound', this.enabled ? '1' : '0'); } catch (e) {}
    if (!this.enabled) this.stopBGM();
    return this.enabled;
  },
  blip: function (freq, dur, type, vol) {
    if (!this.enabled || !this.ctx) return;
    try {
      var o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      var v = vol || 0.05;
      o.connect(g); g.connect(this.ctx.destination);
      var t = this.ctx.currentTime;
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur);
    } catch (e) {}
  },

  dot: function () {
    // BGM(사각파 베이스/리드, 110~392Hz)과 음역·음색이 겹치면 탁해지므로
    // 한 옥타브 이상 높은 A단조 화성음(A5/E5)을 부드러운 삼각파로, 짧고 작게.
    // → 빠르게 연타돼도 BGM 위에 '톡톡' 얹히는 픽업음이라 충돌하지 않음.
    this._waka ^= 1;
    this.blip(this._waka ? 880.00 : 659.25, 0.05, 'triangle', 0.034);
  },
  pellet: function () { this.blip(150, 0.2, 'square', 0.06); },
  eatGhost: function () { this.blip(520, 0.1, 'sawtooth', 0.07); this.blip(760, 0.12, 'sawtooth', 0.05); },
  fruit: function () { this.blip(900, 0.14, 'triangle', 0.07); },
  extra: function () { this.blip(1000, 0.22, 'triangle', 0.08); },
  ready: function () { this.blip(660, 0.16, 'triangle', 0.06); },
  death: function () {
    if (!this.enabled || !this.ctx) return;
    var self = this;
    for (var i = 0; i < 8; i++) {
      (function (k) { setTimeout(function () { self.blip(520 - k * 48, 0.13, 'sawtooth', 0.06); }, k * 95); })(i);
    }
  },

  // ---- 배경음악(절차 생성 칩튠 루프) ---------------------------------------
  // 외부 음원 없이 WebAudio로 8비트 오락실풍 루프를 실시간 합성.
  // 코드 진행 Am - F - C - G (한 마디 4스텝, 8분음표) × 4마디 = 16스텝 루프.
  // 베이스(저음 사각파) + 리드 아르페지오(사각파) + 백비트 하이햇(노이즈).
  _BASS: [
    110.00, 110.00, 164.81, 110.00,   // Am: A2 A2 E3 A2
     87.31,  87.31, 130.81,  87.31,   // F : F2 F2 C3 F2
    130.81, 130.81,  98.00, 130.81,   // C : C3 C3 G2 C3
     98.00,  98.00, 146.83,  98.00    // G : G2 G2 D3 G2
  ],
  _LEAD: [
    220.00, 261.63, 329.63, 261.63,   // Am: A3 C4 E4 C4
    220.00, 261.63, 349.23, 261.63,   // F : A3 C4 F4 C4
    261.63, 329.63, 392.00, 329.63,   // C : C4 E4 G4 E4
    246.94, 293.66, 392.00, 293.66    // G : B3 D4 G4 D4
  ],

  startBGM: function () {
    if (!this.enabled || !this.ctx || this.bgmOn) return;
    if (!this._bgmGain) {
      this._bgmGain = this.ctx.createGain();
      this._bgmGain.gain.value = 0.34;          // 효과음(도트음 등)이 묻히지 않도록 한 단계 낮춤
      this._bgmGain.connect(this.ctx.destination);
    }
    this.bgmOn = true;
    this._step = 0;
    this._nextNoteTime = this.ctx.currentTime + 0.06;
    this._schedule();
  },
  stopBGM: function () {
    this.bgmOn = false;
    if (this._bgmTimer) { clearTimeout(this._bgmTimer); this._bgmTimer = 0; }
  },
  // 룩어헤드 스케줄러: 25ms마다 다음 ~120ms 구간의 노트를 정밀 예약
  _schedule: function () {
    if (!this.bgmOn || !this.ctx) return;
    var stepDur = 60 / this._tempo / 2;          // 8분음표 길이(초)
    while (this._nextNoteTime < this.ctx.currentTime + 0.12) {
      this._playStep(this._step, this._nextNoteTime, stepDur);
      this._nextNoteTime += stepDur;
      this._step = (this._step + 1) % 16;
    }
    var self = this;
    this._bgmTimer = setTimeout(function () { self._schedule(); }, 25);
  },
  _voice: function (freq, t, dur, type, vol, attack) {
    var o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    o.connect(g); g.connect(this._bgmGain);
    var a = attack || 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  },
  _hat: function (t, dur, vol) {
    var sr = this.ctx.sampleRate, n = Math.floor(sr * dur);
    var buf = this.ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    var src = this.ctx.createBufferSource(); src.buffer = buf;
    var g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(this._bgmGain);
    src.start(t);
  },
  _playStep: function (step, t, stepDur) {
    // 베이스: 매 스텝, 약간 스타카토
    this._voice(this._BASS[step], t, stepDur * 0.92, 'square', 0.085);
    // 리드 아르페지오: 매 스텝, 짧고 밝게
    this._voice(this._LEAD[step], t, stepDur * 0.55, 'square', 0.05);
    // 하이햇: 8분음표 뒷박(홀수 스텝)에 가볍게
    if (step % 2 === 1) this._hat(t, 0.03, 0.025);
  }
};
Sound.load();
