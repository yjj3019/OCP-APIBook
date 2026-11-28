// SPDX-License-Identifier: MIT
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { yamlParse } = require('../sim');

const root = path.join(__dirname, '..');
const name = 'ocp-api-book';
const source = path.join(root, 'skills', name);
const server = path.join(root, 'mcp', 'server.js');
const installer = path.join(__dirname, 'install-api-skill.js');
const script = dir => path.join(dir, 'scripts', 'query.cjs');
const versions = ['4.20', '4.21', '4.22', '5.0'];
const tools = ['search_apis', 'get_api', 'get_fields', 'get_constraints', 'compare_versions',
  'list_apis', 'generate_manifest', 'validate_manifest', 'get_catalog_status'];
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'api book skill '));
const env = { ...process.env };
delete env.OCP_API_BOOK_ROOT;
const copied = path.join(sandbox, 'copied skill', name);
const shared = path.join(sandbox, '.agents', 'skills', name);
const claude = path.join(sandbox, 'custom claude', 'skills', name);
const homeStub = path.join(sandbox, 'isolated-home.cjs');
const installEnv = { ...env, CLAUDE_CONFIG_DIR: path.dirname(path.dirname(claude)) };

function run(args, input = '', environment = env) {
  const r = spawnSync(process.execPath, args, { cwd: sandbox, env: environment, input,
    encoding: 'utf8', timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
  if (r.error) throw r.error;
  return r;
}
function json(r) {
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
function error(r, expected) {
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, expected);
}

const scenarios = [];
function scenario(label, tool, args, verify) { scenarios.push({ label, tool, args, verify }); }
const cm = { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'demo', namespace: 'qa' }, data: { note: '한글 = 값' } };
const cron = { apiVersion: 'batch/v1', kind: 'CronJob', metadata: cm.metadata };
const route = 'route.openshift.io/Route';
function checkSource(r, version, apiVersion) {
  assert.equal(r.version, version);
  assert.equal(r.apiVersion, apiVersion);
  const url = new URL(r.docUrl);
  assert.equal(url.hostname, 'docs.redhat.com');
  assert.ok(url.pathname.split('/').includes(version) && url.hash);
}
for (const version of versions) {
  const check = (label, tool, args, verify) => scenario(version + ' ' + label, tool, { ...args, version }, verify);
  check('한글 검색', 'search_apis', { query: '퍼시스턴트 볼륨', limit: 2 }, r => {
    assert.ok(r.results.length && r.results.length <= 2);
    assert.ok(r.results.some(x => x.kind.startsWith('PersistentVolume')));
  });
  check('그룹과 공식 문서', 'get_api', { api: route }, r => {
    assert.equal(r.apiVersion, 'route.openshift.io/v1');
    assert.equal(new URL(r.docUrl).hostname, 'docs.redhat.com');
    assert.ok(new URL(r.docUrl).pathname.split('/').includes(version));
    assert.ok(r.endpoints.some(e => e.path.endsWith('/routes') && e.methods.some(m => m.startsWith('POST'))));
  });
  check('코어 그룹', 'get_api', { api: 'core/ConfigMap' }, r => assert.equal(r.apiVersion, 'v1'));
  check('TLS 자체는 선택', 'get_fields', { api: route, path: 'spec' }, r =>
    assert.equal(r.fields.find(x => x.name === 'tls')?.required, false));
  check('TLS 객체와 하위 필수 필드를 한 번에 조회', 'get_fields', { api: route, path: 'spec.tls' }, r => {
    checkSource(r, version, 'route.openshift.io/v1');
    assert.equal(r.field.path, 'spec.tls');
    assert.equal(r.field.required, false);
    assert.deepEqual(r.requiredChildPaths, ['spec.tls.termination']);
    assert.deepEqual(r.fields.filter(x => x.required).map(x => x.path), ['spec.tls.termination']);
  });
  check('필수 스칼라의 정확한 경로', 'get_fields', { api: route, path: '.spec.tls.termination' }, r => {
    assert.equal(r.field.path, 'spec.tls.termination');
    assert.equal(r.field.required, true);
    assert.deepEqual(r.fields, []);
  });
  check('배열 원소 속성은 원소 객체 기준', 'get_fields', { api: 'networking.k8s.io/Ingress', path: 'spec.rules[].host' }, r => {
    checkSource(r, version, 'networking.k8s.io/v1');
    assert.equal(r.field.path, 'spec.rules[].host');
    assert.equal(r.field.required, false);
    assert.deepEqual(r.fields, []);
  });
  check('배열 속성과 원소의 경로 구분', 'get_fields', { api: 'networking.k8s.io/Ingress', path: 'spec.rules' }, r =>
    assert.equal(r.field.itemsPath, 'spec.rules[]'));

  check('배열 원소 필드', 'get_fields', { api: 'networking.k8s.io/Ingress', path: 'spec.rules[]' }, r => {
    assert.equal(r.field, null);
    assert.ok(r.fields.some(x => x.path === 'spec.rules[].host'));
  });
  check('맵 속성의 값 경로', 'get_fields', { api: 'certificates.k8s.io/CertificateSigningRequest', path: 'spec.extra' }, r =>
    assert.equal(r.field.valuesPath, 'spec.extra{}'));
  check('하위 객체 정의가 없는 맵 값', 'get_fields', { api: 'certificates.k8s.io/CertificateSigningRequest', path: 'spec.extra{}' }, r => {
    assert.equal(r.pathKind, 'mapValue');
    assert.equal(r.field, null);
    assert.deepEqual(r.fields, []);
    assert.equal(Object.hasOwn(r, 'requiredChildPaths'), false);
  });
  check('릴리스별 제약', 'get_constraints', { api: route }, r => {
    checkSource(r, version, 'route.openshift.io/v1');
    assert.ok(r.constraints.length);
    assert.ok(r.constraints.every(c => c.versions.includes(version) && c.statement.length));
  });
  check('목록 필터와 정수 인자', 'list_apis', { scope: 'namespaced', limit: 2 }, r => {
    assert.ok(r.count >= 2); assert.equal(r.apis.length, 2); assert.ok(r.apis.every(x => x.namespaced));
  });
  check('매니페스트 생성', 'generate_manifest', { api: 'core/ConfigMap', name: 'demo', namespace: 'qa' }, r => {
    assert.equal(r.version, version);
    checkSource(r, version, 'v1');
    const [manifest] = yamlParse(r.yaml);
    assert.deepEqual(manifest.metadata, { name: 'demo', namespace: 'qa' });
    const validated = json(run([script(shared), 'validate_manifest', 'version=' + version, 'manifest=-'], r.yaml));
    assert.equal(validated.valid, true); assert.equal(validated.documents[0].kind, 'ConfigMap');
  });
  check('여러 문서와 잘못된 YAML', 'validate_manifest', { manifest: JSON.stringify(cm) + '\n---\nkind: &anchor X' }, r => {
    assert.deepEqual(r.documents.map(d => [d.document, d.valid]), [[1, true], [2, false]]);
    assert.equal(r.documents[1].issues[0].code, 'parse');
  });
  check('검토 요청의 선택 메타데이터', 'validate_manifest', {
    manifest: 'apiVersion: authorization.k8s.io/v1\nkind: SelfSubjectAccessReview\nspec:\n  resourceAttributes:\n    verb: get\n    resource: pods'
  }, r => assert.equal(r.valid, true));
  check('릴리스 출처', 'get_catalog_status', {}, r => {
    assert.equal(r.releases.length, 1); assert.equal(r.releases[0].version, version);
    assert.match(r.releases[0].revision, /^[0-9a-f]{40}$/);
  });
}
for (const from of versions) for (const to of versions) {
  if (from === to) continue;
  const label = from + ' → ' + to;
  scenario(label + ' 스키마', 'compare_versions', { api: 'batch/CronJob', from, to }, r => {
    assert.equal(r.availability[from], true); assert.equal(r.availability[to], true);
    for (const v of [from, to]) checkSource(r.sources[v], v, 'batch/v1');
    const change = r.requiredChanges.find(c => c.path === 'spec');
    if (from === '5.0' || to === '5.0') {
      assert.equal(change.from, from === '5.0' ? 'required' : 'optional');
      assert.equal(change.to, to === '5.0' ? 'required' : 'optional');
    } else assert.equal(change, undefined);
  });
  scenario(label + ' 문서 제약', 'compare_versions', { api: 'config.openshift.io/Image', from, to }, r => {
    assert.ok(Array.isArray(r.constraintChanges));
    if ([from, to].includes('4.22') && [from, to].includes('5.0')) {
      const side = to === '5.0' ? 'to' : 'from';
      assert.ok(r.constraintChanges.some(c => c.path.includes('allowedRegistries') && c[side].some(s => s.includes('1024'))));
    }
  });
  scenario(label + ' 실제 YAML 영향', 'validate_manifest', { from, to, manifest: JSON.stringify(cron) }, r => {
    assert.equal(r.documents[0].fromValid, from !== '5.0');
    assert.equal(r.documents[0].toValid, to !== '5.0');
    if (to === '5.0') assert.ok(r.documents[0].introduced.some(i => i.path === 'spec'));
    if (from === '5.0') assert.ok(r.documents[0].resolved.some(i => i.path === 'spec'));
  });
}

scenario('제거된 API에는 대상 릴리스의 출처가 없다', 'compare_versions',
  { api: 'Backup', from: '4.21', to: '5.0' }, r => {
    assert.equal(r.availability['4.21'], true);
    assert.equal(r.sources['4.21'].version, '4.21');
    assert.equal(r.sources['5.0'], null);
  });

scenario('상세 속성 표가 생략된 필수 경로 보존', 'get_fields',
  { api: 'machineconfiguration.openshift.io/ControllerConfig', version: '4.20', path: 'spec.dns' }, r =>
    assert.ok(r.requiredChildPaths.includes('spec.dns.spec')));

let rpc;
before(() => {
  fs.cpSync(source, copied, { recursive: true });
  fs.writeFileSync(homeStub, 'require("node:os").homedir = () => __dirname;\n');
  const r = run(['--require', homeStub, installer], '', installEnv);
  assert.equal(r.status, 0, r.stderr);
  const requests = [{ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'skill-test', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    ...scenarios.map((s, i) => ({ jsonrpc: '2.0', id: i + 2, method: 'tools/call', params: { name: s.tool, arguments: s.args } }))];
  const response = run([server], requests.map(x => JSON.stringify(x)).join('\n') + '\n');
  assert.equal(response.status, 0, response.stderr);
  rpc = new Map(response.stdout.trim().split('\n').map(line => {
    const m = JSON.parse(line); return [m.id, m.result];
  }));
  assert.equal(rpc.size, scenarios.length + 2);
});
after(() => {
  // Unlink installer junctions before removing the private fixture tree.
  for (const link of [shared, claude]) if (fs.lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(link);
  assert.equal(path.dirname(sandbox), os.tmpdir());
  fs.rmSync(sandbox, { recursive: true, force: true });
});

test('배포 스킬의 메타데이터, 암시적 호출 정책과 로컬 스크립트 링크', () => {
  const instructions = fs.readFileSync(path.join(copied, 'SKILL.md'), 'utf8');
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(instructions);
  assert.ok(header, 'SKILL.md frontmatter');
  const [metadata] = yamlParse(header[1]);
  assert.equal(metadata.name, name);
  assert.equal(metadata.license, 'MIT');
  assert.equal(fs.readFileSync(path.join(copied, 'LICENSE'), 'utf8'), fs.readFileSync(path.join(root, 'LICENSE'), 'utf8'));
  assert.ok(metadata.description.trim());
  const [ui] = yamlParse(fs.readFileSync(path.join(copied, 'agents', 'openai.yaml'), 'utf8'));
  assert.ok(ui.interface.display_name.trim());
  assert.notEqual(ui.policy?.allow_implicit_invocation, false);
  const links = [...instructions.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(match => match[1]);
  assert.ok(links.includes('scripts/query.cjs'));
  for (const link of links.filter(link => !link.includes('://'))) assert.ok(fs.existsSync(path.join(copied, link)));
});
test('구버전 검색 결과의 스키마 ID와 릴리스를 상세 조회에 전달', () => {
  const search = json(run([script(shared), 'search_apis', 'query=DataGather', 'version=4.21']));
  const match = search.results.find(r => r.kind === 'DataGather');
  assert.ok(match);
  const details = json(run([script(shared), 'get_api', 'api=' + match.id, 'version=' + match.version]));
  assert.equal(details.version, '4.21');
  assert.equal(details.apiVersion, 'insights.openshift.io/v1alpha2');
  error(run([script(shared), 'get_api', 'api=' + match.id, 'version=5.0']), /제공 버전/);
  const all = json(run([script(shared), 'compare_versions', 'api=insights.openshift.io/DataGather']));
  assert.ok(all.versions.includes('4.21') && all.versions.includes('5.0'));
});
test('동일 Kind 모호성 진단 후 그룹으로 재조회', () => {
  error(run([script(shared), 'get_api', 'api=Ingress']), /group\/Kind/);
  for (const group of ['networking.k8s.io', 'config.openshift.io']) {
    const r = json(run([script(shared), 'get_api', 'version=4.22', 'api=' + group + '/Ingress']));
    assert.equal(r.apiVersion, group + '/v1');
  }
});
test('스킬 --list와 MCP tools/list의 도구 및 입력 스키마 일치', () => {
  const catalog = json(run([script(shared), '--list']));
  assert.deepEqual(catalog.map(x => x.name).sort(), [...tools].sort());
  const mcp = rpc.get(1).tools;
  for (const tool of catalog) {
    const wire = mcp.find(x => x.name === tool.name);
    assert.deepEqual(tool.inputSchema, wire.inputSchema);
    assert.equal(tool.description, wire.description);
  }
});
test('등록, 재등록, 별도 작업 폴더에서 양쪽 등록 경로로 실행', () => {
  assert.equal(run(['--require', homeStub, installer], '', installEnv).status, 0);
  for (const dir of [shared, claude]) {
    assert.equal(fs.realpathSync(dir), fs.realpathSync(source));
    assert.equal(json(run([script(dir), 'get_api', 'api=core/ConfigMap', 'version=5.0'])).kind, 'ConfigMap');
  }
});
test('복사 설치에서 카탈로그 위치 지정 및 미지정', () => {
  error(run([script(copied), '--list']), /OCP_API_BOOK_ROOT/);
  const r = json(run([script(copied), 'get_fields', 'api=Route', 'path=spec.tls', 'version=4.22'], '', { ...env, OCP_API_BOOK_ROOT: root }));
  assert.deepEqual(r.fields.filter(x => x.required).map(x => x.name), ['termination']);
});
test('기존 다른 스킬 보호', () => {
  const other = path.join(sandbox, 'other claude');
  const target = path.join(other, 'skills', name);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'SKILL.md'), 'existing skill');
  error(run(['--require', homeStub, installer], '', { ...env, CLAUDE_CONFIG_DIR: other }), /이미 설치/);
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), 'existing skill');
});
for (const [index, s] of scenarios.entries()) {
  test(s.label + ' · CLI/MCP', () => {
    const args = Object.entries(s.args).map(([k, v]) => k + '=' + (k === 'manifest' ? '-' : v));
    const result = json(run([script(shared), s.tool, ...args], s.args.manifest));
    const wire = rpc.get(index + 2);
    assert.equal(wire.isError, false);
    assert.deepEqual(result, wire.structuredContent);
    s.verify(result);
  });
}
const invalid = [
  [['get_fields', 'api=Route', 'version='], /지원하지 않는 버전/],
  [['get_fields', 'api=Route', 'path=spec.tls.termination.extra'], /경로/],
  [[], /도구 이름/], [['absent_tool'], /도구 이름/],
  [['get_api', 'api'], /key=value/], [['get_api', '=Route'], /key=value/],
  [['get_api', 'api=Route', 'api=Pod'], /중복/], [['get_api', 'apix=Route'], /지원하지 않는 인자/],
  [['search_apis', 'query=Route', 'limit=1.5'], /정수/],
  [['list_apis', 'limit=9999999999999999999999'], /정수/],
  [['get_api', 'api=Route', 'version=9.9'], /지원하지 않는 버전/],
  [['get_fields', 'api=Route', 'path=spec.notAField'], /경로/],
  [['compare_versions', 'api=Route', 'from=4.22'], /서로 다른/],
  [['validate_manifest', 'manifest=-'], /문서가 없습니다/],
  [['validate_manifest', 'version=5.0', 'from=4.22', 'to=5.0', 'manifest={}'], /from과 to/],
  [['list_apis', 'scope=unknown'], /scope/],
];
for (const [args, expected] of invalid) {
  test('오류 처리 · ' + (args.join(' ') || '도구 생략'), () => error(run([script(shared), ...args]), expected));
}
