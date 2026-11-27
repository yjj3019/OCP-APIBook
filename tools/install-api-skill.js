// SPDX-License-Identifier: Apache-2.0
// Register the same skill from any checkout, without copying the catalog.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function install() {
  const name = 'ocp-api-book';
  const source = fs.realpathSync(path.join(__dirname, '..', 'skills', name));
  const home = os.homedir();
  const claude = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  // Grok Build also discovers user skills in ~/.agents/skills.
  const targets = [path.join(home, '.agents', 'skills', name), path.join(claude, 'skills', name)];
  function alreadyLinked(target) {
    if (!fs.lstatSync(target, { throwIfNoEntry: false })) return false;
    if (fs.realpathSync(target) === source) return true;
    throw new Error('다른 스킬이 이미 설치되어 있습니다: ' + target);
  }
  const pending = targets.filter(target => !alreadyLinked(target));
  for (const target of pending) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    try {
      fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (error.code !== 'EEXIST' || !alreadyLinked(target)) throw error;
    }
  }
  console.log('OpenShift API Book 등록 완료');
}

try { install(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
