/* =========================================================================
   ghost.js — 고스트 4종(고유 AI) / 스캐터·체이스 / 겁먹음 / 눈 복귀 / 집 출입
   상태: 'home'(대기) | 'leaving'(나가는 중) | 'normal'(스캐터/체이스) | 'eyes'(복귀)
   frightened 는 normal 위에 덧씌워지는 플래그.
   ========================================================================= */

'use strict';

function Ghost(maze, name) {
  Actor.call(this, maze);
  this.name = name;
  this.color = COLOR.ghost[name];
  this.state = 'home';
  this.frightened = false;
  this.entering = false;     // eyes 하위 단계(집으로 들어가는 중)
  this.canDoor = false;
  this.reviveTimer = 0;      // >0: 먹힌 뒤 부활까지 남은 시간(초)
  this.targetTile = { col: 0, row: 0 };
  this.bobT = 0;
  this.startTile = { col: GHOST_START[name].col, row: GHOST_START[name].row };
  this.game = null;
}
Ghost.prototype = Object.create(Actor.prototype);
Ghost.prototype.constructor = Ghost;

Ghost.prototype.respawn = function () {
  var s = GHOST_START[this.name];
  this.startTile = { col: s.col, row: s.row };   // 라운드별 미로 규격에 맞춰 갱신(집 출발 기준점)
  this.frightened = false; this.entering = false; this.bobT = 0; this.reviveTimer = 0;
  if (s.inHouse) {
    this.state = 'home'; this.canDoor = false;
    this.setTile(s.col, s.row); this.dir = s.dir;
  } else {
    this.state = 'normal'; this.canDoor = false;
    this.reset(s.col, s.row, s.dir);
  }
};

Ghost.prototype.release = function () {
  if (this.state !== 'home') return;
  this.setTile(this.startTile.col, this.startTile.row);
  this.state = 'leaving'; this.canDoor = true; this.dir = DIR.UP;
  this.target = { col: this.startTile.col, row: this.startTile.row - 1 };
};

Ghost.prototype.getEaten = function () {
  this.state = 'eyes'; this.frightened = false; this.entering = false; this.canDoor = true;
  this.reviveTimer = GHOST_REVIVE_TIME;   // 집 도착 후 이 시간이 다 지나야 부활
};

Ghost.prototype.setFrightened = function (on) {
  if (this.state !== 'normal') return;          // 집/나가는중/눈 상태는 영향 없음
  if (on && !this.frightened) this.reverseNow(); // 발동 시 즉시 반전
  this.frightened = on;
};

// 모드 전환(스캐터↔체이스) 시 즉시 반전
Ghost.prototype.reverseOnModeChange = function () {
  if (this.state === 'normal' && !this.frightened) this.reverseNow();
};

// ---- 타깃 산정 ----
Ghost.prototype.computeTarget = function () {
  if (this.game.globalMode === 'scatter') { this.targetTile = SCATTER[this.name]; return; }
  var pac = this.game.pacman;
  var pt = pac.tile();
  var pd = (pac.dir === DIR.NONE) ? DIR.LEFT : pac.dir;

  if (this.name === 'blinky') {
    this.targetTile = { col: pt.col, row: pt.row };
  } else if (this.name === 'pinky') {
    var tc = pt.col + 4 * pd.x, tr = pt.row + 4 * pd.y;
    if (pd === DIR.UP && PINKY_UP_BUG) tc -= 4;     // 원작 오버플로 버그
    this.targetTile = { col: tc, row: tr };
  } else if (this.name === 'inky') {
    var pc = pt.col + 2 * pd.x, pr = pt.row + 2 * pd.y;
    if (pd === DIR.UP && PINKY_UP_BUG) pc -= 2;
    var b = this.game.ghosts.blinky.tile();
    this.targetTile = { col: b.col + 2 * (pc - b.col), row: b.row + 2 * (pr - b.row) };
  } else { // clyde
    var me = this.tile();
    var dc = pt.col - me.col, dr = pt.row - me.row;
    if (dc * dc + dr * dr > 64) this.targetTile = { col: pt.col, row: pt.row };
    else this.targetTile = SCATTER.clyde;
  }
};

// ---- 방향 선택(그리디: 타깃까지 직선거리 최소, 역주행 금지) ----
Ghost.prototype.greedy = function (col, row, incoming) {
  var order = [DIR.UP, DIR.LEFT, DIR.DOWN, DIR.RIGHT]; // 동점 우선순위
  var best = null, bd = Infinity;
  for (var i = 0; i < 4; i++) {
    var d = order[i];
    if (incoming !== DIR.NONE && d === opposite(incoming)) continue;
    var nc = col + d.x, nr = row + d.y;
    if (nc < 0 && this.maze.tunnelRows[nr]) nc = COLS - 1;
    else if (nc >= COLS && this.maze.tunnelRows[nr]) nc = 0;
    if (this.maze.isWall(nc, nr, this.canDoor)) continue;
    var ex = nc - this.targetTile.col, ey = nr - this.targetTile.row;
    var dist = ex * ex + ey * ey;
    if (dist < bd) { bd = dist; best = d; }
  }
  if (best) return best;
  if (incoming !== DIR.NONE) {
    var rv = opposite(incoming);
    if (!this.maze.isWall(col + rv.x, row + rv.y, this.canDoor)) return rv;
  }
  return DIR.NONE;
};

Ghost.prototype.randomDir = function (col, row, incoming) {
  var order = [DIR.UP, DIR.LEFT, DIR.DOWN, DIR.RIGHT];
  var cand = [];
  for (var i = 0; i < 4; i++) {
    var d = order[i];
    if (incoming !== DIR.NONE && d === opposite(incoming)) continue;
    var nc = col + d.x, nr = row + d.y;
    if (nc < 0 && this.maze.tunnelRows[nr]) nc = COLS - 1;
    else if (nc >= COLS && this.maze.tunnelRows[nr]) nc = 0;
    if (this.maze.isWall(nc, nr, this.canDoor)) continue;
    cand.push(d);
  }
  if (cand.length) return cand[Math.floor(Math.random() * cand.length)];
  if (incoming !== DIR.NONE) {
    var rv = opposite(incoming);
    if (!this.maze.isWall(col + rv.x, row + rv.y, this.canDoor)) return rv;
  }
  return DIR.NONE;
};

Ghost.prototype.chooseDir = function (col, row, incoming) {
  if (this.state === 'leaving') {
    this.canDoor = true;
    if (col === GHOST_EXIT.col && row === GHOST_EXIT.row) {
      this.state = 'normal'; this.canDoor = false;
      this.frightened = this.game.frightTimer > 0;
      this.computeTarget();
      var d = this.greedy(col, row, DIR.NONE);
      return d || DIR.LEFT;
    }
    this.targetTile = GHOST_EXIT;
    return this.greedy(col, row, incoming);
  }

  if (this.state === 'eyes') {
    this.canDoor = true;
    if (!this.entering) {
      if (col === GHOST_EXIT.col && row === GHOST_EXIT.row) {
        this.entering = true; this.targetTile = GHOST_HOME; return DIR.DOWN;
      }
      this.targetTile = GHOST_EXIT;
      return this.greedy(col, row, incoming);
    } else {
      if (col === GHOST_HOME.col && row === GHOST_HOME.row) {
        this.entering = false;
        if (this.reviveTimer > 0) return DIR.NONE;   // 부활 시간이 다 지날 때까지 집에서 대기(눈 상태 유지)
        this.frightened = false;
        this.state = 'leaving'; this.canDoor = true;
        this.targetTile = GHOST_EXIT; return DIR.UP;
      }
      this.targetTile = GHOST_HOME;
      return this.greedy(col, row, incoming);
    }
  }

  // normal
  this.canDoor = false;
  if (this.frightened) return this.randomDir(col, row, incoming);
  this.computeTarget();
  return this.greedy(col, row, incoming);
};

Ghost.prototype.computeSpeed = function () {
  var st = this.game.stage;
  var base = BASE_SPEED * TILE;
  if (this.state === 'eyes') return base * 1.6;
  if (this.frightened) return base * st.frightGhost;
  var t = this.tile();
  if (this.state === 'normal' && this.maze.isTunnel(t.col, t.row)) return base * st.tunnel;
  var s = st.ghost;
  if (this.name === 'blinky' && this.state === 'normal') {
    if (this.maze.remaining <= st.elroy2) s = st.ghost + 0.10;
    else if (this.maze.remaining <= st.elroy1) s = st.ghost + 0.05;
  }
  return base * s;
};

Ghost.prototype.update = function (dt) {
  if (this.reviveTimer > 0) this.reviveTimer -= dt;   // 눈 상태 진입 후 부활 카운트다운
  if (this.state === 'home') {
    this.bobT += dt;
    var c = tileCenter(this.startTile.col, this.startTile.row);
    this.x = c.x; this.y = c.y + Math.sin(this.bobT * 4) * 4;
    return;
  }
  this.speed = this.computeSpeed();
  if (this.state === 'normal' && !this.frightened) this.computeTarget();
  var self = this;
  this.step(dt, function (col, row, incoming) { return self.chooseDir(col, row, incoming); });
};

// ---- 렌더 ------------------------------------------------------------------
function ghostBodyPath(ctx, r) {
  var top = -r * 0.2, bot = r * 0.85;
  ctx.beginPath();
  ctx.arc(0, top, r, Math.PI, 0, false);
  ctx.lineTo(r, bot);
  var n = 3, w = (2 * r) / n;
  for (var i = 0; i < n; i++) {
    var cx = r - w * (i + 0.5);
    var ex = r - w * (i + 1);
    ctx.quadraticCurveTo(cx, bot + r * 0.22, ex, bot);
  }
  ctx.lineTo(-r, top);
  ctx.closePath();
}
function drawGhostBody(ctx, r) { ghostBodyPath(ctx, r); ctx.fill(); }

Ghost.prototype.drawEyes = function (ctx, r) {
  var ex = r * 0.36, ey = -r * 0.12, er = r * 0.30, pr = r * 0.15;
  var dx = this.dir.x * er * 0.45, dy = this.dir.y * er * 0.45;
  ctx.fillStyle = COLOR.eyes;
  ctx.beginPath(); ctx.arc(-ex, ey, er, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(ex, ey, er, 0, 7); ctx.fill();
  ctx.fillStyle = COLOR.eyePupil;
  ctx.beginPath(); ctx.arc(-ex + dx, ey + dy, pr, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(ex + dx, ey + dy, pr, 0, 7); ctx.fill();
};

Ghost.prototype.draw = function (ctx, flashOn) {
  var r = TILE * 0.72;
  ctx.save();
  ctx.translate(this.x, this.y);

  if (this.state === 'eyes') {
    this.drawEyes(ctx, r);
    ctx.restore();
    return;
  }

  if (this.frightened) {
    // 파워펠릿 섭취 시 데몬 변신: demon_5 스프라이트(없으면 벡터 폴백)
    var fimg = Assets.get('demon_5');
    if (fimg) {
      var fbase = r * 2.6;
      var fiw = fimg.naturalWidth || 1, fih = fimg.naturalHeight || 1;
      var fw = fbase, fh = fbase;
      if (fiw >= fih) fh = fbase * (fih / fiw); else fw = fbase * (fiw / fih);
      if (flashOn) ctx.globalAlpha = 0.45;   // 회복 임박 경고용 깜빡임
      ctx.drawImage(fimg, -fw / 2, -fh / 2, fw, fh);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = flashOn ? COLOR.frightFlash : COLOR.fright;
      drawGhostBody(ctx, r);
      // 겁먹은 표정
      var ec = flashOn ? '#c0392b' : '#fff';
      ctx.fillStyle = ec;
      ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.1, r * 0.11, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.1, r * 0.11, 0, 7); ctx.fill();
      ctx.strokeStyle = ec; ctx.lineWidth = 2;
      ctx.beginPath();
      var yy = r * 0.35, amp = r * 0.12, x0 = -r * 0.5;
      ctx.moveTo(x0, yy);
      for (var k = 1; k <= 6; k++) ctx.lineTo(x0 + k * (r / 3), yy + (k % 2 ? -amp : amp));
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // normal: 데몬 스프라이트(투명 PNG, 종횡비 유지), 없으면 벡터
  var img = Assets.get(GHOST_DEMON[this.name]);
  if (img) {
    var base = r * 2.6;
    var iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
    var w = base, h = base;
    if (iw >= ih) h = base * (ih / iw); else w = base * (iw / ih);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
  } else {
    ctx.fillStyle = this.color;
    drawGhostBody(ctx, r);
    this.drawEyes(ctx, r);
  }
  ctx.restore();
};
