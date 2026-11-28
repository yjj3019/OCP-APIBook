// SPDX-License-Identifier: MIT
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { TOOLS } = require('../mcp/server');

const data = path.join(__dirname, '..', 'data');
const files = fs.readdirSync(data);
const getFields = TOOLS.find(tool => tool.name === 'get_fields').run;
const releases = files.filter(name => /^\d+\.\d+\.js$/.test(name)).map(name => path.basename(name, '.js'));
assert.ok(releases.length, 'No release catalogs found');

for (const version of releases) test('필드 조회와 수록 원본 대조 ' + version, t => {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  const load = name => vm.runInContext(fs.readFileSync(path.join(data, name), 'utf8'), ctx);
  load(version + '.js');
  for (const file of files.filter(name => name.startsWith(version + '.fields.'))) load(file);

  const records = ctx.DB[version].apis;
  assert.ok(records.length > 0);
  let contexts = 0;
  for (const api of records) {
    const tree = ctx.FIELDS[version][api.id] || [];
    const root = { p: '', r: (api.d.props || []).map(x => [x.n, x.t]), q: api.d.required };
    const deepest = tree.reduce((best, n) => n.p.length > best.p.length ? n : best, root);
    const samples = new Set([root, deepest, tree.find(n => n.p.endsWith('[]')), tree.find(n => n.p.endsWith('{}'))]);
    for (const node of samples) {
      if (!node) continue;
      contexts++;
      const parent = node.p.slice(1);
      const child = name => parent ? parent + '.' + name : name;
      const lookup = p => getFields({ api: api.id, version, path: p });
      const response = lookup(parent);
      const label = [version, api.id, parent].join(' ');
      assert.equal(response.version, version, label);
      assert.equal(response.apiVersion, [api.group, api.version].filter(Boolean).join('/'), label);
      assert.equal(response.docUrl, api.url, label);
      const url = new URL(response.docUrl);
      assert.equal(url.origin, 'https://docs.redhat.com', label);
      assert.ok(url.pathname.split('/').includes(version) && url.hash.length > 1, label);
      assert.deepEqual(Array.from(response.requiredChildPaths), Array.from(node.q || [], child), label);
      const rows = node.r.filter(([name]) => !name.endsWith('[]'));
      assert.deepEqual(Array.from(response.fields, f => f.path), Array.from(rows, ([name]) => child(name)), label);
      for (const [i, [name, type]] of rows.entries()) {
        const field = response.fields[i];
        assert.equal(field.type, type, label);
        assert.equal(field.required, (node.q || []).includes(name), label);
        if (name.endsWith('{}')) {
          assert.equal(field.pathKind, 'mapValue', label);
          assert.equal(lookup(child(name)).pathKind, 'mapValue', label);
        } else if (i === 0) {
          const exact = lookup(child(name)).field;
          assert.equal(exact.path, field.path, label);
          assert.equal(exact.required, field.required, label);
        }
      }
    }
  }
  t.diagnostic(records.length + ' APIs, ' + contexts + ' field contexts');
});
