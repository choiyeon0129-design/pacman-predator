/* =========================================================================
   input.js — 키보드(방향키/WASD) + 터치/마우스(스와이프 · 가상 D-pad · 탭)
   Input.dir : 래치된 희망 방향(릴리스해도 유지 — 팩맨은 계속 진행)
   Input.consumeTap() : 화면 전환용 1회성 탭/키 입력
   Input.dpadDir : 현재 D-pad로 눌린 방향(렌더 하이라이트용, 없으면 NONE)
   ========================================================================= */

'use strict';

var Input = {
  dir: DIR.NONE,
  dpadDir: DIR.NONE,
  _tap: false, _tapKey: false, _tapX: 0, _tapY: 0,
  _keys: [],
  _canvas: null,
  _downX: 0, _downY: 0, _dpadActive: false,

  init: function (canvas) {
    this._canvas = canvas;
    var self = this;

    function keyToDir(k) {
      switch (k) {
        case 'ArrowUp': case 'w': case 'W': return DIR.UP;
        case 'ArrowDown': case 's': case 'S': return DIR.DOWN;
        case 'ArrowLeft': case 'a': case 'A': return DIR.LEFT;
        case 'ArrowRight': case 'd': case 'D': return DIR.RIGHT;
      }
      return null;
    }
    window.addEventListener('keydown', function (e) {
      var d = keyToDir(e.key);
      if (d) {
        if (!e.repeat) {                       // 오토리핏 무시 → 눌린 키 스택의 최신값으로
          var idx = self._keys.indexOf(d); if (idx >= 0) self._keys.splice(idx, 1);
          self._keys.push(d);
          self.dir = d;
        }
        e.preventDefault();
      } else if (e.key === ' ' || e.key === 'Enter') {
        self._tap = true; self._tapKey = true; e.preventDefault();
      } else if (e.key === 'm' || e.key === 'M') {
        if (window.Sound) { Sound.unlock(); Sound.toggle(); }  // 음소거 토글
      }
      if (window.Sound) Sound.unlock();
    }, { passive: false });
    window.addEventListener('keyup', function (e) {
      var d = keyToDir(e.key);
      if (!d) return;
      var idx = self._keys.indexOf(d); if (idx >= 0) self._keys.splice(idx, 1);
      if (self._keys.length) self.dir = self._keys[self._keys.length - 1]; // 남은 눌린 키로 복귀
    });

    var opt = { passive: false };
    canvas.addEventListener('pointerdown', function (e) { self._onDown(e); }, opt);
    canvas.addEventListener('pointermove', function (e) { self._onMove(e); }, opt);
    canvas.addEventListener('pointerup', function (e) { self._onUp(e); }, opt);
    canvas.addEventListener('pointercancel', function (e) { self._dpadActive = false; self.dpadDir = DIR.NONE; }, opt);
  },

  _toLogical: function (e) {
    var r = this._canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (CANVAS_W / r.width),
      y: (e.clientY - r.top) * (CANVAS_H / r.height)
    };
  },

  _inRect: function (p, R) { return p.x >= R.x && p.x <= R.x + R.w && p.y >= R.y && p.y <= R.y + R.h; },

  _applyDpad: function (p) {
    if (this._inRect(p, DPAD.up)) { this.dir = DIR.UP; this.dpadDir = DIR.UP; }
    else if (this._inRect(p, DPAD.down)) { this.dir = DIR.DOWN; this.dpadDir = DIR.DOWN; }
    else if (this._inRect(p, DPAD.left)) { this.dir = DIR.LEFT; this.dpadDir = DIR.LEFT; }
    else if (this._inRect(p, DPAD.right)) { this.dir = DIR.RIGHT; this.dpadDir = DIR.RIGHT; }
    else this.dpadDir = DIR.NONE;
  },

  _inDpadArea: function (p) {
    if (!DPAD) return false; // PC(터치 아님) → D-pad 없음
    return p.x >= DPAD.cx - DPAD.s * 1.5 && p.x <= DPAD.cx + DPAD.s * 1.5 &&
           p.y >= DPAD.cy - DPAD.s * 1.5 && p.y <= DPAD.cy + DPAD.s * 1.5;
  },

  _onDown: function (e) {
    if (window.Sound) Sound.unlock();
    var p = this._toLogical(e);
    this._downX = p.x; this._downY = p.y;
    if (this._inDpadArea(p)) { this._dpadActive = true; this._applyDpad(p); }
    else this._dpadActive = false;
    e.preventDefault();
  },
  _onMove: function (e) {
    if (!this._dpadActive) return;
    this._applyDpad(this._toLogical(e));
    e.preventDefault();
  },
  _onUp: function (e) {
    var p = this._toLogical(e);
    if (this._dpadActive) { this._dpadActive = false; this.dpadDir = DIR.NONE; this._tap = true; this._tapKey = false; this._tapX = p.x; this._tapY = p.y; e.preventDefault(); return; }
    var dx = p.x - this._downX, dy = p.y - this._downY;
    if (Math.abs(dx) + Math.abs(dy) < 26) {
      this._tap = true; this._tapKey = false; this._tapX = p.x; this._tapY = p.y;  // 탭
    } else {                                  // 스와이프
      if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
      else this.dir = dy > 0 ? DIR.DOWN : DIR.UP;
    }
    e.preventDefault();
  },

  consumeTap: function () {
    if (!this._tap) return null;
    this._tap = false;
    return { key: this._tapKey, x: this._tapX, y: this._tapY };
  },

  // 소비하지 않고 현재 탭만 들여다봄(사운드 버튼처럼 상태별 처리보다 먼저 가로채야 할 때)
  peekTap: function () {
    if (!this._tap) return null;
    return { key: this._tapKey, x: this._tapX, y: this._tapY };
  }
};
