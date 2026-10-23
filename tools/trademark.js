// SPDX-License-Identifier: Apache-2.0
/* 원문 라이선스 조건("Modified versions must remove all Red Hat trademarks")에 따라 설명 문장 속 상표 이름을 중립적인 표현으로 바꾼다.
 * - 대상: 사람이 읽는 설명 문장(API 설명, 필드 설명, 가이드 제목·본문 텍스트)만.
 * - 제외: API 그룹·종류·경로·URL 등 식별자. 앞뒤가 영숫자·"."·"/"·"_" 이면 식별자의 일부로 보고 건드리지 않는다
 *   (예: OpenShiftAPIServer, route.openshift.io, docs.redhat.com, openshift-config).
 * build.js 와 tools/test-build.js 가 함께 쓴다. */
const L = '(?<![\\w./])', R = '(?![\\w./])';
// 긴 이름부터. [정규식 원문, 명사(관사 처리 대상), 형용사형(앞에 꾸밈말이 있을 때)]
const MARKS = [
  ['Red Hat OpenShift Container Platform', 'platform'],
  ['Red Hat Enterprise Linux CoreOS', 'host operating system'],
  ['Red Hat Enterprise Linux', 'host Linux distribution'],
  ['OpenShift Container Platform', 'platform'],
  ['Red Hat OpenShift', 'platform'],
  ['OpenShift', 'platform'],
  ['Red Hat', 'vendor'],
].map(([s, noun]) => [new RegExp(L + s.replace(/ /g, '\\s+') + R, 'g'), noun]);
const PREP = /^(by|with|on|in|for|to|of|and|or|from|than|via|at|into|onto|about|like|use|uses|using|running|run|In|Where|where|For|On|With)$/;

function replaceMarks(s) {
  if (typeof s !== 'string' || !/OpenShift|Red\s+Hat/.test(s)) return s;
  s = s.replace(new RegExp('\\b(an|An)(\\s+)(?=(?:Red\\s+Hat\\s+)?OpenShift' + R + ')', 'g'), (m, a, sp) => (a === 'An' ? 'A' : 'a') + sp);   // an OpenShift → a platform
  for (const [re, noun] of MARKS) {
    s = s.replace(re, (m, off, str) => {
      const before = str.slice(Math.max(0, off - 40), off), w = (before.match(/(\S+)\s*$/) || [])[1] || '';
      if (/^(the|a|A|any|all|each|every|this|that|default|normal|layered|other)$/i.test(w) && !/[.!?:]$/.test(w)) return noun;   // 이미 한정사·꾸밈말이 있음
      if (!w || /[.!?:;"'“(\[]$/.test(w) || /\n\s*$/.test(before)) return (w.endsWith('"') || w.endsWith('“') ? noun : 'The ' + noun);   // 문장·항목 시작
      if (PREP.test(w)) return 'the ' + noun;
      return noun;
    });
  }
  return s;
}
// HTML: 태그 밖 텍스트에만 적용(속성·URL 은 그대로)
const replaceMarksHTML = h => typeof h === 'string' ? h.replace(/(^|>)([^<]+)/g, (m, a, t) => a + replaceMarks(t)) : h;
// 상표가 남아 있는지 검사(식별자 제외)
const MARK_LEFT = new RegExp(L + '(OpenShift|Red\\s+Hat)' + R);

module.exports = { replaceMarks, replaceMarksHTML, MARK_LEFT };
