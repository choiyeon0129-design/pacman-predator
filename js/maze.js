/* =========================================================================
   maze.js — 미로 파싱 / 도트·펠릿 / 충돌(isWall) / 렌더 / 검증
   ========================================================================= */

'use strict';

function Maze(layout) {
  this.rows = layout.slice();          // 원본 문자열(정적 구조)
  this.dots = [];                      // 0 없음 / 1 도트 / 2 펠릿
  this.total = 0;
  this.remaining = 0;
  this.tunnelRows = {};

  for (var r = 0; r < ROWS; r++) {
    var line = this.rows[r] || '';
    var rowDots = [];
    for (var c = 0; c < COLS; c++) {
      var ch = line[c];
      if (ch === '.') { rowDots.push(1); this.total++; }
      else if (ch === 'o') { rowDots.push(2); this.total++; }
      else rowDots.push(0);
    }
    this.dots.push(rowDots);
    if (line[0] === ' ' && line[COLS - 1] === ' ') this.tunnelRows[r] = true;
  }
  this.remaining = this.total;
}

// 터널 wrap을 고려한 타일 문자
Maze.prototype.charAt = function (col, row) {
  if (row < 0 || row >= ROWS) return '#';
  if (col < 0 || col >= COLS) {
    return this.tunnelRows[row] ? ' ' : '#';
  }
  var ch = this.rows[row][col];
  return ch === undefined ? '#' : ch;
};

// 벽 여부. canDoor=true면 문('-') 통과 가능(고스트 집 출입).
Maze.prototype.isWall = function (col, row, canDoor) {
  var ch = this.charAt(col, row);
  if (ch === '#') return true;
  if (ch === '-') return !canDoor;
  return false;
};

Maze.prototype.isTunnel = function (col, row) {
  // 터널 행에서 화면 밖에 가까운 양 끝 구간(감속/wrap 처리용)
  if (!this.tunnelRows[row]) return false;
  return col < 6 || col >= COLS - 6;
};

Maze.prototype.dotAt = function (col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return 0;
  return this.dots[row][col];
};

Maze.prototype.eat = function (col, row) {
  var v = this.dotAt(col, row);
  if (v > 0) { this.dots[row][col] = 0; this.remaining--; }
  return v; // 0 없음 / 1 도트 / 2 펠릿
};

// 시작 타일에서 도달 가능한 길 타일 목록(문 통과 불가 → 고스트집 내부 제외).
// 사과를 팩맨이 실제로 먹을 수 있는 위치에만 배치하기 위해 사용.
Maze.prototype.reachableTiles = function (sc, sr) {
  var seen = {}, list = [];
  var stack = [{ c: sc, r: sr }];
  seen[sc + ',' + sr] = true;
  var dirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
  while (stack.length) {
    var t = stack.pop();
    list.push({ c: t.c, r: t.r });
    for (var i = 0; i < 4; i++) {
      var nc = t.c + dirs[i].x, nr = t.r + dirs[i].y;
      if (nc < 0 && this.tunnelRows[nr]) nc = COLS - 1;
      else if (nc >= COLS && this.tunnelRows[nr]) nc = 0;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (this.isWall(nc, nr, false)) continue;   // 문 통과 불가
      var k = nc + ',' + nr;
      if (seen[k]) continue;
      seen[k] = true;
      stack.push({ c: nc, r: nr });
    }
  }
  return list;
};

// ---- 검증: 행 길이/개수 + 도트 도달성(flood fill, 터널 wrap 포함) --------
Maze.prototype.validate = function (name) {
  var ok = true;
  var msgs = [];
  if (this.rows.length !== ROWS) { ok = false; msgs.push('행 수 ' + this.rows.length + ' (기대 ' + ROWS + ')'); }
  for (var r = 0; r < this.rows.length; r++) {
    if ((this.rows[r] || '').length !== COLS) {
      ok = false; msgs.push('행 ' + r + ' 길이 ' + (this.rows[r] || '').length + ' (기대 ' + COLS + ')');
    }
  }

  // flood fill (벽/문 제외, 터널 wrap)
  var seen = {};
  var startKey = PACMAN_START.col + ',' + PACMAN_START.row;
  var stack = [{ c: PACMAN_START.col, r: PACMAN_START.row }];
  seen[startKey] = true;
  var dirs = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];
  while (stack.length) {
    var t = stack.pop();
    for (var i = 0; i < 4; i++) {
      var nc = t.c + dirs[i].x, nr = t.r + dirs[i].y;
      // 터널 wrap
      if (nc < 0 && this.tunnelRows[nr]) nc = COLS - 1;
      else if (nc >= COLS && this.tunnelRows[nr]) nc = 0;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      if (this.isWall(nc, nr, false)) continue;   // 문은 통과 불가로 간주
      var k = nc + ',' + nr;
      if (seen[k]) continue;
      seen[k] = true;
      stack.push({ c: nc, r: nr });
    }
  }

  var unreachable = 0;
  for (var rr = 0; rr < ROWS; rr++) {
    for (var cc = 0; cc < COLS; cc++) {
      if (this.dots[rr][cc] > 0 && !seen[cc + ',' + rr]) {
        unreachable++;
        if (unreachable <= 8) msgs.push('도달불가 도트 (' + cc + ',' + rr + ')');
      }
    }
  }
  if (unreachable > 0) ok = false;

  if (DEBUG) {
    if (ok) console.log('[maze ' + name + '] OK · dots=' + this.total + ' · reachable=' + Object.keys(seen).length);
    else console.warn('[maze ' + name + '] 검증 실패:\n  - ' + msgs.join('\n  - '));
  }
  return ok;
};

// ---- 렌더 ------------------------------------------------------------------
function roundRectPath(ctx, x, y, w, h, rad) {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); return; }
  var r = Math.min(rad, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 정적 레이어(벽/문) — 클래식 라인(코리도 외곽선) 스타일.
// 벽 타일을 채우지 않고, 코리도(길)와 맞닿은 변만 선으로 그어 원작의 네온 라인 미로를 만든다.
Maze.prototype._isWallChar = function (c, r) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true; // 경계 밖=벽(외곽선 미표시)
  return this.rows[r][c] === '#';
};

// 미로 벽: 코리도 외곽선(평면 라인)
Maze.prototype.strokeWalls = function (ctx, color) {
  var m = 5; // 코리도 쪽으로부터의 인셋
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      if (this.rows[r][c] !== '#') continue;
      var px = OFFSET_X + c * TILE, py = OFFSET_Y + r * TILE;
      var pathL = !this._isWallChar(c - 1, r);
      var pathR = !this._isWallChar(c + 1, r);
      var pathU = !this._isWallChar(c, r - 1);
      var pathD = !this._isWallChar(c, r + 1);
      if (pathU) { ctx.moveTo(pathL ? px + m : px, py + m); ctx.lineTo(pathR ? px + TILE - m : px + TILE, py + m); }
      if (pathD) { ctx.moveTo(pathL ? px + m : px, py + TILE - m); ctx.lineTo(pathR ? px + TILE - m : px + TILE, py + TILE - m); }
      if (pathL) { ctx.moveTo(px + m, pathU ? py + m : py); ctx.lineTo(px + m, pathD ? py + TILE - m : py + TILE); }
      if (pathR) { ctx.moveTo(px + TILE - m, pathU ? py + m : py); ctx.lineTo(px + TILE - m, pathD ? py + TILE - m : py + TILE); }
    }
  }
  ctx.stroke();

  // 문(고스트 집)
  ctx.strokeStyle = COLOR.door; ctx.lineWidth = 5;
  for (var rr = 0; rr < ROWS; rr++) {
    for (var cc = 0; cc < COLS; cc++) {
      if (this.rows[rr][cc] !== '-') continue;
      var dx = OFFSET_X + cc * TILE, dy = OFFSET_Y + rr * TILE;
      ctx.beginPath(); ctx.moveTo(dx, dy + TILE / 2); ctx.lineTo(dx + TILE, dy + TILE / 2); ctx.stroke();
    }
  }
  ctx.restore();
};

Maze.prototype.drawWalls = function (ctx) { this.strokeWalls(ctx, COLOR.wall); };

// 클리어 점멸용: 벽 라인을 단색 틴트로
Maze.prototype.drawWallsTint = function (ctx, color) { this.strokeWalls(ctx, color); };

// 도트/펠릿 (pelletOn: 펠릿 깜빡임 표시 여부)
Maze.prototype.drawDots = function (ctx, pelletOn) {
  ctx.save();
  ctx.fillStyle = COLOR.dot;
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var v = this.dots[r][c];
      if (v === 0) continue;
      var ctr = tileCenter(c, r);
      if (v === 1) {
        ctx.beginPath();
        ctx.arc(ctr.x, ctr.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (v === 2 && pelletOn) {
        ctx.beginPath();
        ctx.arc(ctr.x, ctr.y, 6.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
};
