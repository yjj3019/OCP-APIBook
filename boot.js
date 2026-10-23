/* 부팅: 아이콘 채우기, 폰트 비차단 로드, 앱 시작. 인라인 스크립트가 없어야 CSP(script-src 'self')가 성립한다. */
(function () {
  document.querySelectorAll('[data-ic]').forEach(function (e) { e.innerHTML = Icon(e.dataset.ic, +e.dataset.s || 16); e.style.display = 'inline-flex'; });
  // 웹 폰트는 렌더를 막지 않게 뒤늦게 붙인다. 차단·폐쇄망에서는 시스템 글꼴로 계속 동작한다.
  var l = document.createElement('link');
  l.rel = 'stylesheet'; l.media = 'print';
  l.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap';
  l.addEventListener('load', function () { l.media = 'all'; });
  document.head.appendChild(l);
  App.init();
})();
