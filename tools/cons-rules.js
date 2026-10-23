// SPDX-License-Identifier: Apache-2.0
/* 제약 문장 추출 규칙(build.js 와 tools/cons-audit.js 가 함께 쓴다).
 * 유형: imm(변경 불가) dep(폐기) prev(미리보기·기능 게이트) single(싱글턴) excl(상호 배타) cond(조건부) limit(값 제한)
 * 흐름: sentences(설명) -> classify(문장, 경로, 종류) = DROP_ALL/DENY 제외 -> PRIO 순서로 PAT 일치(BAD_BY·EXTRA 통과) -> RECLASS 재분류
 * 규칙을 바꾸면 `node build.js && node tools/cons-audit.js` 로 새로 생긴(미검토) 문장을 확인한다. */
const fs = require('fs'), path = require('path');

const PAT = {
  imm: /immutable|cannot be (changed|updated|modified|edited)|can ?not be (changed|updated|modified)|may not be (changed|updated|modified)|(is|are|be|as|marked|mark it as) read-?only|is set once|once set|must not be (changed|modified)|cannot be updated/i,
  // `will be removed` 단독은 오탐(예: "oldest backup will be removed") — 폐기/향후 릴리스 표지와 함께일 때만
  dep: /deprecat|no longer (supported|used|recommended|needed)|obsolete|planned for removal|scheduled for removal|(will be|is being) removed.{0,200}(no longer|obsolete|in a future release|next (API |major )?(version|release))|(no longer|obsolete|in a future release|next (API |major )?(version|release)).{0,200}(will be|is being) removed/i,
  // `feature gate` 단독은 제외(대부분 GA/기본 활성 게이트 설명). 기술 프리뷰·alpha/beta 표기가 함께일 때만 유지
  prev: /Technology Preview|Tech Preview|TechPreviewNoUpgrade|DevPreviewNoUpgrade|CustomNoUpgrade|Developer Preview|alpha[- ]level|beta[- ]level|this field is alpha|alpha field|\((alpha|beta)\)|(alpha|beta) (feature|field|API)|(alpha|beta|experimental|preview)\b.{0,60}feature ?gate|feature ?gate (is )?enabled|feature ?gate.{0,60}\b(alpha|beta|experimental|preview|disabled by default)|(requires|depends on|enabled by|only (available|valid|allowed|effective) (when|if|with)).{0,90}feature ?gate|feature ?gate.{0,50}(must|needs? to|has to) be enabled/i,
  single: /singleton|canonical name is|only one .{0,40} (may|can|will) exist|is named .?cluster|name .{0,20}must be .?cluster/i,
  excl: /mutually exclusive|exactly one of|at most one of|only one of|one and only one|only one (field|option|of)|cannot be (set|specified|used) (together|at the same time|with(?! more than))/i,
  limit: /at most \d+|at least \d+|no more than \d+|no fewer than \d+|between \d+ and \d+|maximum( of)? \d+|minimum( of)? \d+|up to \d+|must be (a )?(positive|non-negative|between|greater|less)|valid values (are|include)|allowed values|must be one of|must match (the )?(regex|regular expression|pattern|format|^)|must be a (valid|DNS|RFC)|max length|length of .{0,40} (must|cannot|should|is limited)/i,
  cond: /only (valid|applicable|used|allowed|supported|effective|honou?red|considered) (when|if|for|with|in)|ignored (if|when|unless)|must be set (when|if)|is required (when|if)|required when|only when|has no effect (if|when|unless)|applies only|not applicable/i,
};
// 유형별 추가 제외 규칙(문장·경로·API 종류 기준)
const IMM_BAD = /immutable (representation|container image|osImage|image)|underlying immutable|contains the immutable|cannot be modified due to/i;
// 전수 감사(고유 문장 762개)에서 확인된 오탐 패턴. DROP_ALL 은 모든 유형에서, BAD_BY 는 해당 유형에서만 제외한다.
const DROP_ALL = /Compatibility level \d|Stable within a major release|minimum of \d+ months or \d+ minor releases|^Example:|\bwill (likewise )?be represented\b|\b(may|might) change in future|\bis calculated from\b|\bthe number of (nodes|pods)\b.{0,60}\b(running|supposed to)\b|^See .{0,60} (for|of) (the )?(list|details)|\bignores disallowed values\b|Required, permitted, or forbidden|\bshould (also )?stop\b|within a maximum of \d+ seconds after|\b(at most|at least) \d+% of\b.{0,60}\b(pods|desired|original)\b/i;
const BAD_BY = {
  dep: /\b(Channel|Package|Bundle)?Deprecated is (set|a rollup condition|True)|deprecation conditions?|surfaces? deprecation|marked deprecated in the catalog|^(deprecat\w+ (indicates|overrides)|Deprecation conveys|Message is a human readable message describing the deprecation)|\bdefault warning\b|^May only be set when \w+ is true|^\w*deprecated\w* holds\b|Takes precedence over Regex \(deprecated\)/i,
  prev: /\bDuring (the )?(Alpha|Beta) stage\b.*\b(limited|size)\b/i,
  imm: /\bwas immutable\b.*\bnow (is )?mutable|\b(reserved|may not be modified via this API)\b|^Headers cannot be modified for TLS passthrough|implements an immutable snapshot|is read-only and no changes will be made by Kubernetes/i,
  excl: /When multiple Listeners share values|implementation MUST accept exactly one of/i,
  cond: /Possible enum values:|^This the default behavior\. - "|Only valid in Prometheus versions? [\d.]+ and newer|ignored if the cloud-provider does not support|^This field is ignored if not specified\.?$|Wildcards are only supported for|Conditions are only valid for the current|in parallel only when|only applied to cleartext|could be safely pulled only when|only allowed if at most|is set only when this pod preempts|is not applicable for|External topology mode is not applicable/i,
};
const DENY = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'cons-deny.json'), 'utf8')));   // 남은 개별 오탐 문장(감사 기록)
const EXTRA = {
  dep: (s) => !(/obsolete/i.test(s) && !/deprecat/i.test(s)),
  imm: (s) => !IMM_BAD.test(s),
  prev: (s, p, kind) => kind !== 'FeatureGate' && !/^status\.featureGates/.test(p),
  single: (s, p) => p === '',   // 최상위(API 자체 설명)에서만
};
// 재현율 보강(2차 감사: 4.22 미추출 후보 340개 표본 판정에서 자주 놓친 표현). PAT 과 같이 BAD_BY·EXTRA 를 거친다.
// ALLRX(긴 문장 발췌 기준)에는 넣지 않는다 — 넣으면 기존 감사 문장의 발췌 위치가 바뀐다.
// RFC 식 대문자 MUST/SHOULD/MAY 문장(Gateway API 구현체 요구사항)은 사용자 입력 제약이 아니므로 PAT2 로는 잡지 않는다(PAT2_BAD).
// 검증 완료분만 적용(전수 확인한 새 문장). 표본 판정으로 찾은 더 넓은 후보 패턴은 미검증이라 보류 — tools/cons-audit.js 로 새 문장 전수 확인 후 추가할 것.
const PAT2 = {
  cond: /\b(may|can) only be (set|specified|used) (when|if)\b|\bonly be specified when\b/i,
  limit: /\b(is|are) limited to (a maximum (length )?of )?\d+ (characters|bytes|entries|items)\b|\blimited to \d+ characters\b/i,
};
const PAT2_BAD = /\bMUST\b|\bSHOULD\b|\bMAY\b|\bREQUIRED\b/;
const PRIO = ['dep', 'prev', 'imm', 'single', 'excl', 'cond', 'limit'];
// 재분류: [정규식, 원래 유형(null = 어느 PAT 에도 남지 않음), 새 유형]. 감사에서 "참 제약이지만 유형이 틀림"으로 판정된 문장 계열.
// 교차 필드 비교("must be greater than <다른 필드>", "Start < End")는 값 제약이므로 limit 그대로 둔다.
const RECLASS = [
  [/^Headers cannot be modified for TLS passthrough/i, null, 'cond'],
  [/\breserved and may not be (modified|set|used)\b|\bmay not be used in the middle of\b/i, null, 'limit'],
  [/^(If|When) [^,]{0,60}\b(is present|is Indexed)\b|\bare allowed values when\b|\bis required and must be .{0,60}\bwhen\b/i, 'limit', 'cond'],
];
const CAP = { imm: 15, dep: 40, prev: 20, single: 3, excl: 32, cond: 12, limit: 24 };   // 묶음((유형,문장)) 기준 상한
const ALLRX = new RegExp(Object.values(PAT).map(r => r.source).join('|'), 'i');
const SKIP_PATH = /^(apiVersion|kind|metadata)(\.|$)/;
const NOISE = /^(Is required when creating resources|APIVersion defines|Kind is a string value|Standard object.?s metadata|metadata is the standard|Servers may infer|Cannot be updated\.?$|In CamelCase|More info:|Compatibility level \d)/i;
const clean = s => s.replace(/\s+/g, ' ').trim();
function sentences(text) {
  const out = [];
  for (const para of String(text || '').split(/\n+/)) for (let s of para.split(/(?<=[.!?])\s+(?=[A-Z0-9`"'(])/)) {
    s = clean(s.replace(/More info:.*$/i, ''));
    if (!s || NOISE.test(s)) continue;
    if (s.length > 300) {
      const m = ALLRX.exec(s); if (!m) continue;
      const a = Math.max(0, m.index - 120), b = Math.min(s.length, m.index + m[0].length + 120);
      s = (a > 0 ? '…' : '') + s.slice(a, b).trim() + (b < s.length ? '…' : '');
    }
    if (s.length > 240) s = s.slice(0, 239) + '…';
    out.push(s);
  }
  return out;
}
function classify(s, p, kind) {
  if (DROP_ALL.test(s) || DENY.has(s)) return undefined;
  const hit = t => PAT[t].test(s) || (PAT2[t] && PAT2[t].test(s) && !PAT2_BAD.test(s) && !/^status(\.|$)/.test(p));   // 보강 패턴은 status(관측값) 아래에서 쓰지 않음
  let t = PRIO.find(t => hit(t) && !(BAD_BY[t] && BAD_BY[t].test(s)) && (!EXTRA[t] || EXTRA[t](s, p, kind)));
  for (const [rx, from, to] of RECLASS) if ((t || null) === from && rx.test(s)) { t = to; break; }
  return t;
}
function extract(d, kind) {   // 상한 없이 (유형, 경로, 문장) 전부 반환. 상한은 병합 후 묶음 기준으로 적용
  const seen = new Set(), res = [];
  const push = (p, text) => {
    if (SKIP_PATH.test(p)) return;
    for (const s of sentences(text)) {
      const t = classify(s, p, kind); if (!t) continue;
      const k = p + '\u0000' + s; if (seen.has(k)) continue; seen.add(k);
      res.push({ t, p, x: s });
    }
  };
  push('', d.desc);
  for (const p of d.props) push(p.n, p.d);
  for (const f of d.fields) {
    const b = f.p.replace(/^\./, ''); push(b, f.d);
    for (const r of f.r) push((b ? b + '.' : '') + r[0], r[2]);
  }
  return res;
}
module.exports = { PAT, PAT2, PRIO, CAP, RECLASS, SKIP_PATH, NOISE, ALLRX, sentences, classify, extract };
