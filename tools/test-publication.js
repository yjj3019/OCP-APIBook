// SPDX-License-Identifier: MIT
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const { withPublication } = require('./publish');
const { stageStamps } = require('./stamp');
const { legalFiles, publicFiles, assembleSite } = require('./site-files');
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
  const win = {};
  vm.runInNewContext(fs.readFileSync(path.join(repo, 'data/merged.js'), 'utf8'), { window: win });
  const latest = 'data/' + win.MERGED.default;
  const files = [...publicFiles, 'data/merged.js', 'data/legacy.js', 'data/versions.js', latest + '.js', latest + '.fidx.js', latest + '.fields.network_apis.js'];
  function stamp(eol) {
    for (const name of files) {
      const src = fs.readFileSync(path.join(repo, name), 'utf8').replace(/\r?\n/g, eol);
      fs.writeFileSync(path.join(root, name), src);
    }
    stageStamps(root, data, out);
    return ['index.html', 'sw.js'].map(n => fs.readFileSync(path.join(out, n), 'utf8'));
  }
  const crlf = stamp('\r\n');
  for (const name of ['index.html', 'sw.js']) fs.copyFileSync(path.join(out, name), path.join(root, name));
  const site = path.join(root, '_site');
  assembleSite(root, site);
  const lf = stamp('\n');
  assert.deepEqual(crlf, lf);
  for (const name of legalFiles) {
    const body = fs.readFileSync(path.join(site, name), 'utf8');
    assert.equal(body, fs.readFileSync(path.join(repo, name), 'utf8').replace(/\r\n/g, '\n'));
    assert.ok(lf[1].includes('"sha256-' + createHash('sha256').update(body).digest('base64') + '"'), name);
  }
  const hashes = JSON.parse(lf[0].match(/id="catalog-hashes" type="application\/json">([^<]+)/)[1]);
  for (const file of Object.keys(hashes)) {
    const digest = createHash('sha256').update(fs.readFileSync(path.join(site, file))).digest();
    assert.equal(hashes[file], digest.toString('base64'));
    if (file === 'data/merged.js' || file === 'data/legacy.js') {
      assert.ok(lf[0].includes(`src="${file}?v=${digest.toString('base64url')}" integrity="sha256-${hashes[file]}"`));
    }
  }
});

test('locale formatting preserves user values and orders translated arguments', () => {
  const source = fs.readFileSync(path.join(repo, 'locale.js'), 'utf8');
  const locale = lang => {
    const ctx = { window: {}, location: { search: lang ? '?lang=' + lang : '' }, URLSearchParams };
    vm.runInNewContext(source, ctx);
    return ctx.window.ApiBookLocale;
  };
  const input = '검색 <name> {1} $&';
  const label = (ui, value) => ui`<b>${value}</b>문서 ${5}개 중 ${3}개를 편집 탭에 열었습니다.`;
  assert.equal(label(locale('en').text, input), '<b>' + input + '</b>Opened 3 of 5 documents in the editor.');
  for (const lang of ['', 'ko', 'unknown']) {
    assert.equal(locale(lang).language, 'ko');
    assert.equal(label(locale(lang).text, input), '<b>' + input + '</b>문서 5개 중 3개를 편집 탭에 열었습니다.');
  }
});

test('direct files and hosted pages load the same assets in order under their CSP', () => {
  const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
  const styles = html.match(/<template id="page-styles">([\s\S]*?)<\/template>/)[1];
  const scripts = html.match(/<template id="page-assets">([\s\S]*?)<\/template>/)[1];
  assert.ok(html.indexOf('<script id="page-loader">') < html.indexOf('</head>'));
  const loader = html.match(/<script id="page-loader">([\s\S]*?)<\/script>/)[1];
  const hash = createHash('sha256').update(loader).digest('base64');
  assert.ok(html.includes(`script-src 'self' 'sha256-${hash}';`));
  const sources = Array.from((styles + scripts).matchAll(/<(link|script)\b[^>]*(?:src|href)="([^"]+)" integrity="([^"]+)"/g),
    ([, localName, url, integrity]) => ({ localName, integrity, url, getAttribute: () => url }));
  assert.equal(sources.filter(s => s.localName === 'link').length, 2);
  assert.ok(sources[2].url.startsWith('ui-kit.js?'));
  assert.ok(sources.at(-1).url.startsWith('boot.js?'));
  for (const protocol of ['file:', 'http:', 'https:']) {
    const added = [];
    let domReady;
    vm.runInNewContext(loader, { location: { protocol }, document: {
      getElementById: id => ({ content: { children: sources.filter(el => el.localName === (id === 'page-styles' ? 'link' : 'script')) } }),
      addEventListener: (name, fn) => { assert.equal(name, 'DOMContentLoaded'); domReady = fn; },
      createElement: localName => ({ localName, setAttribute(k, v) { this[k] = v; } }),
      head: { appendChild: el => added.push(el) }
    } });
    assert.equal(added.length, 2);
    assert.ok(added.every(el => el.blocking === 'render'));
    domReady();
    assert.deepEqual(added.map(el => el.src || el.href), sources.map(el => el.url));
    assert.ok(added.every((el, i) => el.integrity === (protocol === 'file:' ? undefined : sources[i].integrity)));
    assert.ok(added.every(el => el.localName === 'script' ? el.async === false : el.rel === 'stylesheet'));
  }
});

test('a new publisher recovers an interrupted replacement before preparing its own files', t => {
  const root = workspace(t), data = path.join(root, 'data');
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, 'merged.js'), 'previous');
  const child = spawnSync(process.execPath, ['-e', `
    const fs = require('node:fs'), path = require('node:path');
    const { withPublication } = require(process.argv[1]), root = process.argv[2];
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      rename(from, to);
      if (from === path.join(root, 'data')) process.exit(27);
    };
    withPublication(root, work => {
      const extra = path.join(work, 'extra'), next = path.join(work, 'next');
      fs.writeFileSync(extra, 'new');
      fs.mkdirSync(next);
      return [[extra, path.join(root, 'new-release')], [next, path.join(root, 'data')]];
    });
  `, require.resolve('./publish'), root]);
  assert.equal(child.status, 27);
  assert.equal(fs.existsSync(data), false);
  const recovery = spawnSync(process.execPath, ['-e', `
    const fs = require('node:fs'), path = require('node:path'), root = process.argv[2];
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      rename(from, to);
      if (from === path.join(root, 'new-release')) process.exit(28);
    };
    require(process.argv[1]).withPublication(root, () => []);
  `, require.resolve('./publish'), root]);
  assert.equal(recovery.status, 28);
  withPublication(root, () => {
    assert.equal(fs.readFileSync(path.join(data, 'merged.js'), 'utf8'), 'previous');
    assert.equal(fs.existsSync(path.join(root, 'new-release')), false);
    assert.throws(() => withPublication(root, () => []), { code: 'EEXIST' });
    return [];
  });
  assert.deepEqual(fs.readdirSync(root), ['data']);
});

test('old data URLs cannot acquire replacement bytes or an immutable cache entry', async t => {
  const root = workspace(t);
  fs.mkdirSync(path.join(root, 'tools'));
  fs.mkdirSync(path.join(root, 'data'));
  for (const name of ['serve.js', 'tools/site-files.js']) fs.copyFileSync(path.join(repo, name), path.join(root, name));
  const file = path.join(root, 'data', '5.0.fields.network_apis.js');
  const url = content => '/data/5.0.fields.network_apis.js?v=' + createHash('sha256').update(content).digest('base64url');
  fs.writeFileSync(file, 'previous');
  const server = spawn(process.execPath, ['serve.js', '0', '--no-precompress'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const [line] = await once(server.stdout, 'data');
    const base = line.toString().match(/http:\/\/[^ ]+/)[0];
    const old = await fetch(base + url('previous'));
    assert.match(old.headers.get('cache-control'), /immutable/);
    assert.equal(await old.text(), 'previous');
    fs.writeFileSync(file, 'replaced');
    const stale = await fetch(base + url('previous'), { headers: { 'If-None-Match': old.headers.get('etag') } });
    assert.equal(stale.status, 410);
    assert.equal(stale.headers.get('cache-control'), 'no-store');
    assert.equal(await (await fetch(base + url('replaced'))).text(), 'replaced');
  } finally {
    const stopped = once(server, 'exit');
    server.kill(); await stopped;
  }
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

test('the worker only caches verified assets from its own build and finishes a pending write', async () => {
  const scope = 'https://example.test/book/', handlers = {}, pending = [];
  const script = fs.readFileSync(path.join(repo, 'sw.js'), 'utf8');
  const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
  const hash = JSON.parse(html.match(/id="catalog-hashes" type="application\/json">([^<]+)/)[1])['sim.js'];
  const url = scope + 'sim.js?v=' + Buffer.from(hash, 'base64').toString('base64url');
  let finish, writes = 0;
  vm.runInNewContext(script, {
    self: { registration: { scope }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    Request, fetch: async req => {
      assert.equal(req.url, url); assert.equal(req.integrity, 'sha256-' + hash);
      return new Response('verified response');
    },
    caches: { match: async () => undefined, open: async () => ({ put: async () => {
      writes++;
      await new Promise(resolve => { finish = resolve; });
    } }) }
  });
  function dispatch(target) {
    let response;
    handlers.fetch({ request: new Request(target), respondWith: p => { response = p; }, waitUntil: p => pending.push(p) });
    return response;
  }
  assert.equal(dispatch(scope + 'sim.js?v=previous'), undefined);
  assert.equal(dispatch(url.replace('/book/', '/other/')), undefined);
  const response = await dispatch(url);
  assert.equal(await response.text(), 'verified response');
  assert.equal(writes, 1); assert.equal(pending.length, 1);
  finish(); await Promise.all(pending);
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
