// SPDX-License-Identifier: Apache-2.0
/* MCP 서버 스모크 테스트: node mcp/smoke.js  (자식 프로세스로 stdio 왕복) */
const { spawn } = require('child_process'), path = require('path');
const p = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map(); let buf = '', n = 0;
p.stdout.setEncoding('utf8').on('data', c => { buf += c; for (let i; (i = buf.indexOf('\n')) >= 0; ) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const f = pending.get(m.id); if (f) { pending.delete(m.id); f(m); } } });
const rpc = (method, params) => new Promise(r => { const id = ++n; pending.set(id, r); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const call = (name, args) => rpc('tools/call', { name, arguments: args }).then(m => ({ err: m.result.isError, out: m.result.isError ? m.result.content[0].text : m.result.structuredContent }));
let fail = 0; const t = (name, c, info) => { console.log((c ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!c) fail++; };
(async () => {
  const i = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } });
  t('initialize', i.result.serverInfo.name === 'api-book' && i.result.protocolVersion === '2025-06-18');
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const l = await rpc('tools/list'); t('tools/list', l.result.tools.length === 7, l.result.tools.map(x => x.name).join(','));
  let r = await call('search_apis', { query: 'route tls termination', limit: 3 }); t('search_apis', !r.err && r.out.results[0].kind === 'Route', r.out.results.map(x => x.kind).join(','));
  r = await call('search_apis', { query: '퍼시스턴트 볼륨', limit: 3 }); t('search_apis ko', !r.err && r.out.results.length > 0, r.out.results.map(x => x.kind).join(','));
  r = await call('get_api', { api: 'Route' }); t('get_api', !r.err && r.out.apiVersion === 'route.openshift.io/v1' && r.out.endpoints.length > 3, r.out.availability);
  r = await call('get_fields', { api: 'Route', path: 'spec.tls' }); t('get_fields', !r.err && r.out.fields.some(f => f.name === 'termination'), r.out.fields.length + ' fields');
  r = await call('get_fields', { api: 'Route' }); t('get_fields top', !r.err && r.out.fields.some(f => f.name === 'spec'));
  r = await call('get_constraints', { api: 'IngressController' }); t('get_constraints', !r.err && r.out.constraints.length > 0, JSON.stringify(r.out.counts));
  r = await call('compare_versions', { api: 'IngressController' }); t('compare_versions', !r.err && Array.isArray(r.out.fieldChanges));
  r = await call('list_apis', { book: 'network_apis', limit: 5 }); t('list_apis', !r.err && r.out.count > 5);
  r = await call('generate_manifest', { api: 'Route', name: 'web' }); t('generate_manifest', !r.err && /kind: Route/.test(r.out.yaml) && /name: web/.test(r.out.yaml), '\n' + r.out.yaml);
  r = await call('get_api', { api: 'NoSuchKind' }); t('unknown api -> isError', r.err === true);
  r = await call('get_fields', { api: 'Route', path: 'spec.nope' }); t('bad path -> isError', r.err === true);
  const u = await rpc('nope/x', {}); t('unknown method -> -32601', u.error && u.error.code === -32601);
  r = await call('get_api', { api: 'core/ConfigMap' }); t('core/Kind 해석', !r.err && r.out.apiVersion === 'v1', r.err ? r.out : '');
  r = await call('search_apis', {}); t('query 없음 -> isError', r.err === true);
  r = await call('search_apis', { query: 'route', limit: -3 }); t('음수 limit -> 기본값', !r.err && r.out.results.length === 10);
  r = await call('generate_manifest', { api: 'ConfigMap', name: 'x\nspec:\n  evil: 1' }); t('name 주입 거부', r.err === true);
  r = await call('generate_manifest', { api: 'Deployment', name: 'web' }); t('Deployment selector/template 틀', !r.err && /matchLabels:/.test(r.out.yaml) && /containers:/.test(r.out.yaml));
  p.stdin.write('null\n"hello"\n[]\n' + JSON.stringify({ jsonrpc: '2.0', method: 'tools/list' }) + '\n');   // 서버가 죽지 않아야 하고, 알림에는 응답하지 않는다
  r = await call('search_apis', { query: 'mutually exclusive', version: '4.22' });
  t('제약 문장 검색', !r.err && r.out.total > 0);
  r = await call('search_apis', { query: 'Backup' });
  t('구버전 전용 API 통합 검색', r.out.results.some(a => a.kind === 'Backup'));
  r = await call('search_apis', { query: 'DataGather', version: '4.21' });
  t('선택한 버전의 검색 식별자', r.out.results.some(a => a.kind === 'DataGather' && a.id.endsWith('v1alpha2') && a.apiVersion.endsWith('/v1alpha2')));
  r = await call('list_apis', { version: '4.20', has_constraint: 'cond', limit: 300 });
  t('해당 버전의 제약으로 필터', !r.out.apis.some(a => a.kind === 'AlertmanagerConfig'));
  r = await call('generate_manifest', { api: 'Deployment', name: '123', namespace: 'true' });
  const parsed = require('../sim').yamlParse(r.out.yaml)[0];
  const labels = [];
  for (const ending of ['blue', 'green']) {
    const name = 'deployment.'.repeat(7) + ending;
    const result = await call('generate_manifest', { api: 'Deployment', name });
    const obj = require('../sim').yamlParse(result.out.yaml)[0];
    const label = obj.spec.selector.matchLabels.app, container = obj.spec.template.spec.containers[0].name;
    t('long workload name ' + ending, obj.metadata.name === name && label.length <= 63 && obj.spec.template.metadata.labels.app === label &&
      /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/.test(container));
    labels.push(label);
  }
  t('distinct long names retain distinct selectors', labels[0] !== labels[1]);
  t('YAML 문자열 보존', parsed.metadata.name === '123' && parsed.metadata.namespace === 'true' && parsed.spec.selector.matchLabels.app === '123' && parsed.spec.template.spec.containers[0].name === '123');
  r = await call('search_apis', { query: 'machine spec.authoritativeAPI' });
  const machine = r.out.results.find(x => x.kind === 'Machine');
  t('compound query identifies the field release', machine?.version === '4.21' && machine.fieldVersions.join() === '4.21');
  if (machine) {
    r = await call('get_fields', { api: machine.id, version: machine.version, path: 'spec' });
    t('search result opens matching field schema', r.out.fields.some(f => f.name === 'authoritativeAPI'));
  }
  r = await call('search_apis', { query: 'authoritativeAPI' });
  t('구버전 필드 통합 검색', ['Machine', 'MachineSet', 'ControlPlaneMachineSet'].every(kind =>
    r.out.results.some(x => x.kind === kind && x.fieldVersions.includes('4.21') && !x.fieldVersions.includes('5.0'))));
  const oldId = 'datagather-insights-openshift-io-v1alpha2';
  for (const query of ['Machine.spec.authoritativeAPI', 'Machine `spec.authoritativeAPI`', 'machine spec.authoritativeAPI,']) {
    r = await call('search_apis', { query });
    t(query, r.out.results.find(x => x.kind === 'Machine')?.version === '4.21');
  }
  r = await call('get_constraints', { api: 'k8s.ovn.org/ClusterUserDefinedNetwork', version: '4.20', type: 'cond' });
  t('constraints use paths in requested release', r.out.version === '4.20' && r.out.shownCounts.cond === r.out.constraints.length &&
    r.out.constraints.some(c => c.path === 'spec.network.layer2.joinSubnets') &&
    r.out.constraints.every(c => c.versions.join() === '4.20' && (!c.pathsByVersion || c.pathsByVersion['4.20'].includes(c.path))));
  r = await call('get_constraints', { api: oldId, version: '5.0' });
  t('constraints reject incompatible schema ID', r.err === true);
  r = await call('get_api', { api: 'core/Binding', version: '5.0' });
  t('엔드포인트 공통 쿼리 인자', !r.err && r.out.endpoints.every(e =>
    ['dryRun', 'fieldValidation'].every(n => e.queryParametersByMethod.POST.includes(n))));
  for (const name of ['get_api', 'get_fields', 'generate_manifest']) {
    r = await call(name, { api: oldId });
    t(name + ' 정확한 스키마 ID', !r.err && r.out.version === '4.21');
    r = await call(name, { api: oldId, version: '5.0' });
    t(name + ' ID와 문서 릴리스 충돌', r.err === true);
  }
  const alive = await rpc('ping', {}); t('잘못된 줄 뒤에도 살아 있음', alive && alive.result && !alive.error);
  p.stdin.end(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
