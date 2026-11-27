// SPDX-License-Identifier: Apache-2.0
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { withPublication } = require('./publish');
const { stageStamps } = require('./stamp');
const { publicFiles } = require('./site-files');
const repo = path.join(__dirname, '..');

function workspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-book-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('rollback restores raw files, web stamps and data on each failed replacement', t => {
  const root = workspace(t);
  const names = ['new-release.json', 'v5.0.json', 'v4.22.json', 'index.html', 'sw.js', 'data'];
  const original = names.slice(1);
  function populate(dir, name, value) {
    const file = path.join(dir, name);
    if (name === 'data') {
      fs.mkdirSync(file);
      fs.writeFileSync(path.join(file, 'merged.js'), value);
    } else fs.writeFileSync(file, value);
  }
  for (const name of original) populate(root, name, 'previous');
  for (const failAt of names) {
    assert.throws(() => withPublication(root, work => names.map(name => {
      const src = path.join(work, name);
      if (name !== failAt) populate(work, name, 'next');
      return [src, path.join(root, name)];
    })), { code: 'ENOENT' });
    for (const name of original) assert.equal(fs.readFileSync(path.join(root, name === 'data' ? 'data/merged.js' : name), 'utf8'), 'previous');
    assert.deepEqual(fs.readdirSync(root).sort(), [...original].sort());
  }
});

test('Windows and Git checkouts produce identical deployable bytes', t => {
  const root = workspace(t), out = path.join(root, 'out'), data = path.join(root, 'data');
  fs.mkdirSync(out); fs.mkdirSync(data);
  const files = [...publicFiles, 'data/merged.js', 'data/legacy.js'];
  function stamp(eol) {
    for (const name of files) {
      const src = fs.readFileSync(path.join(repo, name), 'utf8').replace(/\r?\n/g, eol);
      fs.writeFileSync(path.join(root, name), src);
    }
    stageStamps(root, data, out);
    return ['index.html', 'sw.js'].map(n => fs.readFileSync(path.join(out, n), 'utf8'));
  }
  assert.deepEqual(stamp('\r\n'), stamp('\n'));
});

test('a missing required asset rejects the new service worker installation', async () => {
  const handlers = {}, deleted = [], scope = 'https://example.test/book/';
  const old = 'api-book:' + encodeURIComponent(scope) + ':previous';
  let fail = true;
  const caches = {
    open: async () => ({ addAll: async requests => {
      assert.ok(requests.some(r => r.url.includes('data/merged.js')));
      if (fail) throw Error('offline');
    } }),
    keys: async () => [old], delete: async key => deleted.push(key)
  };
  vm.runInNewContext(fs.readFileSync(path.join(repo, 'sw.js'), 'utf8'), {
    self: { registration: { scope }, clients: { claim() {} }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    caches, Request: class { constructor(url) { this.url = url; } }
  });
  const event = name => new Promise((resolve, reject) =>
    handlers[name]({ waitUntil: promise => promise.then(resolve, reject) }));
  await assert.rejects(event('install'), /offline/);
  assert.deepEqual(deleted, []);
  fail = false;
  await event('install'); await event('activate');
  assert.deepEqual(deleted, [old]);
});

test('an existing MCP tool retries a lazy read across catalog generations', t => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, 'mcp'));
  for (const name of ['search.js', 'mcp/server.js']) fs.copyFileSync(path.join(repo, name), path.join(root, name));
  function fixture(dir, generation) {
    fs.mkdirSync(dir);
    const write = (name, code) => fs.writeFileSync(path.join(dir, name), code);
    const id = 'route-id', v = '5.0', key = 'Route|route.openshift.io';
    const record = { kind: 'Route', group: 'route.openshift.io', book: 'network_apis', vers: [v], id: { [v]: id },
      gv: { [v]: 'v1' }, ns: true, cons: [], countsByVersion: { [v]: {} } };
    const detail = { ...record, id, version: 'v1', d: { props: [], eps: [], required: [], desc: generation } };
    write('merged.js', 'window.MERGED=' + JSON.stringify({ list: [v], default: v, build: generation, apis: { [key]: record } }));
    write(v + '.js', 'window.DB=' + JSON.stringify({ [v]: { guide: [], apis: [detail] } }));
    write(v + '.fidx.js', 'window.FIDX=' + JSON.stringify({ [v]: { [id]: [] } }));
    write(v + '.fields.network_apis.js', 'window.FIELDS=' + JSON.stringify({ [v]: { [id]: [{ p: '.spec', r: [[generation, 'string', '']], q: [] }] } }));
  }
  const live = path.join(root, 'data'), next = path.join(root, 'next');
  fixture(live, 'previous'); fixture(next, 'replacement');
  const { TOOLS } = require(path.join(root, 'mcp/server.js'));
  const api = TOOLS.find(t => t.name === 'get_api'), fields = TOOLS.find(t => t.name === 'get_fields');
  assert.equal(api.run({ api: 'Route' }).description, 'previous');
  const read = fs.readFileSync;
  let fieldReads = 0;
  try {
    fs.readFileSync = function (file, ...args) {
      if (String(file).endsWith('5.0.fields.network_apis.js') && ++fieldReads === 1) {
        fs.renameSync(live, path.join(root, 'old')); fs.renameSync(next, live);
      }
      return read.call(this, file, ...args);
    };
    assert.equal(fields.run({ api: 'Route', path: 'spec' }).fields[0].name, 'replacement');
  } finally { fs.readFileSync = read; }
  assert.equal(fieldReads, 2);
  assert.equal(api.run({ api: 'Route' }).description, 'replacement');
});
