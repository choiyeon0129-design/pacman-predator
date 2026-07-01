/* =========================================================================
   main.js — 진입점
   ========================================================================= */

'use strict';

window.addEventListener('load', function () {
  var canvas = document.getElementById('game');
  // Puzzle Sans 폰트 프리로드(첫 프레임부터 적용)
  if (document.fonts && document.fonts.load) { try { document.fonts.load("24px 'Puzzle Sans'"); } catch (e) {} }
  // 논리 캔버스 크기를 기기 레이아웃에 맞춰 설정(빈 공간 최소화)
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  // 창 크기에 맞춰 표시 크기 스케일(반응형) — 논리 좌표계는 유지
  function fitCanvas() {
    var scale = Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H);
    canvas.style.width = Math.round(CANVAS_W * scale) + 'px';
    canvas.style.height = Math.round(CANVAS_H * scale) + 'px';
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  Input.init(canvas);
  Assets.load({
    pacman: 'cha_1.png',              // 주인공(픽셀 팩맨)
    demon_1: 'demon_1.png',           // 픽셀 데몬(여우)
    demon_2: 'demon_2.png',           // 픽셀 데몬(곰/돼지)
    demon_3: 'demon_3.png',           // 픽셀 데몬
    demon_4: 'demon_4.png',           // 픽셀 데몬
    demon_5: 'demon_5.png',           // 먹힌 데몬(눈 복귀 상태)
    map: 'map.png'                    // 게임 배경(전 화면 공통, 큰 파일 → 마지막 로드)
  });
  var game = new Game(canvas);
  window.__game = game;   // 디버깅용 전역
  game.start();
});
