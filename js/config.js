/* =========================================================================
   config.js — 전역 설정 / 상수 / 스테이지 데이터 / 미로 데이터 / 유틸
   (클래식 스크립트: 전역에 CFG, DIR, MAZES, STAGES 등을 노출)
   ========================================================================= */

'use strict';

// 디버그(미로 검증 로그 등)
var DEBUG = true;

// ---- 격자 / 화면 ----------------------------------------------------------
var BASE_TILE = 24;     // 타일 기본 크기(px, 논리 좌표)
var TILE = BASE_TILE;   // 현재 타일 크기 — 라운드별 def.tileScale로 확대 가능(작은 미로 확대용)
var COLS = 28;          // 미로 열
var ROWS = 31;          // 미로 행
var MAZE_W = COLS * TILE;   // 672
var MAZE_H = ROWS * TILE;   // 744

// 화면 기하는 기기(PC/터치)에 따라 applyLayout()에서 결정 — 빈 공간 최소화.
var CANVAS_W, CANVAS_H, OFFSET_X, OFFSET_Y, DPAD, IS_TOUCH;
// 캔버스는 최대(클래식 28×31) 기준으로 고정. 더 작은 미로는 이 캔버스 안에 중앙 배치.
var FULL_MAZE_W, FULL_MAZE_H, HUD_TOP;

function applyLayout() {
  IS_TOUCH = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
             || (navigator.maxTouchPoints || 0) > 1;
  OFFSET_X = 24;
  OFFSET_Y = 100;                       // 상단 점수 HUD
  CANVAS_W = MAZE_W + OFFSET_X * 2;      // 720
  FULL_MAZE_W = MAZE_W; FULL_MAZE_H = MAZE_H; HUD_TOP = OFFSET_Y;
  var mazeBottom = OFFSET_Y + MAZE_H;    // 844
  if (IS_TOUCH) {
    CANVAS_H = mazeBottom + 376;         // 목숨줄 + 가상 D-pad 영역
    var s = 78, cx = OFFSET_X + s * 1.5, cy = CANVAS_H - 148;
    DPAD = {
      cx: cx, cy: cy, s: s,
      up:    { x: cx - s / 2,   y: cy - s * 1.5, w: s, h: s },
      down:  { x: cx - s / 2,   y: cy + s * 0.5, w: s, h: s },
      left:  { x: cx - s * 1.5, y: cy - s / 2,   w: s, h: s },
      right: { x: cx + s * 0.5, y: cy - s / 2,   w: s, h: s }
    };
  } else {
    CANVAS_H = mazeBottom + 84;          // 목숨줄만 — D-pad 없음(빈 공간 최소화)
    DPAD = null;
  }
}
applyLayout();

// 라운드별 미로 기하 적용 — 캔버스는 고정(최대 미로 기준), 작은 미로는 중앙 배치.
// loadStage()에서 미로 생성 전에 호출해 격자·오프셋·시작/집/스캐터/과일 좌표를 교체.
function applyMazeGeometry(def) {
  TILE = BASE_TILE * (def.tileScale || 1);   // 라운드별 타일 확대(예: 1라운드 소형 미로 1.3배)
  COLS = def.cols; ROWS = def.rowsN;
  MAZE_W = COLS * TILE; MAZE_H = ROWS * TILE;
  OFFSET_X = Math.round((CANVAS_W - MAZE_W) / 2);                 // 가로 중앙
  OFFSET_Y = Math.round(HUD_TOP + (FULL_MAZE_H - MAZE_H) / 2);    // 세로: 풀 미로 영역 안에서 중앙
  PACMAN_START = def.pac; GHOST_EXIT = def.exit; GHOST_HOME = def.home;
  GHOST_START = def.start; SCATTER = def.scatter; FRUIT_TILE = def.fruit;
}

// ---- 색상(플레이스홀더) ----------------------------------------------------
var COLOR = {
  bg: '#0c1420',           // 단색 폴백(맵 이미지 로드 실패 시)
  wall: '#4ca5a8',         // 미로 라인(평면)
  wallInner: '#101a66',
  door: '#ff7ec8',
  dot: '#fadd00',          // 도트(점) 색
  pellet: '#fadd00',
  pacman: '#ffe24d',
  text: '#f4eeff',         // 부드러운 라벤더-화이트(보라 배경 위)
  textDim: '#bcaee2',
  accent: '#ffce3a',       // 버튼/타이틀 강조(골드 — 도트색과 어울림)
  ready: '#ffe24d',
  fright: '#2330d8',
  frightFlash: '#e7eaff',
  frightFace: '#ffd24d',
  eyes: '#ffffff',
  eyePupil: '#1b2a8a',
  ghost: {
    blinky: '#ff2d2d',
    pinky: '#ffadd6',
    inky: '#37e0ff',
    clyde: '#ffb24a'
  }
};

// ---- 방향 -----------------------------------------------------------------
var DIR = {
  NONE:  { x: 0,  y: 0,  name: 'none' },
  UP:    { x: 0,  y: -1, name: 'up' },
  DOWN:  { x: 0,  y: 1,  name: 'down' },
  LEFT:  { x: -1, y: 0,  name: 'left' },
  RIGHT: { x: 1,  y: 0,  name: 'right' }
};

function opposite(d) {
  if (d === DIR.UP) return DIR.DOWN;
  if (d === DIR.DOWN) return DIR.UP;
  if (d === DIR.LEFT) return DIR.RIGHT;
  if (d === DIR.RIGHT) return DIR.LEFT;
  return DIR.NONE;
}

// ---- 좌표 변환 -------------------------------------------------------------
// 타일(col,row) 중심의 픽셀 좌표
function tileCenter(col, row) {
  return { x: OFFSET_X + col * TILE + TILE / 2, y: OFFSET_Y + row * TILE + TILE / 2 };
}
// 픽셀 → 타일 (floor)
function pixelToTile(x, y) {
  return { col: Math.floor((x - OFFSET_X) / TILE), row: Math.floor((y - OFFSET_Y) / TILE) };
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

// ---- 미로 데이터 -----------------------------------------------------------
// 기호:  # 벽 / . 도트 / o 파워펠릿 / (공백) 길(도트 없음) / - 고스트집 문
// 모든 미로는 28열 × 31행(원본 클래식). 고스트집/터널 위치를 공유해 로직 재사용.
var MAZE_A = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '######.##### ## #####.######',
  '######.##          ##.######',
  '######.## ###--### ##.######',
  '######.## #      # ##.######',
  '      .   #      #   .      ',
  '######.## #      # ##.######',
  '######.## ######## ##.######',
  '######.##          ##.######',
  '######.##### ## #####.######',
  '######.##### ## #####.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################'
];

// 1라운드 전용 — 절반 규격(20×22) 소형 미로. 좌우 대칭, 자체 고스트집·터널 포함.
// 캔버스 중앙에 배치되어 클래식보다 한눈에 작게 보이고 도트도 적다(약 210개).
var MAZE_R1_SMALL = [
  '####################',
  '#..................#',
  '#.####........####.#',
  '#o####........####o#',
  '#..................#',
  '#.#######..#######.#',
  '#.#######..#######.#',
  '#..................#',
  '#.##..###--###..##.#',
  '#.##..#      #..##.#',
  ' .....#      #..... ',
  '#.##..#      #..##.#',
  '#.##..########..##.#',
  '#..................#',
  '#.####........####.#',
  '#.####........####.#',
  '#........  ........#',
  '#.#######..#######.#',
  '#o................o#',
  '#.#######..#######.#',
  '#..................#',
  '####################'
];

// 3라운드 — 클래식을 더 복잡하게 확장: 큰 솔리드 블록을 통로로 갈라
// 도트를 크게 늘리고 교차로를 추가. 하우스밴드(9~19행)는 유지. 좌우 대칭.
// (carve 셀은 모두 인접한 기존 통로와 연결되어 도달 가능 — validate()로 검증)
var MAZE_R3 = (function () {
  var rows = MAZE_A.slice();
  function setc(r, c, ch) { var s = rows[r]; rows[r] = s.substring(0, c) + ch + s.substring(c + 1); }
  [// 상단 기둥(2~4행) 세로 통로 추가
   [2, 3], [3, 3], [4, 3], [2, 4], [3, 4], [4, 4],
   [2, 8], [3, 8], [4, 8], [2, 9], [3, 9], [4, 9], [2, 11], [3, 11], [4, 11],
   // 상단 중앙 블록(6~7행) 가르기
   [6, 11], [7, 11],
   // 하단 기둥(21~22행) 세로 통로 추가
   [21, 3], [22, 3], [21, 9], [22, 9], [21, 11], [22, 11],
   // 최하단 블록(24~28행) 세로 통로 추가
   [24, 11], [25, 11], [24, 4], [25, 4],
   [27, 6], [28, 6], [27, 9], [28, 9], [27, 4], [28, 4]
  ].forEach(function (e) { setc(e[0], e[1], '.'); setc(e[0], 27 - e[1], '.'); }); // 통로 + 좌우 대칭칸
  return rows;
})();

// 라운드별 미로 정의(격자 + 고정 좌표). loadStage가 stage.mazeKey로 선택.
var MAZE_DEFS = {
  full: {
    rows: MAZE_A, cols: 28, rowsN: 31,
    pac:  { col: 13, row: 23, dir: DIR.LEFT },
    exit: { col: 13, row: 11 }, home: { col: 13, row: 14 },
    start: {
      blinky: { col: 13, row: 11, dir: DIR.LEFT, inHouse: false },
      pinky:  { col: 13, row: 14, dir: DIR.UP,   inHouse: true },
      inky:   { col: 11, row: 14, dir: DIR.UP,   inHouse: true },
      clyde:  { col: 16, row: 14, dir: DIR.UP,   inHouse: true }
    },
    scatter: { blinky: { col: 25, row: 0 }, pinky: { col: 2, row: 0 }, inky: { col: 27, row: 30 }, clyde: { col: 0, row: 30 } },
    fruit: { col: 13, row: 17 }
  },
  small: {
    rows: MAZE_R1_SMALL, cols: 20, rowsN: 22,
    tileScale: 1.3,   // 1라운드 소형 미로를 1.3배 확대(너무 작아 잘 안 보이던 문제 보완)
    pac:  { col: 9, row: 16, dir: DIR.LEFT },
    exit: { col: 9, row: 7 }, home: { col: 9, row: 10 },
    start: {
      blinky: { col: 9,  row: 7,  dir: DIR.LEFT, inHouse: false },
      pinky:  { col: 9,  row: 10, dir: DIR.UP,   inHouse: true },
      inky:   { col: 8,  row: 10, dir: DIR.UP,   inHouse: true },
      clyde:  { col: 11, row: 10, dir: DIR.UP,   inHouse: true }
    },
    scatter: { blinky: { col: 17, row: 0 }, pinky: { col: 2, row: 0 }, inky: { col: 19, row: 21 }, clyde: { col: 0, row: 21 } },
    fruit: { col: 9, row: 13 }
  }
};
// 3라운드(복잡 미로): 격자·좌표는 클래식(full)과 동일, 미로 레이아웃만 MAZE_R3.
MAZE_DEFS.complex = Object.assign({}, MAZE_DEFS.full, { rows: MAZE_R3 });

// ---- 시작 위치(전 미로 공유) ----------------------------------------------
var PACMAN_START = { col: 13, row: 23, dir: DIR.LEFT };

var GHOST_EXIT  = { col: 13, row: 11 };   // 집 문 바로 위(밖)
var GHOST_HOME  = { col: 13, row: 14 };   // 집 내부 중앙(눈 복귀 지점)
var GHOST_START = {
  blinky: { col: 13, row: 11, dir: DIR.LEFT,  inHouse: false },
  pinky:  { col: 13, row: 14, dir: DIR.UP,    inHouse: true },
  inky:   { col: 11, row: 14, dir: DIR.UP,    inHouse: true },
  clyde:  { col: 16, row: 14, dir: DIR.UP,    inHouse: true }
};

// 적(고스트) → 데몬 스프라이트 매핑 (데몬 4종을 4마리에 각각 배분)
var GHOST_DEMON = { blinky: 'demon_1', pinky: 'demon_2', inky: 'demon_3', clyde: 'demon_4' };

// 스캐터 코너(타깃 타일, 미로 밖이어도 됨)
var SCATTER = {
  blinky: { col: 25, row: 0 },
  pinky:  { col: 2,  row: 0 },
  inky:   { col: 27, row: 30 },
  clyde:  { col: 0,  row: 30 }
};

// 과일 등장 위치(집 아래) — (사과 시스템에서는 미사용, 호환용 유지)
var FRUIT_TILE = { col: 13, row: 17 };

// ---- 사과(생명 +1) ---------------------------------------------------------
// 라운드당 한 번, 라운드 시작 후 랜덤 시점에 도달 가능한 랜덤 타일에 등장.
// 등장 후 APPLE_LIFETIME초만 유지되고, 먹으면 생명이 1 늘어난다.
var APPLE_LIFETIME = 10;   // 등장 지속 시간(초)
var APPLE_SPAWN_MIN = 3;   // 라운드 시작 후 최소 등장 시각(초)
var APPLE_SPAWN_MAX = 13;  // 라운드 시작 후 최대 등장 시각(초)
var APPLE_COLOR = '#ff3b3b';

// ---- 속도 ------------------------------------------------------------------
// 100% 기준 속도(타일/초). %는 스테이지 표에서 곱함.
var BASE_SPEED = 8.0; // tiles/sec @100%

// 유령이 먹혀 '눈' 상태가 된 뒤 부활(집에서 재출발)까지의 시간(초). 전 라운드 공통.
var GHOST_REVIVE_TIME = 5;

// ---- 스캐터/체이스 스케줄(초). 마지막은 무한 체이스 ----------------------
// 1차 빌드는 전 스테이지 공통(원작 레벨1 스케줄). 🟡 추후 스테이지별 분리.
var SCATTER_CHASE = [
  { mode: 'scatter', t: 7 },
  { mode: 'chase',   t: 20 },
  { mode: 'scatter', t: 7 },
  { mode: 'chase',   t: 20 },
  { mode: 'scatter', t: 5 },
  { mode: 'chase',   t: 20 },
  { mode: 'scatter', t: 5 },
  { mode: 'chase',   t: Infinity }
];

// ---- 스테이지 데이터(3라운드) ---------------------------------------------
// speed 값은 BASE_SPEED 대비 배율
var STAGES = [
  // 1라운드 — 소형 미로 + 유령 2마리 (가장 쉬움)
  { mazeKey: 'small', ghosts: ['blinky', 'pinky'], lives: 3, pac: 0.80, ghost: 0.75, tunnel: 0.40, frightPac: 0.90, frightGhost: 0.50,
    frightTime: 6, flashes: 5, elroy1: 20, elroy2: 10,
    fruit: { name: 'cherry',     color: '#ff3b3b', points: 100 },
    release: { pinky: 0 } },

  // 2라운드 — 클래식 미로 + 유령 3마리
  { mazeKey: 'full', ghosts: ['blinky', 'pinky', 'inky'], lives: 3, pac: 0.90, ghost: 0.85, tunnel: 0.45, frightPac: 0.95, frightGhost: 0.55,
    frightTime: 5, flashes: 5, elroy1: 30, elroy2: 15,
    fruit: { name: 'strawberry', color: '#ff5d8f', points: 300 },
    release: { pinky: 0, inky: 30 } },

  // 3라운드 — 복잡한 확장 미로(도트 310) + 유령 4마리 (가장 어려움). 사과(생명+1)는 이 라운드에만 등장.
  { mazeKey: 'complex', apple: true, lives: 4, pac: 1.00, ghost: 0.95, tunnel: 0.50, frightPac: 1.00, frightGhost: 0.60,
    frightTime: 5, flashes: 5, elroy1: 50, elroy2: 25,
    fruit: { name: 'melon',      color: '#54c45a', points: 1000 },
    release: { pinky: 0, inky: 0, clyde: 0 } }
];

var START_LIVES = 3;
var EXTRA_LIFE_SCORE = 10000;
var TURN_TOLERANCE = 10; // 코너링 허용 거리(px) — 교차로 근처면 직전/직후라도 회전 허용(방향키 민감도)

// 점수
var SCORE_DOT = 10;
var SCORE_PELLET = 50;
var GHOST_SCORES = [200, 400, 800, 1600];

// 핑키 '위 방향' 오버플로 버그 재현(원작 충실). 끄려면 false.
var PINKY_UP_BUG = true;

// 가상 D-pad 기하는 applyLayout()에서 IS_TOUCH일 때만 설정(PC는 null).

