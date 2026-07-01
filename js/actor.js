/* =========================================================================
   actor.js — 격자 이동 베이스(중심 도달 시 방향 결정 모델 + 터널 wrap)
   ========================================================================= */

'use strict';

function dirAngle(d) {
  if (d === DIR.RIGHT) return 0;
  if (d === DIR.DOWN) return Math.PI / 2;
  if (d === DIR.LEFT) return Math.PI;
  if (d === DIR.UP) return -Math.PI / 2;
  return 0;
}

function Actor(maze) {
  this.maze = maze;
  this.x = 0; this.y = 0;        // 픽셀 중심
  this.dir = DIR.NONE;
  this.target = { col: 0, row: 0 };
  this.speed = 0;                // px/sec
}

Actor.prototype.setTile = function (col, row) {
  var c = tileCenter(col, row);
  this.x = c.x; this.y = c.y;
};

Actor.prototype.tile = function () { return pixelToTile(this.x, this.y); };

Actor.prototype.reset = function (col, row, dir) {
  this.setTile(col, row);
  this.dir = dir || DIR.NONE;
  this.target = { col: col + this.dir.x, row: row + this.dir.y };
};

// 진행 중 즉시 반대 방향(팩맨 조작/고스트 모드전환)
Actor.prototype.reverseNow = function () {
  if (this.dir === DIR.NONE) return;
  this.dir = opposite(this.dir);
  this.target = { col: this.target.col + this.dir.x, row: this.target.row + this.dir.y };
};

// chooseDir(col,row,incoming) → 다음 DIR (DIR.NONE이면 정지)
Actor.prototype.step = function (dt, chooseDir) {
  var move = this.speed * dt;

  if (this.dir === DIR.NONE) {
    var ct = this.tile();
    var sd = chooseDir(ct.col, ct.row, DIR.NONE);
    if (sd && sd !== DIR.NONE) {
      this.dir = sd;
      this.target = { col: ct.col + sd.x, row: ct.row + sd.y };
    } else return;
  }

  var guard = 0;
  while (move > 1e-6 && guard++ < 2000) {
    var tc = tileCenter(this.target.col, this.target.row);
    var dx = tc.x - this.x, dy = tc.y - this.y;
    var dist = Math.abs(dx) + Math.abs(dy);  // 축 정렬이므로 맨해튼=유클리드

    if (dist > move) {
      this.x += this.dir.x * move;
      this.y += this.dir.y * move;
      move = 0;
    } else {
      this.x = tc.x; this.y = tc.y;
      move -= dist;
      var ac = this.target.col, ar = this.target.row;
      var nd = chooseDir(ac, ar, this.dir);
      if (!nd || nd === DIR.NONE) { this.dir = DIR.NONE; break; }

      var ncol = ac + nd.x, nrow = ar + nd.y;
      // 터널 wrap (방향 설정 시 픽셀 순간이동)
      if (this.maze.tunnelRows[ar]) {
        if (nd === DIR.LEFT && ac === 0) { this.x = tileCenter(COLS, ar).x; ncol = COLS - 1; }
        else if (nd === DIR.RIGHT && ac === COLS - 1) { this.x = tileCenter(-1, ar).x; ncol = 0; }
      }
      this.dir = nd;
      this.target = { col: ncol, row: nrow };
    }
  }
};
