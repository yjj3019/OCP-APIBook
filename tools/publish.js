// SPDX-License-Identifier: MIT
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Register before looking for other publishers. A contender can only proceed
// once every earlier registration is gone or its process has exited.
function acquire(root) {
  const name = '.catalog-owner-' + process.pid + '-' + randomUUID();
  const ticket = path.join(root, name);
  fs.writeFileSync(ticket, '', { flag: 'wx' });
  try {
    for (const other of fs.readdirSync(root)) {
      if (other === name) continue;
      const match = /^\.catalog-owner-(\d+)-[\da-f-]+$/.exec(other);
      if (match) {
        try { process.kill(Number(match[1]), 0); }
        catch (error) {
          if (error.code !== 'ESRCH') throw error;
          fs.rmSync(path.join(root, other), { force: true });
          continue;
        }
      } else if (other !== '.catalog-build.lock') continue;
      throw Object.assign(new Error('다른 카탈로그 게시 작업의 잠금이 있습니다: ' + other), { code: 'EEXIST' });
    }
    return ticket;
  } catch (error) { fs.unlinkSync(ticket); throw error; }
}

function targetPath(root, relative) {
  const target = path.resolve(root, relative);
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw Error('잘못된 게시 경로: ' + relative);
  return target;
}

// The journal is installed before any live file moves. A backup exists exactly
// until it is restored, so rollback itself can be interrupted and retried.
function recover(root, work, journal) {
  if (fs.existsSync(journal)) {
    const entries = JSON.parse(fs.readFileSync(journal, 'utf8'));
    for (const [i, entry] of entries.entries()) {
      const target = targetPath(root, entry.target);
      const backup = path.join(work, 'previous-' + i);
      if (entry.existed && !fs.existsSync(backup)) continue;
      if (fs.existsSync(target)) fs.renameSync(target, path.join(work, 'discard-' + i));
      if (entry.existed) fs.renameSync(backup, target);
    }
    fs.unlinkSync(journal);
  }
  fs.rmSync(work, { recursive: true, force: true });
}

function withPublication(root, prepare) {
  root = fs.realpathSync(root);
  const ticket = acquire(root);
  const work = path.join(root, '.catalog-build-transaction');
  const journal = path.join(work, 'publication.json');
  try {
    recover(root, work, journal);
    fs.mkdirSync(work);
    try {
      const changes = prepare(work);
      const entries = changes.map(([, target]) => ({
        target: path.relative(root, targetPath(root, target)), existed: fs.existsSync(target)
      }));
      const pending = journal + '.tmp';
      fs.writeFileSync(pending, JSON.stringify(entries), { flag: 'wx' });
      fs.renameSync(pending, journal);
      for (const [i, [source, target]] of changes.entries()) {
        if (entries[i].existed) fs.renameSync(target, path.join(work, 'previous-' + i));
        fs.renameSync(source, target);
      }
      fs.unlinkSync(journal); // Commit point. A later cleanup can safely discard backups.
    } finally { recover(root, work, journal); }
  } finally { fs.unlinkSync(ticket); }
}
module.exports = { withPublication };
