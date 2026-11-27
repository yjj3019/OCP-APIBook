// SPDX-License-Identifier: Apache-2.0
/* 부팅: 아이콘 채우기, 앱 시작, 서비스 워커 등록. */
(function () {
  if (!window.MERGED || !window.App?.views?.home || !window.Icon || !window.ApiSearch || !window.ApiEndpoints || !document.getElementById('catalog-hashes')) {
    const main = document.getElementById('main');
    main.textContent = '카탈로그를 불러오지 못했습니다. ';
    const reload = document.createElement('button');
    reload.textContent = '페이지 새로고침';
    reload.addEventListener('click', () => location.reload());
    main.appendChild(reload);
    return;
  }
  document.querySelectorAll('[data-ic]').forEach(function (e) { e.innerHTML = Icon(e.dataset.ic, +e.dataset.s || 16); e.style.display = 'inline-flex'; });
  App.init();
  // 서비스 워커: 재방문 속도와 오프라인 동작. 개발 중에는 주소에 ?nosw 를 붙이면 끄고 기존 워커도 해제한다.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    if (/[?&]nosw\b/.test(location.search)) navigator.serviceWorker.getRegistration('./').then(function (r) {
      if (r && r.scope === new URL('./', location.href).href) return r.unregister();
    }).catch(function () { /* 등록 정보에 접근할 수 없는 환경 */ });
    else {
      const register = () => navigator.serviceWorker.register('sw.js').catch(function () { /* 등록 실패는 무시 */ });
      if (document.readyState === 'complete') register();
      else window.addEventListener('load', register, { once: true });
    }
  }
})();
