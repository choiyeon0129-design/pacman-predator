/* =========================================================================
   game.js — 상태머신 + 루프 + 렌더(HUD/오버레이) + 점수/목숨/스테이지/과일
   상태: title | ready | play | dying | clear | ending | gameover
   ========================================================================= */

'use strict';

var READY_TIME = 2.0;
var DEATH_TIME = 1.6;
var CLEAR_TIME = 1.4;
var FRIGHT_FLASH_AT = 2.0; // 남은 겁먹음 시간이 이 값 이하일 때 점멸

function Game(canvas) {
  this.canvas = canvas;
  this.ctx = canvas.getContext('2d');

  this.pacman = new Pacman(null);
  this.ghosts = {
    blinky: new Ghost(null, 'blinky'),
    pinky:  new Ghost(null, 'pinky'),
    inky:   new Ghost(null, 'inky'),
    clyde:  new Ghost(null, 'clyde')
  };
  this.ghostList = [this.ghosts.blinky, this.ghosts.pinky, this.ghosts.inky, this.ghosts.clyde];
  for (var i = 0; i < this.ghostList.length; i++) this.ghostList[i].game = this;

  // 시간제 기록(초). 낮을수록 좋음. 1라운드부터 끝까지 완주했을 때만 갱신.
  this.bestTime = null;
  try { var b = localStorage.getItem('pac_best_time'); if (b !== null && b !== '') this.bestTime = parseFloat(b); } catch (e) {}

  this.state = 'title';
  this.blinkT = 0; this.flashClock = 0; this.stateTimer = 0;
  this.lastEat = null;
  this.elapsed = 0;      // 이번 플레이 누적 시간(초)

  this.tickBound = this.tick.bind(this);
}

Game.prototype.start = function () {
  this.last = performance.now();
  requestAnimationFrame(this.tickBound);
};

// ---- 게임/스테이지 셋업 ----------------------------------------------------
Game.prototype.startGame = function (startStage) {
  this.lives = START_LIVES;     // 전 라운드 공유(라운드마다 초기화하지 않음) — 사과로만 추가
  this.elapsed = 0;             // 시간제 기록용 누적 시간 리셋
  // 시작 라운드(0-based). 라운드 점프 버튼에서 임의 라운드로 시작 가능.
  this.stageIndex = clamp(startStage | 0, 0, STAGES.length - 1);
  // 1라운드부터 완주한 기록만 베스트타임 갱신 대상(중간 라운드 시작은 연습용)
  this.fullRun = (this.stageIndex === 0);
  this.loadStage();
};

Game.prototype.loadStage = function () {
  this.stage = STAGES[this.stageIndex];
  var def = MAZE_DEFS[this.stage.mazeKey || 'full'];
  applyMazeGeometry(def);          // 격자·오프셋·좌표를 이 라운드 규격으로 교체(캔버스 고정)
  this.maze = new Maze(def.rows);
  this._bgCache = null;            // 배경 캐시는 공통이지만 안전하게 무효화
  if (DEBUG) this.maze.validate('stage' + (this.stageIndex + 1) + '/' + (this.stage.mazeKey || 'full'));

  // 라운드별 활성 유령(예: 1라운드는 2마리). 나머지는 등장하지 않음.
  this.activeGhostNames = this.stage.ghosts || ['blinky', 'pinky', 'inky', 'clyde'];
  this.ghostList = this.activeGhostNames.map(function (n) { return this.ghosts[n]; }, this);

  // 액터에 현재 미로 연결 + 리셋
  this.pacman.maze = this.maze; this.pacman.respawn();
  for (var i = 0; i < this.ghostList.length; i++) {
    this.ghostList[i].maze = this.maze;
    this.ghostList[i].respawn();
  }

  // 모드 스케줄
  this.phase = 0;
  this.globalMode = SCATTER_CHASE[0].mode;
  this.modeTimer = SCATTER_CHASE[0].t;
  this.frightTimer = 0;
  this.ghostEatChain = 0;

  // 집 출발 카운터
  this.release = this.stage.release;
  this.dotsEatenThisLife = 0;
  this.forceTimer = 0;
  this.releaseDue();   // 핑키(limit 0) 즉시 출발

  // 사과(생명 +1) — 사과 허용 라운드(stage.apple)에서만, 라운드당 한 번 랜덤 시점·랜덤 타일 등장.
  // 비허용 라운드(1·2라운드)는 처음부터 'done'으로 두어 등장하지 않음.
  this.roundTime = 0;
  this.apple = {
    state: this.stage.apple ? 'waiting' : 'done',   // waiting → active → done
    spawnAt: APPLE_SPAWN_MIN + Math.random() * (APPLE_SPAWN_MAX - APPLE_SPAWN_MIN),
    timer: 0, col: 0, row: 0
  };

  this.lastEat = null;
  this.state = 'ready';
  this.stateTimer = 0;
  Sound.ready();
};

Game.prototype.respawnAfterDeath = function () {
  this.pacman.respawn();
  for (var i = 0; i < this.ghostList.length; i++) this.ghostList[i].respawn();
  this.phase = 0;
  this.globalMode = SCATTER_CHASE[0].mode;
  this.modeTimer = SCATTER_CHASE[0].t;
  this.frightTimer = 0;
  this.ghostEatChain = 0;
  this.dotsEatenThisLife = 0;
  this.forceTimer = 0;
  // 사과 등장 스케줄(roundTime/apple)은 유지 — 죽어도 그 라운드의 사과 기회는 이어짐
  this.releaseDue();
  this.state = 'ready';
  this.stateTimer = 0;
  Sound.ready();
};

// ---- 집 출발 제어 ----------------------------------------------------------
Game.prototype.releaseDue = function () {
  var order = ['pinky', 'inky', 'clyde'];
  for (var i = 0; i < order.length; i++) {
    if (this.activeGhostNames.indexOf(order[i]) < 0) continue;   // 비활성 유령 제외
    var g = this.ghosts[order[i]];
    if (g.state === 'home' && this.dotsEatenThisLife >= (this.release[order[i]] || 0)) g.release();
  }
};
Game.prototype.releaseNextHome = function () {
  var order = ['pinky', 'inky', 'clyde'];
  for (var i = 0; i < order.length; i++) {
    if (this.activeGhostNames.indexOf(order[i]) < 0) continue;   // 비활성 유령 제외
    if (this.ghosts[order[i]].state === 'home') { this.ghosts[order[i]].release(); return; }
  }
};

// ---- 시간제 기록 -----------------------------------------------------------
// 완주(전 라운드 클리어) 시, 1라운드부터 시작한 기록만 베스트타임 갱신.
Game.prototype.commitTime = function () {
  if (this.fullRun && (this.bestTime === null || this.elapsed < this.bestTime)) {
    this.bestTime = this.elapsed;
    try { localStorage.setItem('pac_best_time', String(this.bestTime)); } catch (e) {}
  }
};

// 시간 포맷: M:SS.d
function fmtTime(sec) {
  sec = Math.max(0, sec || 0);
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);
  var d = Math.floor((sec * 10) % 10);
  return m + ':' + (s < 10 ? '0' : '') + s + '.' + d;
}

// ---- 겁먹음 ----------------------------------------------------------------
Game.prototype.startFright = function () {
  if (this.stage.frightTime > 0) {
    this.frightTimer = this.stage.frightTime;
    this.ghostEatChain = 0;
    for (var i = 0; i < this.ghostList.length; i++) this.ghostList[i].setFrightened(true);
  } else {
    for (var j = 0; j < this.ghostList.length; j++) this.ghostList[j].reverseOnModeChange();
  }
};

// ---- 메인 루프 -------------------------------------------------------------
Game.prototype.tick = function (now) {
  var dt = (now - this.last) / 1000; this.last = now;
  if (dt > 0.05) dt = 0.05;          // 탭 비활성 등으로 인한 큰 점프 방지
  this.blinkT += dt; this.flashClock += dt * 6;
  this.update(dt);
  this.render();
  requestAnimationFrame(this.tickBound);
};

Game.prototype.update = function (dt) {
  // 사운드 버튼: 모든 화면 공통. 상태별 탭 처리(시작/타이틀 복귀 등)보다 먼저 가로챔.
  var pk = Input.peekTap();
  if (pk && !pk.key && this._inSoundButton(pk.x, pk.y)) {
    Input.consumeTap();
    Sound.unlock();
    Sound.toggle();   // 끄면 BGM 정지 / 켜면 다음 프레임에 play 상태에서 자동 재생
  }

  // 배경음악은 플레이 중에만(타이틀/READY/죽음/클리어/게임오버에서는 정지)
  if (this.state === 'play') Sound.startBGM(); else Sound.stopBGM();
  switch (this.state) {
    case 'title':
      var tt = Input.consumeTap();
      if (tt) {
        if (tt.key || this._inStartButton(tt.x, tt.y)) this.startGame(0);
      }
      break;

    case 'ready':
      var prevCd = Math.ceil(READY_TIME - this.stateTimer);
      this.stateTimer += dt;
      var curCd = Math.ceil(READY_TIME - this.stateTimer);
      if (curCd < prevCd && curCd >= 1) Sound.ready();   // 카운트다운 틱(2→1 전환)
      if (this.stateTimer >= READY_TIME) { this.state = 'play'; }
      break;

    case 'play':
      this.updatePlay(dt);
      break;

    case 'dying':
      this.stateTimer += dt;
      if (this.stateTimer >= DEATH_TIME) {
        this.lives--;
        if (this.lives <= 0) { this.state = 'gameover'; }
        else this.respawnAfterDeath();
      }
      break;

    case 'clear':
      this.stateTimer += dt;
      if (this.stateTimer >= CLEAR_TIME) {
        this.stageIndex++;
        if (this.stageIndex >= STAGES.length) { this.state = 'ending'; this.commitTime(); }
        else this.loadStage();
      }
      break;

    case 'ending':
    case 'gameover':
      if (Input.consumeTap()) { this.state = 'title'; }
      break;
  }
};

Game.prototype.updatePlay = function (dt) {
  Input.consumeTap(); // 플레이 중 탭 소비(잔여 탭이 다음 화면에 새지 않도록)

  // 시간제 기록: 실제 플레이 중에만 누적
  this.elapsed += dt;
  this.roundTime += dt;

  // 모드 스케줄(겁먹음 중엔 정지)
  if (this.frightTimer <= 0) {
    this.modeTimer -= dt;
    if (this.modeTimer <= 0 && this.phase < SCATTER_CHASE.length - 1) {
      this.phase++;
      this.globalMode = SCATTER_CHASE[this.phase].mode;
      this.modeTimer = SCATTER_CHASE[this.phase].t;
      for (var i = 0; i < this.ghostList.length; i++) this.ghostList[i].reverseOnModeChange();
    }
  } else {
    this.frightTimer -= dt;
    if (this.frightTimer <= 0) {
      this.frightTimer = 0;
      for (var j = 0; j < this.ghostList.length; j++) this.ghostList[j].setFrightened(false);
    }
  }

  // 팩맨 (속도는 스테이지/겁먹음 상태에 따라 매 프레임 설정)
  this.pacman.speed = BASE_SPEED * TILE * (this.frightTimer > 0 ? this.stage.frightPac : this.stage.pac);
  this.pacman.setWant(Input.dir);
  this.pacman.update(dt);

  // 도트 섭취
  var t = this.pacman.tile();
  var v = this.maze.eat(t.col, t.row);
  if (v === 1) { Sound.dot(); this.onDotEaten(); }
  else if (v === 2) { Sound.pellet(); this.onDotEaten(); this.startFright(); }
  if (this.maze.remaining <= 0) { this.stageClear(); return; }

  // 집 출발(강제 타이머)
  this.forceTimer += dt;
  if (this.forceTimer >= 4) { this.forceTimer = 0; this.releaseNextHome(); }

  // 고스트
  for (var k = 0; k < this.ghostList.length; k++) this.ghostList[k].update(dt);

  // 사과(생명 +1)
  this.updateApple(dt);

  // 충돌
  this.checkCollisions();

  // 떠다니는 점수 표시 감쇠
  if (this.lastEat) { this.lastEat.t -= dt; if (this.lastEat.t <= 0) this.lastEat = null; }
};

Game.prototype.onDotEaten = function () {
  this.forceTimer = 0;
  this.dotsEatenThisLife++;
  this.releaseDue();
};

// 라운드당 한 번: 랜덤 시점에 도달 가능한 랜덤 타일에 사과 등장(10초). 먹으면 생명 +1.
Game.prototype.updateApple = function (dt) {
  var a = this.apple;
  if (a.state === 'waiting') {
    if (this.roundTime >= a.spawnAt) this.spawnApple();
    return;
  }
  if (a.state !== 'active') return;

  a.timer -= dt;
  if (a.timer <= 0) { a.state = 'done'; return; }   // 10초 지나면 사라짐(이번 라운드 종료)

  var ac = tileCenter(a.col, a.row);
  var dx = this.pacman.x - ac.x, dy = this.pacman.y - ac.y;
  if (dx * dx + dy * dy < (TILE * 0.6) * (TILE * 0.6)) {
    this.lives++;
    a.state = 'done';
    this.lastEat = { x: ac.x, y: ac.y, txt: '생명 +1', t: 1.4 };
    Sound.extra();
  }
};

Game.prototype.spawnApple = function () {
  var tiles = this.maze.reachableTiles(PACMAN_START.col, PACMAN_START.row);
  var pt = this.pacman.tile();
  // 팩맨에서 너무 가깝지 않은 타일 우선(맨해튼 거리 > 4)
  var far = tiles.filter(function (t) { return Math.abs(t.c - pt.col) + Math.abs(t.r - pt.row) > 4; });
  var pool = far.length ? far : tiles;
  var pick = pool[Math.floor(Math.random() * pool.length)] || { c: PACMAN_START.col, r: PACMAN_START.row };
  this.apple.col = pick.c;
  this.apple.row = pick.r;
  this.apple.state = 'active';
  this.apple.timer = APPLE_LIFETIME;
};

Game.prototype.checkCollisions = function () {
  var pac = this.pacman;
  var thr = (TILE * 0.5) * (TILE * 0.5);
  for (var i = 0; i < this.ghostList.length; i++) {
    var g = this.ghostList[i];
    var dx = g.x - pac.x, dy = g.y - pac.y;
    if (dx * dx + dy * dy < thr) {
      if (g.frightened) {
        this.ghostEatChain++;
        g.getEaten();
        Sound.eatGhost();
      } else if (g.state === 'normal') {
        this.pacDie();
        return;
      }
    }
  }
};

Game.prototype.pacDie = function () {
  this.state = 'dying';
  this.stateTimer = 0;
  Sound.death();
};

Game.prototype.stageClear = function () {
  if (this.apple) this.apple.state = 'done';
  this.state = 'clear';
  this.stateTimer = 0;
};

/* =========================================================================
   렌더링
   ========================================================================= */
Game.prototype.text = function (s, x, y, size, color, align) {
  var ctx = this.ctx;
  ctx.font = size + 'px "Puzzle Sans", "Courier New", monospace';
  ctx.fillStyle = color || COLOR.text;
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
};

Game.prototype.drawBackground = function () {
  var ctx = this.ctx;
  var img = Assets.get('map');   // 게임 맵 배경(map.png)
  if (!img) { ctx.fillStyle = COLOR.bg; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); return; }
  if (!this._bgCache) {
    var off = document.createElement('canvas');
    off.width = CANVAS_W; off.height = CANVAS_H;
    var o = off.getContext('2d');
    var s = Math.max(CANVAS_W / img.naturalWidth, CANVAS_H / img.naturalHeight);
    var w = img.naturalWidth * s, h = img.naturalHeight * s;
    o.drawImage(img, (CANVAS_W - w) / 2, (CANVAS_H - h) / 2, w, h);
    o.fillStyle = 'rgba(10,6,28,0.26)'; o.fillRect(0, 0, CANVAS_W, CANVAS_H); // 가독성용 살짝 어둡게(map2는 일러스트라 약하게)
    this._bgCache = off;
  }
  ctx.drawImage(this._bgCache, 0, 0);
};

Game.prototype.render = function () {
  var ctx = this.ctx;
  this.drawBackground();

  if (this.state === 'title') { this.renderTitle(); this.drawSoundButton(ctx); return; }
  if (this.state === 'gameover' || this.state === 'ending') { this.renderEndScreen(); this.drawSoundButton(ctx); return; } // 종료 화면: 미로 없음

  this.renderHUD();

  // 미로
  var pelletOn = (Math.floor(this.blinkT * 5) % 2 === 0);
  // 클리어 점멸 연출
  if (this.state === 'clear' && Math.floor(this.stateTimer * 6) % 2 === 0) {
    // 점멸: 벽을 흰색으로
    this.maze.drawWallsTint(ctx, '#ffffff');
  } else {
    this.maze.drawWalls(ctx);
  }
  this.maze.drawDots(ctx, pelletOn);

  // 사과(생명 +1) — 등장 중 표시. 마지막 3초는 점멸.
  if (this.apple && this.apple.state === 'active') {
    var blink = (this.apple.timer > 3) || (Math.floor(this.blinkT * 6) % 2 === 0);
    if (blink) this.drawFruit(ctx, tileCenter(this.apple.col, this.apple.row), APPLE_COLOR, 10);
  }

  // 액터
  if (this.state === 'dying') {
    this.pacman.drawDeath(ctx, this.stateTimer / DEATH_TIME);
  } else {
    this.pacman.draw(ctx);
    var flashOn = (this.frightTimer > 0 && this.frightTimer <= FRIGHT_FLASH_AT && (Math.floor(this.flashClock) % 2 === 0));
    for (var i = 0; i < this.ghostList.length; i++) this.ghostList[i].draw(ctx, flashOn);
  }

  // 떠다니는 알림(사과: 생명 +1)
  if (this.lastEat) this.text(this.lastEat.txt || '', this.lastEat.x, this.lastEat.y, 22, '#7dff9a');

  // D-pad(모바일/마우스)
  this.drawDpad(ctx);

  // 오버레이
  var cx = CANVAS_W / 2, midY = OFFSET_Y + 17 * TILE; // 집 아래 라인
  if (this.state === 'ready') {
    this.text('READY!', cx, midY, 32, COLOR.ready);
    var cd = Math.ceil(READY_TIME - this.stateTimer);   // 2 → 1 카운트다운
    if (cd >= 1) this.text(String(cd), cx, midY + 56, 64, COLOR.accent);
  }

  this.drawSoundButton(ctx);
};

Game.prototype.renderHUD = function () {
  // 상단: 현재 시간 / 베스트타임 / 스테이지 (시간제 기록)
  this.text('TIME', 90, 40, 22, COLOR.text, 'center');
  this.text(fmtTime(this.elapsed), 90, 74, 26, COLOR.text, 'center');
  this.text('BEST TIME', CANVAS_W / 2, 40, 22, COLOR.text, 'center');
  this.text(this.bestTime !== null ? fmtTime(this.bestTime) : '--:--', CANVAS_W / 2, 74, 26, COLOR.text, 'center');
  this.text('STAGE ' + (this.stageIndex + 1) + '/' + STAGES.length, CANVAS_W - 110, 57, 20, COLOR.textDim, 'center');

  // 하단 목숨 아이콘(예비 목숨 = lives-1)
  var y = OFFSET_Y + MAZE_H + 28;
  var reserves = Math.max(0, this.lives - 1);
  for (var i = 0; i < reserves; i++) {
    var lx = 40 + i * 40;
    this.ctx.save(); this.ctx.translate(lx, y); this.ctx.fillStyle = COLOR.pacman;
    this.ctx.beginPath(); this.ctx.moveTo(0, 0);
    this.ctx.arc(0, 0, 14, Math.PI * 0.78, Math.PI * 1.22, true); // 입 왼쪽
    this.ctx.closePath(); this.ctx.fill(); this.ctx.restore();
  }
};

Game.prototype.drawFruit = function (ctx, p, color, rad) {
  var r = rad || 9;
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
  ctx.strokeStyle = '#6b3b12'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r * 0.5, p.y - r * 1.6); ctx.stroke();
  ctx.fillStyle = '#3aa83a';
  ctx.beginPath(); ctx.ellipse(p.x + r * 0.55, p.y - r * 1.3, r * 0.4, r * 0.22, -0.6, 0, 7); ctx.fill();
  ctx.restore();
};

Game.prototype.drawDpad = function (ctx) {
  if (!IS_TOUCH || !DPAD) return; // PC는 D-pad 미표시(키보드 사용)
  var btns = [['up', DIR.UP], ['down', DIR.DOWN], ['left', DIR.LEFT], ['right', DIR.RIGHT]];
  ctx.save();
  for (var i = 0; i < btns.length; i++) {
    var R = DPAD[btns[i][0]];
    var on = (Input.dpadDir === btns[i][1]);
    roundRectPath(ctx, R.x, R.y, R.w, R.h, 12);
    ctx.fillStyle = on ? 'rgba(255,226,77,0.35)' : 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.stroke();
    // 화살표
    ctx.fillStyle = on ? COLOR.ready : 'rgba(255,255,255,0.5)';
    var cx = R.x + R.w / 2, cy = R.y + R.h / 2, a = 13, d = btns[i][1];
    ctx.beginPath();
    ctx.moveTo(cx + d.x * a, cy + d.y * a);
    ctx.lineTo(cx + d.x * -a + d.y * a, cy + d.y * -a + d.x * a);
    ctx.lineTo(cx + d.x * -a - d.y * a, cy + d.y * -a - d.x * a);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
};

// ---- 사운드 on/off 버튼(우상단, 전 화면 공통) -----------------------------
Game.prototype.soundButtonRect = function () {
  var s = 46;
  return { x: CANVAS_W - s - 14, y: 14, w: s, h: s };
};
Game.prototype._inSoundButton = function (x, y) {
  var b = this.soundButtonRect();
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
};
Game.prototype.drawSoundButton = function (ctx) {
  var b = this.soundButtonRect();
  var on = Sound.enabled;
  ctx.save();
  // 버튼 배경
  roundRectPath(ctx, b.x, b.y, b.w, b.h, 12);
  ctx.fillStyle = 'rgba(20,12,44,0.55)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.stroke();

  var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  var col = on ? COLOR.text : COLOR.textDim;
  ctx.translate(cx - 4, cy);   // 스피커를 살짝 왼쪽으로(파동/X 공간 확보)

  // 스피커 본체(사각 + 원뿔)
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(-9, -4); ctx.lineTo(-3, -4); ctx.lineTo(3, -10);
  ctx.lineTo(3, 10);  ctx.lineTo(-3, 4);  ctx.lineTo(-9, 4);
  ctx.closePath(); ctx.fill();

  if (on) {
    // 음파 두 줄
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(5, 0, 6, -0.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(5, 0, 11, -0.95, 0.95); ctx.stroke();
  } else {
    // 음소거 표시(빨간 X)
    ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(7, -7); ctx.lineTo(17, 7);
    ctx.moveTo(17, -7); ctx.lineTo(7, 7);
    ctx.stroke();
  }
  ctx.restore();
};

Game.prototype.startButtonRect = function () {
  var w = 300, h = 86;
  return { x: (CANVAS_W - w) / 2, y: Math.round(CANVAS_H * 0.56), w: w, h: h };
};

Game.prototype._inStartButton = function (x, y) {
  var b = this.startButtonRect();
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
};

Game.prototype.renderTitle = function () {
  var ctx = this.ctx, cx = CANVAS_W / 2, ch = CANVAS_H;
  this.text('BEST TIME', cx, ch * 0.11, 22, COLOR.textDim);
  this.text(this.bestTime !== null ? fmtTime(this.bestTime) : '기록 없음', cx, ch * 0.155, 28, COLOR.text);

  // 게임 제목
  this.text('포식자', cx, ch * 0.36, 116, COLOR.accent);
  this.text('3라운드 빠르게 통과해 최고 기록 세우세요!', cx, ch * 0.44, 22, COLOR.textDim);

  // 시작하기 버튼(3D 느낌)
  var b = this.startButtonRect();
  var hl = (Math.floor(this.blinkT * 1.6) % 2 === 0);
  roundRectPath(ctx, b.x, b.y + 5, b.w, b.h, 18);
  ctx.fillStyle = '#9a6b00'; ctx.fill();                  // 아래 그림자(골드 다크)
  roundRectPath(ctx, b.x, b.y, b.w, b.h, 18);
  ctx.fillStyle = hl ? '#ffe27a' : COLOR.accent; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#fff7d6'; ctx.stroke();
  this.text('시작하기', cx, b.y + b.h / 2, 36, '#3a2466');  // 골드 버튼 위 진보라 텍스트

  var tipY = b.y + b.h + 64;
  this.text(IS_TOUCH ? '이동: 스와이프 · 화면 D-pad' : '이동: 방향키 (←↑↓→) / WASD', cx, tipY, 20, COLOR.textDim);
  this.text('3라운드 사과 1회 등장, 먹으면 생명 +1', cx, tipY + 32, 20, COLOR.textDim);
};

// 게임 종료(게임오버/엔딩) 화면 — 미로 없이 단색 배경 + 텍스트
Game.prototype.renderEndScreen = function () {
  var cx = CANVAS_W / 2, cy = CANVAS_H * 0.40;
  if (this.state === 'gameover') {
    this.text('GAME OVER', cx, cy, 52, '#c0392b');
  } else {
    this.text('CONGRATULATIONS!', cx, cy - 24, 36, COLOR.accent);
    this.text('전 스테이지 클리어!', cx, cy + 22, 28, COLOR.text);
  }
  this.text('YOUR TIME   ' + fmtTime(this.elapsed), cx, cy + 96, 30, COLOR.text);
  this.text('BEST TIME   ' + (this.bestTime !== null ? fmtTime(this.bestTime) : '--:--'), cx, cy + 138, 22, COLOR.textDim);
  if (Math.floor(this.blinkT * 1.6) % 2 === 0) {
    this.text(IS_TOUCH ? '탭하여 타이틀로' : '스페이스 / 클릭으로 타이틀로', cx, cy + 200, 22, COLOR.text);
  }
};
