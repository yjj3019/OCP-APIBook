// SPDX-License-Identifier: Apache-2.0
const fs = require('fs'), path = require('path');
const publicFiles = new Set(['index.html', 'sw.js', 'app.css', 'sim.css', 'ui-kit.js', 'search.js', 'endpoints.js', 'core.js', 'views.js', 'palette.js', 'boot.js', 'graph.js', 'viz.js', 'topo.js', 'sim.js', 'LICENSE', 'NOTICE']);
const isDataFile = name => /^(?:merged|legacy|versions|\d+\.\d+(?:\.fidx|\.fields\.[a-z0-9_]+)?)\.js$/.test(name);
module.exports = { publicFiles, isDataFile };

if (require.main === module) {
  const root = path.join(__dirname, '..'), site = path.join(root, '_site');
  fs.mkdirSync(site);
  fs.mkdirSync(path.join(site, 'data'));
  for (const file of publicFiles) fs.copyFileSync(path.join(root, file), path.join(site, file));
  for (const file of fs.readdirSync(path.join(root, 'data')).filter(isDataFile)) {
    fs.copyFileSync(path.join(root, 'data', file), path.join(site, 'data', file));
  }
  fs.writeFileSync(path.join(site, '.nojekyll'), '');
}
