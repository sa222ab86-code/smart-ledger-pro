'use strict';
// للاختبار فقط: واجهة better-sqlite3 فوق node:sqlite المدمج في Node 22+ (لا يدخل في البرنامج المبني)
const { DatabaseSync } = require('node:sqlite');
class Database {
  constructor(file, opts = {}) {
    if (opts.fileMustExist && !require('node:fs').existsSync(file)) throw new Error('missing');
    this._db = new DatabaseSync(file, { readOnly: !!opts.readonly });
    this._depth = 0;
  }
  exec(sql) { this._db.exec(sql); return this; }
  prepare(sql) {
    const st = this._db.prepare(sql);
    return { run: (...a) => st.run(...a), get: (...a) => st.get(...a), all: (...a) => st.all(...a) };
  }
  pragma(s, o = {}) {
    const rows = this._db.prepare(`PRAGMA ${s}`).all();
    if (o.simple) { const r = rows[0]; return r ? Object.values(r)[0] : undefined; }
    return rows;
  }
  transaction(fn) {
    const self = this;
    return function (...args) {
      const d = self._depth++;
      const sp = `sp${d}`;
      self._db.exec(d === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`);
      try {
        const r = fn.apply(this, args);
        self._db.exec(d === 0 ? 'COMMIT' : `RELEASE ${sp}`);
        return r;
      } catch (e) {
        self._db.exec(d === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
        throw e;
      } finally { self._depth--; }
    };
  }
  async backup(dest) { this._db.exec(`VACUUM INTO '${String(dest).replace(/'/g, "''")}'`); return {}; }
  close() { this._db.close(); }
}
module.exports = Database;
