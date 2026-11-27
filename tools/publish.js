// SPDX-License-Identifier: Apache-2.0
const fs = require('node:fs');
const path = require('node:path');

// Build and stamp share this lock. Keep backups until every replacement succeeds.
function withPublication(root, prepare) {
  const lock = path.join(root, '.catalog-build.lock');
  const fd = fs.openSync(lock, 'wx');
  let work, keepBackups = false;
  try {
    work = fs.mkdtempSync(path.join(root, '.catalog-build-'));
    const changes = prepare(work);
    const attempted = [];
    try {
      for (const [source, target] of changes) {
        const backup = path.join(work, 'previous-' + attempted.length);
        const entry = { target, backup: null, installed: false };
        attempted.push(entry);
        if (fs.existsSync(target)) {
          fs.renameSync(target, backup);
          entry.backup = backup;
        }
        fs.renameSync(source, target);
        entry.installed = true;
      }
    } catch (cause) {
      const errors = [];
      for (const [i, entry] of attempted.reverse().entries()) {
        try {
          if (entry.installed) fs.renameSync(entry.target, path.join(work, 'rejected-' + i));
          if (entry.backup) fs.renameSync(entry.backup, entry.target);
        } catch (error) { errors.push(error); }
      }
      if (errors.length) {
        keepBackups = true;
        throw new AggregateError([cause, ...errors], '복구에 실패했습니다. 기존 파일 보관 위치: ' + work);
      }
      throw cause;
    }
  } finally {
    try { if (work && !keepBackups) fs.rmSync(work, { recursive: true, force: true }); }
    finally { fs.closeSync(fd); fs.unlinkSync(lock); }
  }
}
module.exports = { withPublication };
