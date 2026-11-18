'use strict';
/**
 * طبقة SQLite (better-sqlite3) — تعمل في العملية الرئيسية فقط.
 *
 * التصميم:
 *  - records(collection, id, pos, data): كل عنصر (فاتورة/صنف/عميل...) صف مستقل،
 *    والبيانات كاملة في عمود data بصيغة JSON، و pos يحفظ الترتيب.
 *  - collections: تسجّل المجموعات التي حُفظت فعلاً، لنميّز "لم تُحفظ بعد" (نستخدم البيانات الابتدائية)
 *    عن "حُفظت وهي فارغة" (المستخدم حذف كل شيء عمداً).
 *  - kv: الإعدادات والقيم المفردة (إعدادات الشركة، الوضع الليلي...).
 *  - PRAGMA user_version يتتبع إصدار المخطط لترحيل البيانات عند التحديثات.
 */
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const MIGRATIONS = [
  // v1
  (db) =>
    db.exec(`
      CREATE TABLE collections (
        name     TEXT PRIMARY KEY,
        saved_at TEXT NOT NULL
      );
      CREATE TABLE records (
        collection TEXT    NOT NULL,
        id         TEXT    NOT NULL,
        pos        INTEGER NOT NULL,
        data       TEXT    NOT NULL,
        updated_at TEXT    NOT NULL,
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX idx_records_order ON records (collection, pos);
      CREATE TABLE kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `),
  // v2: الفوترة الإلكترونية — المرحلة الثانية (منصة فاتورة)
  (db) =>
    db.exec(`
      CREATE TABLE zatca_docs (
        invoice_id   TEXT PRIMARY KEY,
        icv          INTEGER NOT NULL,
        uuid         TEXT NOT NULL,
        number       TEXT NOT NULL,
        kind         TEXT NOT NULL,
        type_code    INTEGER NOT NULL,
        hash         TEXT NOT NULL,
        xml          TEXT NOT NULL,
        qr           TEXT NOT NULL,
        env          TEXT NOT NULL,
        status       TEXT NOT NULL,
        attempts     INTEGER NOT NULL DEFAULT 0,
        last_error   TEXT,
        response     TEXT,
        cleared_xml  TEXT,
        created_at   TEXT NOT NULL,
        submitted_at TEXT
      );
      CREATE INDEX idx_zatca_status ON zatca_docs (status, icv);
      CREATE TABLE zatca_state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `),
  // v3: نسخة من الفاتورة مع كل مستند مختوم — لاسترجاعها إن انقطعت الكهرباء قبل حفظ الفاتورة
  (db) => db.exec(`ALTER TABLE zatca_docs ADD COLUMN invoice_json TEXT;`),
  // v4 (Pro 1.0.1): ربط الفروع عن بعد + المحاسبة
  //  - sync_log: سجل تغييرات تملؤه المشغّلات (Triggers) تلقائياً لكل مجموعة مسجّلة في sync_tracked
  //    (الفرع: مستنداته التي تُرفع للمركز — المركز: البيانات الرئيسية التي تنزل للفروع)
  //  - branches / branch_records: في المركز فقط — الفروع المرتبطة ونسخة من بيانات كل فرع (منفصلة عن بيانات المركز)
  (db) =>
    db.exec(`
      CREATE TABLE sync_tracked (
        collection TEXT PRIMARY KEY
      );
      CREATE TABLE sync_log (
        seq        INTEGER PRIMARY KEY AUTOINCREMENT,
        collection TEXT NOT NULL,
        record_id  TEXT NOT NULL,
        op         TEXT NOT NULL,
        at         TEXT NOT NULL
      );
      CREATE INDEX idx_sync_log_col ON sync_log (collection, seq);
      CREATE TABLE sync_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TRIGGER trg_sync_ins AFTER INSERT ON records
        WHEN EXISTS (SELECT 1 FROM sync_tracked t WHERE t.collection = NEW.collection)
        BEGIN
          INSERT INTO sync_log (collection, record_id, op, at)
          VALUES (NEW.collection, NEW.id, 'u', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        END;
      CREATE TRIGGER trg_sync_upd AFTER UPDATE OF data ON records
        WHEN OLD.data IS NOT NEW.data AND EXISTS (SELECT 1 FROM sync_tracked t WHERE t.collection = NEW.collection)
        BEGIN
          INSERT INTO sync_log (collection, record_id, op, at)
          VALUES (NEW.collection, NEW.id, 'u', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        END;
      CREATE TRIGGER trg_sync_del AFTER DELETE ON records
        WHEN EXISTS (SELECT 1 FROM sync_tracked t WHERE t.collection = OLD.collection)
        BEGIN
          INSERT INTO sync_log (collection, record_id, op, at)
          VALUES (OLD.collection, OLD.id, 'd', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        END;
      CREATE TABLE branches (
        id           TEXT PRIMARY KEY,
        code         TEXT NOT NULL UNIQUE,
        name         TEXT NOT NULL,
        secret       TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'active',
        created_at   TEXT NOT NULL,
        last_seen_at TEXT,
        last_ip      TEXT,
        app_version  TEXT,
        pulled_seq   INTEGER NOT NULL DEFAULT 0,
        info         TEXT
      );
      CREATE TABLE branch_records (
        branch_id  TEXT    NOT NULL,
        collection TEXT    NOT NULL,
        id         TEXT    NOT NULL,
        pos        INTEGER NOT NULL DEFAULT 0,
        data       TEXT    NOT NULL,
        updated_at TEXT    NOT NULL,
        PRIMARY KEY (branch_id, collection, id)
      );
      CREATE INDEX idx_branch_records_col ON branch_records (branch_id, collection, pos);
      CREATE INDEX idx_records_updated ON records (collection, updated_at);
    `),
  // لإضافة تغيير مستقبلاً: أضف دالة جديدة هنا (لا تعدّل القديمة أبداً).
];

const MAX_BACKUPS = 60;

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const SYS_PREFIX = '__sl.';
const PROTECTED = new Set(['invoices', 'purchases', 'purchaseReturns', 'quotations']);

function openStore(userDataDir, { onBackup } = {}) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const file = path.join(userDataDir, 'ledger.db');
  const backupsDir = path.join(userDataDir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL'); // أمان أعلى عند انقطاع الكهرباء
  db.pragma('foreign_keys = ON');

  // ---- ترحيل المخطط (مع نسخة احتياطية قبل أي ترحيل على بيانات موجودة) ----
  let version = db.pragma('user_version', { simple: true });
  if (version > MIGRATIONS.length) {
    db.close();
    throw new Error(
      `قاعدة البيانات أحدث (v${version}) من هذا الإصدار من التطبيق (v${MIGRATIONS.length}). حدّث التطبيق.`
    );
  }
  if (version > 0 && version < MIGRATIONS.length) {
    db.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(file, path.join(backupsDir, `pre-migration-v${version}-${stamp()}.db`));
  }
  while (version < MIGRATIONS.length) {
    const target = version + 1;
    db.transaction(() => {
      MIGRATIONS[version](db);
      db.pragma(`user_version = ${target}`);
    })();
    version = target;
  }

  // ---- العبارات الجاهزة ----
  const q = {
    listCollections: db.prepare('SELECT name FROM collections'),
    readRecords: db.prepare('SELECT data FROM records WHERE collection = ? ORDER BY pos'),
    existing: db.prepare('SELECT id, pos, data FROM records WHERE collection = ?'),
    upsert: db.prepare(`
      INSERT INTO records (collection, id, pos, data, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (collection, id) DO UPDATE SET
        pos = excluded.pos, data = excluded.data, updated_at = excluded.updated_at`),
    remove: db.prepare('DELETE FROM records WHERE collection = ? AND id = ?'),
    positions: db.prepare('SELECT id, pos FROM records WHERE collection = ?'),
    setPos: db.prepare('UPDATE records SET pos = ? WHERE collection = ? AND id = ?'),
    count: db.prepare('SELECT COUNT(*) AS c FROM records WHERE collection = ?'),
    posRange: db.prepare('SELECT MIN(pos) AS lo, MAX(pos) AS hi FROM records WHERE collection = ?'),
    updateData: db.prepare('UPDATE records SET data = ?, updated_at = ? WHERE collection = ? AND id = ?'),
    markSaved: db.prepare(`
      INSERT INTO collections (name, saved_at) VALUES (?, ?)
      ON CONFLICT (name) DO UPDATE SET saved_at = excluded.saved_at`),
    readKv: db.prepare('SELECT key, value FROM kv'),
    upsertKv: db.prepare(`
      INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`),
  };

  function loadAll() {
    // سجل تالف واحد (انقطاع كهرباء أثناء الكتابة مثلاً) لا يجب أن يمنع تشغيل البرنامج كله: يُتجاوز ويُسجَّل
    const safe = (txt, where) => { try { return { ok: true, v: JSON.parse(txt) }; } catch (e) { console.error('[db] corrupt record skipped:', where, e && e.message); return { ok: false }; } };
    const collections = {};
    for (const { name } of q.listCollections.all()) {
      const list = [];
      for (const r of q.readRecords.all(name)) { const p = safe(r.data, name); if (p.ok) list.push(p.v); }
      collections[name] = list;
    }
    const kv = {};
    for (const { key, value } of q.readKv.all()) {
      if (key.startsWith(SYS_PREFIX)) continue;
      const p = safe(value, key); if (p.ok) kv[key] = p.v;
    }
    return { collections, kv };
  }

  /*
   * حماية الترخيص (طبقة ثانية بعد الواجهة): خارج فترة الترخيص لا تُنشأ مستندات جديدة
   * (فواتير، مشتريات، مرتجع مشتريات، عروض أسعار) حتى لو تم تجاوز الواجهة. التعديل على الموجود مسموح.
   */
  let createGuard = null;
  const guardNew = (name, ids, existingIds) => {
    if (!createGuard || !PROTECTED.has(name) || createGuard(name)) return;
    const have = existingIds || new Set(q.existing.all(name).map((r) => r.id));
    for (const id of ids) if (!have.has(String(id))) throw new Error('LICENSE_READ_ONLY');
  };

  const saveCollectionTx = db.transaction((name, items) => {
    const now = new Date().toISOString();
    const existing = new Map(q.existing.all(name).map((r) => [r.id, r]));
    guardNew(name, items.map((it, i) => (it && it.id != null ? String(it.id) : `__idx_${i}`)), new Set(existing.keys()));
    const seen = new Set();

    items.forEach((item, i) => {
      let id = item && item.id != null ? String(item.id) : `__idx_${i}`;
      if (seen.has(id)) id = `${id}__dup${i}`;
      seen.add(id);
      const json = JSON.stringify(item);
      const prev = existing.get(id);
      if (!prev || prev.data !== json || prev.pos !== i) {
        q.upsert.run(name, id, i, json, now);
      }
    });
    for (const id of existing.keys()) {
      if (!seen.has(id)) q.remove.run(name, id);
    }
    q.markSaved.run(name, now);
  });

  function saveCollection(name, items) {
    if (typeof name !== 'string' || !name) throw new Error('اسم المجموعة غير صالح');
    if (!Array.isArray(items)) throw new Error('المجموعة يجب أن تكون مصفوفة');
    saveCollectionTx(name, items);
  }

  /**
   * حفظ تفاضلي: يكتب فقط العناصر التي تغيّرت بدل إعادة كتابة المجموعة كلها.
   * patch = { upserts: [[id, index, item]], removes: [id], order?: [id...], head?, tail?, count }
   *  - order: ترتيب جديد كامل (تبديل/إدراج في المنتصف) → إعادة ترقيم pos
   *  - بدون order: الترتيب النسبي للعناصر الموجودة لم يتغيّر؛ نعدّل البيانات فقط،
   *    والعناصر الجديدة في البداية (head) تأخذ pos أصغر من الحالي، وفي النهاية (tail) أكبر.
   *    (pos لا يلزم أن يكون متتالياً، المهم الترتيب)
   *  - count للتحقق: إن لم يطابق عدد الصفوف بعد التطبيق نلغي المعاملة ويُعاد الحفظ كاملاً
   */
  const patchCollectionTx = db.transaction((name, patch) => {
    const now = new Date().toISOString();
    guardNew(name, (patch.upserts || []).map((u) => u[0]));
    for (const id of patch.removes || []) q.remove.run(name, String(id));
    if (Array.isArray(patch.order)) {
      for (const [id, pos, item] of patch.upserts || []) {
        q.upsert.run(name, String(id), pos, JSON.stringify(item), now);
      }
    } else {
      const head = patch.head | 0;
      const tail = patch.tail | 0;
      const count = patch.count | 0;
      const range = head || tail ? q.posRange.get(name) : null;
      const lo = range && range.lo != null ? range.lo : 0;
      const hi = range && range.hi != null ? range.hi : -1;
      for (const [id, i, item] of patch.upserts || []) {
        const json = JSON.stringify(item);
        if (i < head) q.upsert.run(name, String(id), lo - head + i, json, now);
        else if (i >= count - tail) q.upsert.run(name, String(id), hi + 1 + (i - (count - tail)), json, now);
        else if (q.updateData.run(json, now, name, String(id)).changes === 0) {
          throw new Error(`PATCH_MISMATCH ${name}: missing ${id}`);
        }
      }
    }
    if (Array.isArray(patch.order)) {
      const want = new Map(patch.order.map((id, i) => [String(id), i]));
      for (const r of q.positions.all(name)) {
        const p = want.get(r.id);
        if (p !== undefined && p !== r.pos) q.setPos.run(p, name, r.id);
      }
    }
    if (typeof patch.count === 'number') {
      const c = q.count.get(name).c;
      if (c !== patch.count) throw new Error(`PATCH_MISMATCH ${name}: ${c} != ${patch.count}`);
    }
    q.markSaved.run(name, now);
  });

  function patchCollection(name, patch) {
    if (typeof name !== 'string' || !name) throw new Error('اسم المجموعة غير صالح');
    if (!patch || typeof patch !== 'object') throw new Error('بيانات الحفظ غير صالحة');
    patchCollectionTx(name, patch);
  }

  function saveKv(key, value) {
    if (typeof key !== 'string' || !key) throw new Error('مفتاح غير صالح');
    if (key.startsWith(SYS_PREFIX)) throw new Error('مفتاح محجوز'); // بيانات النظام لا تُكتب من الواجهة
    q.upsertKv.run(key, JSON.stringify(value === undefined ? null : value), new Date().toISOString());
  }

  /** قيم نظام محجوزة (تاريخ أول تشغيل للتجربة...) — لا تظهر للواجهة ولا تكتبها */
  const sysGet = (key) => {
    const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(SYS_PREFIX + key);
    try { return r ? JSON.parse(r.value) : undefined; } catch { return undefined; }
  };
  const sysSet = (key, value) => q.upsertKv.run(SYS_PREFIX + key, JSON.stringify(value), new Date().toISOString());
  const setCreateGuard = (fn) => { createGuard = fn; };

  function rotateBackups() {
    const files = fs
      .readdirSync(backupsDir)
      .filter((f) => /^ledger-\d{8}-\d{6}\.db$/.test(f))
      .sort(); // الاسم يحتوي الوقت فالترتيب الأبجدي = زمني
    for (const f of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) {
      try { fs.unlinkSync(path.join(backupsDir, f)); } catch { /* تجاهل */ }
    }
  }

  async function backupNow() {
    const dest = path.join(backupsDir, `ledger-${stamp()}.db`);
    await db.backup(dest);
    rotateBackups();
    // نسخة إضافية إلى المجلد الخارجي الذي اختاره المستخدم (إن وُجد)
    if (onBackup) { try { onBackup(dest); } catch (err) { console.error('mirror backup failed', err); } }
    return dest;
  }

  /** نسخة احتياطية تلقائية: مرة واحدة على الأقل كل يوم عند التشغيل */
  async function backupIfNeeded() {
    const today = stamp().slice(0, 8);
    const has = fs.readdirSync(backupsDir).some((f) => f.startsWith(`ledger-${today}`));
    if (!has) return backupNow();
    return null;
  }

  function close() {
    try { db.close(); } catch { /* تجاهل */ }
  }

  /** نسخة احتياطية إلى مسار يختاره المستخدم (ملف .db) */
  async function backupTo(dest) {
    await db.backup(dest);
    return dest;
  }

  /** قائمة النسخ التلقائية الموجودة في مجلد backups */
  function listBackups() {
    return fs
      .readdirSync(backupsDir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => {
        const st = fs.statSync(path.join(backupsDir, f));
        return { name: f, path: path.join(backupsDir, f), size: st.size, mtime: st.mtime.toISOString() };
      })
      .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  }

  /**
   * حفظ دفعة واحدة ذرّية: كل تغييرات اللحظة (الفاتورة + المخزون + رصيد العميل...) تُكتب معاً أو لا يُكتب شيء.
   * عند انقطاع الكهرباء لا تبقى قاعدة البيانات في حالة نصفية (فاتورة بلا خصم مخزون مثلاً).
   * ops: [{ t: 'patch', name, patch } | { t: 'save', name, items } | { t: 'kv', key, value }]
   */
  const applyBatchTx = db.transaction((ops) => {
    for (const op of ops) {
      if (op.t === 'patch') patchCollection(op.name, op.patch);
      else if (op.t === 'save') saveCollection(op.name, op.items);
      else if (op.t === 'kv') saveKv(op.key, op.value);
      else throw new Error('عملية حفظ غير معروفة');
    }
  });
  function applyBatch(ops) {
    if (!Array.isArray(ops)) throw new Error('دفعة حفظ غير صالحة');
    applyBatchTx(ops);
  }

  /*
   * عمليات منخفضة المستوى لطبقة الشبكة (نسخة Pro — electron/netstore.cjs):
   * قراءة/كتابة سجل واحد أو قيمة واحدة داخل معاملة، مع نفس حماية الترخيص على المستندات الجديدة.
   */
  const qRec = db.prepare('SELECT pos, data FROM records WHERE collection = ? AND id = ?');
  const qKv1 = db.prepare('SELECT value FROM kv WHERE key = ?');
  const net = {
    tx: (fn) => db.transaction(fn)(),
    getRecord(name, id) {
      const r = qRec.get(name, String(id));
      if (!r) return null;
      try { return { pos: r.pos, item: JSON.parse(r.data) }; } catch { return { pos: r.pos, item: null }; }
    },
    putRecord(name, id, pos, item) { q.upsert.run(name, String(id), pos, JSON.stringify(item), new Date().toISOString()); },
    removeRecord(name, id) { return q.remove.run(name, String(id)).changes > 0; },
    posRange(name) { const r = q.posRange.get(name); return { lo: r && r.lo != null ? r.lo : 0, hi: r && r.hi != null ? r.hi : -1 }; },
    markSaved(name) { q.markSaved.run(name, new Date().toISOString()); },
    getKv(key) {
      const r = qKv1.get(key);
      if (!r) return undefined;
      try { return JSON.parse(r.value); } catch { return undefined; }
    },
    putKv(key, value) {
      if (key.startsWith(SYS_PREFIX)) throw new Error('مفتاح محجوز');
      q.upsertKv.run(key, JSON.stringify(value === undefined ? null : value), new Date().toISOString());
    },
    /** يرمي LICENSE_READ_ONLY عند إضافة مستند جديد لمجموعة محمية خارج فترة الترخيص (المستدعي يتأكد أنه جديد) */
    guardNewId(name) { if (createGuard && PROTECTED.has(name) && !createGuard(name)) throw new Error('LICENSE_READ_ONLY'); },
    orderedIds(name) { return q.positions.all(name).sort((a, b) => a.pos - b.pos).map((r) => r.id); },
    setPos(name, id, pos) { q.setPos.run(pos, name, String(id)); },
    clearCollection(name) { db.prepare('DELETE FROM records WHERE collection = ?').run(name); },
    readCollection(name) { return q.readRecords.all(name).map((r) => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean); },
  };

  /*
   * عمليات مزامنة الفروع (electron/branchsync.cjs):
   *  - سجل التغييرات (sync_log) يُملأ بالمشغّلات تلقائياً للمجموعات المسجّلة في sync_tracked
   *  - في المركز: جداول الفروع وبيانات كل فرع منفصلة عن بيانات المركز نفسه
   */
  const sq = {
    clearTracked: db.prepare('DELETE FROM sync_tracked'),
    addTracked: db.prepare('INSERT OR IGNORE INTO sync_tracked (collection) VALUES (?)'),
    listTracked: db.prepare('SELECT collection FROM sync_tracked ORDER BY collection'),
    maxSeq: db.prepare('SELECT MAX(seq) AS s FROM sync_log'),
    minSeq: db.prepare('SELECT MIN(seq) AS s FROM sync_log'),
    countAfter: db.prepare('SELECT COUNT(*) AS c FROM sync_log WHERE seq > ?'),
    readLog: db.prepare('SELECT seq, collection, record_id, op FROM sync_log WHERE seq > ? ORDER BY seq LIMIT ?'),
    prune: db.prepare('DELETE FROM sync_log WHERE seq <= ?'),
    pruneKeep: db.prepare('DELETE FROM sync_log WHERE seq <= (SELECT MAX(seq) FROM sync_log) - ?'),
    clearLog: db.prepare('DELETE FROM sync_log'),
    raw: db.prepare('SELECT pos, data FROM records WHERE collection = ? AND id = ?'),
    snap: db.prepare('SELECT collection, id, pos, data FROM records WHERE collection = ? AND id > ? ORDER BY id LIMIT ?'),
    metaGet: db.prepare('SELECT value FROM sync_meta WHERE key = ?'),
    metaSet: db.prepare(`INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`),
    brList: db.prepare('SELECT * FROM branches ORDER BY created_at'),
    brGet: db.prepare('SELECT * FROM branches WHERE id = ?'),
    brByCode: db.prepare('SELECT * FROM branches WHERE code = ?'),
    brInsert: db.prepare(`INSERT INTO branches (id, code, name, secret, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)`),
    brUpdate: db.prepare('UPDATE branches SET name = ?, code = ? WHERE id = ?'),
    brStatus: db.prepare('UPDATE branches SET status = ? WHERE id = ?'),
    brTouch: db.prepare('UPDATE branches SET last_seen_at = ?, last_ip = ?, app_version = ?, info = COALESCE(?, info) WHERE id = ?'),
    brPulled: db.prepare('UPDATE branches SET pulled_seq = ? WHERE id = ?'),
    brDelete: db.prepare('DELETE FROM branches WHERE id = ?'),
    brUpsert: db.prepare(`
      INSERT INTO branch_records (branch_id, collection, id, pos, data, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (branch_id, collection, id) DO UPDATE SET pos = excluded.pos, data = excluded.data, updated_at = excluded.updated_at`),
    brRemove: db.prepare('DELETE FROM branch_records WHERE branch_id = ? AND collection = ? AND id = ?'),
    brRead: db.prepare('SELECT data FROM branch_records WHERE branch_id = ? AND collection = ? ORDER BY pos, id'),
    brCounts: db.prepare('SELECT collection, COUNT(*) AS c, MAX(updated_at) AS last FROM branch_records WHERE branch_id = ? GROUP BY collection'),
    brPurge: db.prepare('DELETE FROM branch_records WHERE branch_id = ?'),
  };
  const sync = {
    tx: (fn) => db.transaction(fn)(),
    /** المجموعات التي يُسجَّل تغييرها (يُضبط عند التشغيل حسب دور الجهاز) */
    setTracked: db.transaction((list) => {
      const want = Array.from(new Set((list || []).map(String))).sort();
      const have = sq.listTracked.all().map((r) => r.collection);
      if (JSON.stringify(want) === JSON.stringify(have)) return false;
      sq.clearTracked.run();
      for (const c of want) sq.addTracked.run(c);
      return true;
    }),
    tracked: () => sq.listTracked.all().map((r) => r.collection),
    maxSeq: () => sq.maxSeq.get().s || 0,
    minSeq: () => sq.minSeq.get().s || 0,
    pendingAfter: (seq) => sq.countAfter.get(Number(seq) || 0).c,
    readLog: (afterSeq, limit = 500) => sq.readLog.all(Number(afterSeq) || 0, limit),
    pruneLog: (uptoSeq) => sq.prune.run(Number(uptoSeq) || 0).changes,
    /** يُبقي آخر keep تغيير فقط (سجل المركز لا يكبر بلا حد) */
    pruneKeep: (keep) => sq.pruneKeep.run(Math.max(1000, Number(keep) || 0)).changes,
    clearLog: () => sq.clearLog.run().changes,
    /** السجل الخام كما هو في القاعدة (نص JSON) — null إن حُذف */
    rawRecord(collection, id) { const r = sq.raw.get(collection, String(id)); return r ? { pos: r.pos, data: r.data } : null; },
    /** صفحة من كل سجلات مجموعة (للمزامنة الكاملة الأولى) مرتبة بالمعرّف */
    snapshotPage: (collection, afterId, limit) => sq.snap.all(collection, String(afterId || ''), limit),
    metaGet(key, def = null) { const r = sq.metaGet.get(key); if (!r) return def; try { return JSON.parse(r.value); } catch { return def; } },
    metaSet(key, value) { sq.metaSet.run(key, JSON.stringify(value)); },
    branches: {
      list: () => sq.brList.all(),
      get: (id) => sq.brGet.get(String(id)) || null,
      byCode: (code) => sq.brByCode.get(String(code)) || null,
      add: ({ id, code, name, secret }) => { sq.brInsert.run(id, code, name, secret, new Date().toISOString()); return sq.brGet.get(id); },
      update: (id, { name, code }) => sq.brUpdate.run(name, code, String(id)).changes > 0,
      setStatus: (id, status) => sq.brStatus.run(status, String(id)).changes > 0,
      touch: (id, { ip, version, info }) => sq.brTouch.run(new Date().toISOString(), ip || null, version || null, info === undefined ? null : JSON.stringify(info), String(id)),
      setPulled: (id, seq) => sq.brPulled.run(Number(seq) || 0, String(id)),
      remove: db.transaction((id, purge) => { if (purge) sq.brPurge.run(String(id)); return sq.brDelete.run(String(id)).changes > 0; }),
      /** تطبيق دفعة مرفوعة من فرع: [{c, id, op: 'u'|'d', pos, data}] — data نص JSON */
      apply: db.transaction((branchId, items) => {
        const now = new Date().toISOString();
        let n = 0;
        for (const it of items || []) {
          if (!it || typeof it.c !== 'string' || it.id == null) continue;
          if (it.op === 'd') { n += sq.brRemove.run(branchId, it.c, String(it.id)).changes; continue; }
          if (typeof it.data !== 'string') continue;
          JSON.parse(it.data); // يرفض البيانات التالفة قبل حفظها
          sq.brUpsert.run(branchId, it.c, String(it.id), Number(it.pos) || 0, it.data, now);
          n++;
        }
        return n;
      }),
      read(branchId, collection) {
        const out = [];
        for (const r of sq.brRead.all(String(branchId), collection)) { try { out.push(JSON.parse(r.data)); } catch { /* سجل تالف */ } }
        return out;
      },
      counts: (branchId) => sq.brCounts.all(String(branchId)),
    },
  };

  return { db, file, backupsDir, loadAll, saveCollection, patchCollection, saveKv, applyBatch, sysGet, sysSet, setCreateGuard, backupNow, backupIfNeeded, backupTo, listBackups, close, net, sync };
}

/**
 * يتحقق أن الملف قاعدة بيانات صالحة لهذا التطبيق قبل استعادتها.
 * يرمي خطأ برسالة عربية واضحة إن لم تكن صالحة.
 */
function validateBackupFile(file) {
  let probe;
  try {
    probe = new Database(file, { readonly: true, fileMustExist: true });
  } catch {
    throw new Error('الملف ليس قاعدة بيانات SQLite صالحة.');
  }
  try {
    const version = probe.pragma('user_version', { simple: true });
    if (version > MIGRATIONS.length) {
      throw new Error('هذه النسخة أحدث من إصدار البرنامج الحالي. حدّث البرنامج أولاً.');
    }
    const tables = probe
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name);
    for (const t of ['records', 'collections', 'kv']) {
      if (!tables.includes(t)) throw new Error('الملف ليس نسخة احتياطية من الدفتر الذكي.');
    }
    const check = probe.pragma('quick_check', { simple: true });
    if (check !== 'ok') throw new Error('ملف النسخة الاحتياطية تالف.');
    const n = probe.prepare('SELECT COUNT(*) AS c FROM records').get().c;
    return { version, records: n };
  } finally {
    probe.close();
  }
}

module.exports = { openStore, validateBackupFile, stamp };
