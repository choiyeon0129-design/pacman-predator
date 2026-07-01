/* =========================================================================
   assets.js — 이미지 프리로더. 로드 전/실패 시 get()이 null → 벡터/단색 폴백.
   로드 실패 시 자동 재시도(개발용 단일 스레드 서버·불안정 호스트 대비).
   ========================================================================= */

'use strict';

var Assets = {
  images: {},

  load: function (map) {
    Object.keys(map).forEach(function (k) { Assets._loadOne(k, map[k], 0); });
  },

  _loadOne: function (k, src, tries) {
    var im = new Image();
    im.onerror = function () {
      if (tries < 12) {
        setTimeout(function () {
          // 캐시버스터로 재요청(서버는 query를 무시하고 같은 파일을 다시 서빙)
          Assets._loadOne(k, src.split('?')[0] + '?r=' + (tries + 1), tries + 1);
        }, Math.min(300 + tries * 400, 2500));
      }
    };
    im.src = src;
    Assets.images[k] = im;
  },

  get: function (k) {
    var im = this.images[k];
    return (im && im.complete && im.naturalWidth > 0) ? im : null;
  }
};
