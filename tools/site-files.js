// SPDX-License-Identifier: MIT
const fs = require('fs'), path = require('path');
const legalFiles = new Set(['LICENSE', 'LICENSE-APACHE', 'NOTICE']);
const publicFiles = new Set(['index.html', 'sw.js', 'app.css', 'sim.css', 'ui-kit.js', 'locale.js', 'search.js', 'endpoints.js', 'core.js', 'views.js', 'palette.js', 'boot.js', 'graph.js', 'viz.js', 'topo.js', 'sim.js', ...legalFiles]);
const isDataFile = name => /^(?:merged|legacy|versions|\d+\.\d+(?:\.fidx|\.fields\.[a-z0-9_]+)?)\.js$/.test(name);
// Embedded by stamp.js so loading the first script does not itself require a file:// SRI request.
function loadPageAssets() {
  const local = location.protocol === 'file:';
  for (const source of document.getElementById('page-styles').content.children) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('blocking', 'render');
    if (!local) link.integrity = source.integrity;
    link.href = source.getAttribute('href');
    document.head.appendChild(link);
  }
  document.addEventListener('DOMContentLoaded', () => {
    function showLoadError() {
      const main = document.getElementById('main');
      if (document.getElementById('startup-reload')) return;
      // This path also handles failure of locale.js or boot.js itself.
      const en = new URLSearchParams(location.search).get('lang') === 'en';
      const message = document.createElement('p');
      message.setAttribute('role', 'alert');
      message.textContent = en ? 'Could not load the catalog.' : '카탈로그를 불러오지 못했습니다.';
      const reload = document.createElement('button');
      reload.id = 'startup-reload';
      reload.className = 'btn ghost';
      reload.textContent = en ? 'Reload page' : '페이지 새로고침';
      reload.addEventListener('click', () => location.reload());
      main.lang = en ? 'en' : 'ko';
      main.replaceChildren(message, reload);
    }
    for (const source of document.getElementById('page-assets').content.children) {
      const script = document.createElement('script');
      script.async = false; // Execute dependencies in document order.
      script.onerror = showLoadError;
      if (!local) script.integrity = source.integrity;
      script.src = source.getAttribute('src');
      document.head.appendChild(script);
    }
  }, { once: true });
}
const pageLoader = '(' + loadPageAssets.toString().replace(/\r\n/g, '\n') + ')();';
const loaderHash = 'sha256-' + require('node:crypto').createHash('sha256').update(pageLoader).digest('base64');
function canonicalBytes(bytes) {
  return bytes.includes(13) ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes;
}

function assembleSite(root, site) {
  fs.mkdirSync(site);
  fs.mkdirSync(path.join(site, 'data'));
  const data = fs.readdirSync(path.join(root, 'data')).filter(isDataFile).map(name => path.join('data', name));
  for (const file of [...publicFiles, ...data]) {
    const source = path.join(root, file), target = path.join(site, file);
    if (legalFiles.has(file) || /\.(?:html|js|css)$/.test(file)) fs.writeFileSync(target, canonicalBytes(fs.readFileSync(source)));
    else fs.copyFileSync(source, target);
  }
  fs.writeFileSync(path.join(site, '.nojekyll'), '');
}
module.exports = { legalFiles, publicFiles, isDataFile, canonicalBytes, assembleSite, pageLoader, loaderHash };
if (require.main === module) {
  const root = path.join(__dirname, '..');
  assembleSite(root, path.join(root, '_site'));
}
