'use strict';
/**
 * نسخة Pro — مخزن البيانات المشترك على الجهاز الرئيسي.
 *
 * كل الأجهزة (الرئيسي نفسه والفرعية) تكتب عبر apply()، والكتابة «متسامحة» لا تستبدل القائمة كاملة:
 *  - تعديل سجل موجود: دمج ثلاثي (ما كان يعرفه الجهاز ← ما عدّله ← الموجود الآن) — كل جهاز يغيّر الحقول التي عدّلها فقط
 *  - الحقول العدّادة (مخزون الصنف، رصيد العميل) تُجمع كفرق: بيع حبة من جهازين = نقص حبتين، لا حبة واحدة
 *  - سجل جديد يُضاف في أول القائمة أو آخرها، والحذف يحذف سجلاً بعينه
 *  - عدّادات الترقيم تؤخذ بالأكبر
 * كل تغيير يُسجَّل في سجل تغييرات برقم متسلسل (rev) تقرؤه الأجهزة الأخرى لتحديث شاشاتها فوراً.
 */
const crypto = require('node:crypto');

/** إعدادات خاصة بكل جهاز — لا تُشارك أبداً (طابعات، ميزان، مظهر، آخر مستخدم...) */
const LOCAL_KV = new Set([
  'deviceSettings', 'hideTaskbar', 'isDarkMode', 'isLayoutReversed', 'labelSettings', 'lastUserId',
  'previewTemplate', 'printSettings', 'retailPrintTemplate', 'scaleSettings', 'selectedRetailPrinterId',
  'showChangeBox', 'sidebarCollapsed', 'touchMode', 'uiLanguage', 'posSearchDropdown', 'inventoryCountSession',
]);
const LOCAL_COLLECTIONS = new Set(['printersList']);
const isLocalKey = (kind, key) => (kind === 'kv' ? LOCAL_KV.has(key) : LOCAL_COLLECTIONS.has(key));
const opIsLocal = (op) => (op.t === 'kv' ? LOCAL_KV.has(op.key) : LOCAL_COLLECTIONS.has(op.name));

/** الحقول العدّادة لكل مجموعة: تُدمج بالفرق */
const COUNTERS = { products: ['stock'], customers: ['balance'] };
/** قيم تُدمج بأخذ الأكبر (ترقيم المستندات وأرقام الطلبات) */
const MAX_KV = new Set(['docCounters', 'orderCounter']);

const LOG_KEEP = 5000;

const isPlain = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const round6 = (n) => Math.round(n * 1e6) / 1e6;

function deepEq(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEq(a[k], b[k])) return false;
  return true;
}

/**
 * دمج ثلاثي على مستوى الحقول.
 * base = ما كان الجهاز يعرفه، mine = ما أرسله الجهاز، theirs = الموجود حالياً في القاعدة
 */
function merge3(base, mine, theirs, counters = []) {
  if (!isPlain(base) || !isPlain(mine) || !isPlain(theirs)) return mine;
  const out = { ...theirs };
  const keys = new Set([...Object.keys(base), ...Object.keys(mine)]);
  for (const k of keys) {
    const inMine = Object.prototype.hasOwnProperty.call(mine, k);
    if (deepEq(base[k], mine[k]) && inMine === Object.prototype.hasOwnProperty.call(base, k)) continue; // لم يغيّره الجهاز
    if (counters.includes(k) && isNum(base[k]) && isNum(mine[k]) && isNum(theirs[k])) {
      out[k] = round6(theirs[k] + (mine[k] - base[k]));
    } else if (!inMine) {
      delete out[k];
    } else {
      out[k] = mine[k];
    }
  }
  return out;
}

function maxMerge(cur, mine) {
  if (isNum(cur) && isNum(mine)) return Math.max(cur, mine);
  if (isPlain(cur) && isPlain(mine)) {
    const out = { ...cur };
    for (const [k, v] of Object.entries(mine)) out[k] = isNum(v) && isNum(cur[k]) ? Math.max(v, cur[k]) : v;
    return out;
  }
  return mine === undefined ? cur : mine;
}

function createNetStore(store) {
  const P = store.net;
  if (!P) throw new Error('db.cjs بدون عمليات الشبكة');
  const epoch = crypto.randomBytes(6).toString('hex');
  let rev = 0;
  const log = []; // { rev, origin, changes }
  const listeners = new Set();

  function record(changes, origin) {
    if (!changes.length) return rev;
    rev += 1;
    const entry = { rev, origin, changes };
    log.push(entry);
    if (log.length > LOG_KEEP) log.splice(0, log.length - LOG_KEEP);
    for (const cb of listeners) { try { cb(entry); } catch (e) { console.error('[net] listener', e); } }
    return rev;
  }

  /* ------------------------------ تطبيق العمليات ------------------------------ */

  function applyPatch(name, patch) {
    const out = { t: 'c', name, upserts: [], removes: [] };
    for (const id of patch.removes || []) if (P.removeRecord(name, id)) out.removes.push(String(id));
    const head = patch.head | 0;
    const tail = patch.tail | 0;
    const count = patch.count | 0;
    let range = null;
    const counters = COUNTERS[name] || [];
    for (const u of patch.upserts || []) {
      if (!Array.isArray(u)) continue;
      const [id, index, item, base] = u;
      const sid = String(id);
      const cur = P.getRecord(name, sid);
      if (cur) {
        const merged = base != null && cur.item ? merge3(base, item, cur.item, counters) : item;
        P.putRecord(name, sid, cur.pos, merged);
        out.upserts.push({ id: sid, item: merged });
      } else {
        P.guardNewId(name);
        if (!range) range = P.posRange(name);
        // جديد: في أول القائمة (فواتير، أصناف جديدة...) أو في آخرها
        let atHead;
        if (Array.isArray(patch.order)) atHead = index < count / 2;
        else if (index < head) atHead = true;
        else if (index >= count - tail) atHead = false;
        else atHead = index === 0;
        const pos = atHead ? --range.lo : ++range.hi;
        P.putRecord(name, sid, pos, item);
        out.upserts.push({ id: sid, item, at: atHead ? 'head' : 'tail' });
      }
    }
    // إعادة ترتيب (سحب وإفلات): تُطبَّق فقط إن كانت القائمة على الجهاز الرئيسي هي نفسها (لا إضافات متزامنة)
    if (Array.isArray(patch.order)) {
      const want = patch.order.map(String);
      const have = P.orderedIds(name);
      if (want.length === have.length && new Set(want).size === want.length && have.every((id) => want.includes(id))) {
        want.forEach((id, i) => P.setPos(name, id, i));
        if (!deepEq(want, have)) out.order = want;
      }
    }
    P.markSaved(name);
    return out.upserts.length || out.removes.length || out.order ? [out] : [];
  }

  function applySave(name, items) {
    if (!Array.isArray(items)) throw new Error('المجموعة يجب أن تكون مصفوفة');
    const have = P.orderedIds(name);
    const withIds = items.every((it) => it && it.id != null);
    if (!withIds || have.length === 0) {
      // مجموعة جديدة أو بلا معرّفات: استبدال كامل
      P.clearCollection(name);
      const seen = new Set();
      items.forEach((it, i) => {
        let id = it && it.id != null ? String(it.id) : `__idx_${i}`;
        if (seen.has(id)) id = `${id}__dup${i}`;
        seen.add(id);
        P.putRecord(name, id, i, it);
      });
    } else {
      // موجودة على الرئيسي: إضافة/تحديث دون حذف ما أضافته أجهزة أخرى
      let range = P.posRange(name);
      for (const it of items) {
        const sid = String(it.id);
        const cur = P.getRecord(name, sid);
        if (cur) P.putRecord(name, sid, cur.pos, it);
        else { P.guardNewId(name); P.putRecord(name, sid, ++range.hi, it); }
      }
    }
    P.markSaved(name);
    return [{ t: 'c', name, full: P.readCollection(name) }];
  }

  function applyKv(key, value, base, hasBase) {
    const cur = P.getKv(key);
    let merged = value;
    if (MAX_KV.has(key)) merged = maxMerge(cur, value);
    else if (hasBase && isPlain(base) && isPlain(value) && isPlain(cur)) merged = merge3(base, value, cur, []);
    P.putKv(key, merged);
    return { t: 'kv', key, value: merged };
  }

  /**
   * ops: [{ t: 'patch', name, patch } | { t: 'save', name, items } | { t: 'kv', key, value, base? }]
   * origin: معرّف الجهاز. self = الجهاز الرئيسي نفسه (إعداداته الخاصة تُحفظ ولا تُشارك)
   */
  function apply(ops, origin, { self = false } = {}) {
    if (!Array.isArray(ops)) throw new Error('دفعة حفظ غير صالحة');
    const shared = [];
    P.tx(() => {
      for (const op of ops) {
        const local = opIsLocal(op);
        if (local && !self) continue; // إعدادات جهاز فرعي لا تُكتب على الرئيسي
        let ch;
        if (op.t === 'patch') ch = applyPatch(op.name, op.patch || {});
        else if (op.t === 'save') ch = applySave(op.name, op.items);
        else if (op.t === 'kv') ch = [applyKv(op.key, op.value, op.base, Object.prototype.hasOwnProperty.call(op, 'base'))];
        else throw new Error('عملية حفظ غير معروفة');
        if (!local) shared.push(...ch);
      }
    });
    const r = record(shared, origin);
    return { ok: true, rev: r, epoch, changes: shared };
  }

  /** كل البيانات المشتركة (بدون إعدادات الجهاز الرئيسي الخاصة) */
  function loadShared() {
    const all = store.loadAll();
    const collections = {};
    for (const [k, v] of Object.entries(all.collections)) if (!LOCAL_COLLECTIONS.has(k)) collections[k] = v;
    const kv = {};
    for (const [k, v] of Object.entries(all.kv)) if (!LOCAL_KV.has(k)) kv[k] = v;
    return { collections, kv, rev, epoch };
  }

  /** التغييرات بعد رقم معيّن (عدا تغييرات الجهاز نفسه) — أو طلب إعادة تحميل كاملة */
  function changesSince(since, clientEpoch, origin) {
    if (clientEpoch !== epoch) return { reload: true, rev, epoch };
    since = Number(since) || 0;
    if (since > rev) return { reload: true, rev, epoch };
    if (log.length && since < log[0].rev - 1) return { reload: true, rev, epoch };
    const changes = [];
    for (const e of log) if (e.rev > since && e.origin !== origin) changes.push(...e.changes);
    return { rev, epoch, changes };
  }

  /** ينتظر حتى يتغير شيء بعد since أو تنتهي المهلة */
  function waitChanges(since, clientEpoch, origin, timeoutMs) {
    const now = changesSince(since, clientEpoch, origin);
    if (now.reload || now.changes.length) return Promise.resolve(now);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        listeners.delete(onChange);
        clearTimeout(t);
        resolve(changesSince(since, clientEpoch, origin));
      };
      const onChange = (e) => { if (e.origin !== origin) finish(); };
      const t = setTimeout(finish, timeoutMs);
      listeners.add(onChange);
    });
  }

  const onChange = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };

  return { apply, loadShared, changesSince, waitChanges, onChange, epoch: () => epoch, rev: () => rev };
}

module.exports = { createNetStore, merge3, maxMerge, deepEq, LOCAL_KV, LOCAL_COLLECTIONS, isLocalKey, opIsLocal, COUNTERS };
