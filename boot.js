// SPDX-License-Identifier: Apache-2.0
/* 부팅: 아이콘 채우기, 앱 시작, 서비스 워커 등록. 인라인 스크립트가 없어야 CSP(script-src 'self')가 성립한다. */
(function () {
  document.querySelectorAll('[data-ic]').forEach(function (e) { e.innerHTML = Icon(e.dataset.ic, +e.dataset.s || 16); e.style.display = 'inline-flex'; });
  App.init();
  // 서비스 워커: 재방문 속도와 오프라인 동작. 개발 중에는 주소에 ?nosw 를 붙이면 끄고 기존 워커도 해제한다.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    if (/[?&]nosw\b/.test(location.search)) navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); });
    else window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* 등록 실패는 무시 */ }); });
  }
})();
