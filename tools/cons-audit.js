// SPDX-License-Identifier: Apache-2.0
/* 제약 문장 감사 기준선 도구 (재수집·규칙 변경 후 새로 생긴 문장만 사람이 검토하도록)
 * 대상: data/merged.js 의 cons(실제로 화면·MCP 에 나가는 (유형, 문장) 고유 쌍; 상표 치환 후 문장)
 * 기준선: tools/cons-audited.json = [{t, x, ok}] — 검토 완료된 (유형, 문장). ok=false 는 오탐(이면 cons-deny.json/규칙으로 제거해야 함)
 * 사용:
 *   node tools/cons-audit.js            새(미검토) 문장과 기준선의 ok=false 인데 남은 문장을 출력
 *   node tools/cons-audit.js --strict   위 항목이 하나라도 있으면 종료 코드 1
 *   node tools/cons-audit.js --dump     현재 고유 (유형\t문장) 전체 출력
 *   node tools/cons-audit.js --accept   현재 새 문장을 모두 ok=true 로 기준선에 추가(직접 읽고 판정한 뒤에만!)
 *   오탐은 tools/cons-deny.json(정확한 문장) 또는 tools/cons-rules.js(BAD_BY/DROP_ALL) 로 제거하고, 기준선에 {t,x,ok:false} 로 남긴다.
 * 순서: node build.js && node tools/cons-audit.js --strict */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..'), BASE = path.join(__dirname, 'cons-audited.json');
const w = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data', 'merged.js'), 'utf8'), { window: w });
const cur = new Map();
for (const a of Object.values(w.MERGED.apis)) for (const c of a.cons) cur.set(c.t + '\t' + c.x, { t: c.t, x: c.x });
const arg = process.argv.slice(2);
if (arg.includes('--dump')) { for (const k of [...cur.keys()].sort()) console.log(k); process.exit(0); }
const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : [];
const seen = new Map(base.map(e => [e.t + '\t' + e.x, e]));
const fresh = [...cur.keys()].filter(k => !seen.has(k)).sort();
const bad = [...cur.keys()].filter(k => seen.has(k) && !seen.get(k).ok).sort();
if (arg.includes('--accept')) {
  for (const k of fresh) base.push({ ...cur.get(k), ok: true });
  base.sort((a, b) => (a.t + a.x < b.t + b.x ? -1 : 1));
  fs.writeFileSync(BASE, JSON.stringify(base, null, 0).replace(/\},\{/g, '},\n{') + '\n');
  console.log('accepted', fresh.length); process.exit(0);
}
console.log(`current ${cur.size} unique, baseline ${base.length}, new ${fresh.length}, known-bad still present ${bad.length}`);
for (const k of fresh) console.log('NEW\t' + k);
for (const k of bad) console.log('BAD\t' + k);
if (arg.includes('--strict') && (fresh.length || bad.length)) process.exit(1);
