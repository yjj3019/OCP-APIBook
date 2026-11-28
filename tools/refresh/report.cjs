// SPDX-License-Identifier: Apache-2.0
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function sources(text) {
  const json = text.slice(text.indexOf('window.VERSIONS=') + 'window.VERSIONS='.length).trim().replace(/;$/, '');
  return JSON.parse(json).sources;
}
const before = sources(execFileSync('git', ['show', 'HEAD:data/versions.js'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
const after = sources(fs.readFileSync('data/versions.js', 'utf8'));
function revision(source) {
  if (!source) return '없음';
  if (!/^[0-9a-f]{40}$/.test(source.revision)) throw new Error('잘못된 원본 커밋');
  return '[' + source.revision.slice(0, 12) + '](https://github.com/openshift/openshift-docs/commit/' + source.revision + ')';
}
console.log('자동 수집한 원본으로 카탈로그를 다시 생성했습니다. 머지 후 배포에 반영됩니다.\n');
console.log('| 릴리스 | 기본 브랜치 원본 | 이번 수집 원본 |');
console.log('|---|---|---|');
for (const version of new Set([...Object.keys(after), ...Object.keys(before)])) {
  if (!/^\d+\.\d+$/.test(version)) throw new Error('잘못된 릴리스');
  console.log('| ' + version + ' | ' + revision(before[version]) + ' | ' + revision(after[version]) + ' |');
}
