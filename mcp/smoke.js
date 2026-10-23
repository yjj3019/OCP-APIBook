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
  t('initialize', i.result.serverInfo.name === 'ocp-api-book' && i.result.protocolVersion === '2025-06-18');
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
  p.stdin.end(); console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
