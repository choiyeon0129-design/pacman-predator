/* =========================================================================
   pacman.js — 팩맨(입력 버퍼링 + 즉시 반전 + 입 애니메이션)
   ========================================================================= */

'use strict';

function Pacman(maze) {
  Actor.call(this, maze);
  this.want = DIR.NONE;
  this.mouth = 0;
}
Pacman.prototype = Object.create(Actor.prototype);
Pacman.prototype.constructor = Pacman;

Pacman.prototype.respawn = function () {
  this.reset(PACMAN_START.col, PACMAN_START.row, PACMAN_START.dir);
  this.want = PACMAN_START.dir;
  this.mouth = 0;
};

Pacman.prototype.setWant = function (d) { this.want = d; };

Pacman.prototype.update = function (dt) {
  // 진행 중 즉시 반전(반대 방향 입력)
  if (this.want !== DIR.NONE && this.dir !== DIR.NONE && this.want === opposite(this.dir)) {
    this.reverseNow();
  }
  // 코너링(입력 민감도): 교차로 중심 근처(TURN_TOLERANCE)면 직전/직후라도 회전 허용
  if (this.want !== DIR.NONE && this.want !== this.dir && this.want !== opposite(this.dir)) {
    var col = Math.round((this.x - OFFSET_X - TILE / 2) / TILE);
    var row = Math.round((this.y - OFFSET_Y - TILE / 2) / TILE);
    var tc = tileCenter(col, row);
    if (Math.abs(tc.x - this.x) + Math.abs(tc.y - this.y) <= TURN_TOLERANCE &&
        !this.maze.isWall(col + this.want.x, row + this.want.y, false)) {
      this.x = tc.x; this.y = tc.y;
      this.dir = this.want;
      this.target = { col: col + this.want.x, row: row + this.want.y };
    }
  }
  var self = this;
  this.step(dt, function (col, row, incoming) {
    if (self.want !== DIR.NONE && !self.maze.isWall(col + self.want.x, row + self.want.y, false)) return self.want;
    if (incoming !== DIR.NONE && !self.maze.isWall(col + incoming.x, row + incoming.y, false)) return incoming;
    return DIR.NONE;
  });
  if (this.dir !== DIR.NONE) this.mouth += dt * 11;
};

Pacman.prototype.draw = function (ctx) {
  var r = TILE * 0.72;
  var img = Assets.get('pacman');
  if (img) {
    // cha_1(투명 픽셀 PNG)을 진행 방향으로 회전. 종횡비 유지, 클리핑 불필요.
    var base = r * 2.5;
    var iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
    var w = base, h = base;
    if (iw >= ih) h = base * (ih / iw); else w = base * (iw / ih);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(dirAngle(this.dir === DIR.NONE ? DIR.LEFT : this.dir));
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return;
  }
  var open = Math.abs(Math.sin(this.mouth)) * 0.30; // 입 벌림(파이 비율)
  var base = dirAngle(this.dir === DIR.NONE ? DIR.LEFT : this.dir);
  ctx.save();
  ctx.translate(this.x, this.y);
  ctx.fillStyle = COLOR.pacman;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, base + open * Math.PI, base + (2 - open) * Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

// 사망 애니메이션(0..1 진행도) — 입이 점점 벌어지며 사라짐
Pacman.prototype.drawDeath = function (ctx, t) {
  var r = TILE * 0.72;
  var base = dirAngle(DIR.UP);
  var open = clamp(t, 0, 1) * 1.0; // 0→1 파이
  ctx.save();
  ctx.translate(this.x, this.y);
  ctx.fillStyle = COLOR.pacman;
  if (open < 0.999) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, base + open * Math.PI, base + (2 - open) * Math.PI);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
};
