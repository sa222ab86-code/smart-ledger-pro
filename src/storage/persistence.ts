import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/* ------------------------------------------------------------------ *
 * واجهة الجسر (preload) — موجودة فقط داخل Electron
 * ------------------------------------------------------------------ */
/** حالة خدمة الطباعة في ويندوز */
export interface SpoolerStatus { state: 'running' | 'stopped' | 'starting' | 'stopping' | 'paused' | 'unknown'; startType: 'auto' | 'manual' | 'disabled' | ''; detail?: string }

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error';
  version: string;
  newVersion?: string;
  percent?: number;
  manual?: boolean;
  error?: string;
  /** التحديث التلقائي مفعّل؟ (افتراضياً نعم) */
  autoUpdate?: boolean;
}

export interface ArchiveConfig {
  backupDir: string; invoiceDir: string; invoicePdf: boolean; invoiceXml: boolean;
  lastMirrorAt: string | null; lastMirrorError: string | null; lastMirrorFile: string | null;
  lastInvoiceError: string | null; archivedCount: number;
  /** نسخة احتياطية عند فتح البرنامج وعند إغلاقه */
  backupOnOpenClose?: boolean;
  backupDirOk: boolean | null; invoiceDirOk: boolean | null; localBackupsDir: string;
}
export interface ArchiveApi {
  get(): Promise<ArchiveConfig>;
  chooseDir(kind: 'backup' | 'invoices'): Promise<{ ok: boolean; canceled?: boolean; error?: string; config: ArchiveConfig }>;
  set(patch: { invoicePdf?: boolean; invoiceXml?: boolean; backupOnOpenClose?: boolean; clear?: 'backup' | 'invoices' }): Promise<ArchiveConfig>;
  backupNow(): Promise<{ ok: boolean; local: string; mirrored: string | null; config: ArchiveConfig }>;
  invoicePdf(opts: { number: string; date: string; html: string; overwrite?: boolean }): Promise<{ ok: boolean; path?: string; existed?: boolean; skipped?: boolean; error?: string }>;
  open(kind: 'backup' | 'invoices' | 'local'): Promise<boolean>;
}

export type BatchOp =
  | { t: 'patch'; name: string; patch: unknown }
  | { t: 'save'; name: string; items: unknown[] }
  | { t: 'kv'; key: string; value: unknown; base?: unknown };

export interface ZatcaStatus {
  active: boolean;
  env: 'sandbox' | 'simulation' | 'production' | null;
  envLabel: string | null;
  seller: Record<string, string> | null;
  egs: { uuid: string; serial: string; branch: string; industry: string; location: string } | null;
  onboardedAt: string | null;
  icv: number;
  counts: Record<string, number>;
  problems: { invoice_id: string; number: string; status: string; last_error: string | null; created_at: string; attempts: number }[];
  certInfo: { issuer: string; serial: string } | null;
  queue: { running: boolean; lastRunAt: string | null; lastError: string | null };
  /** الفواتير غير المرسلة (بانتظار/خطأ/مرفوضة) وأقدمها */
  unsent?: { c: number; oldest: string | null };
}
export interface ZatcaMsg { code: string; category: string; message: string; status: string }
export interface ZatcaDocDetail {
  invoiceId: string; number: string; icv: number; uuid: string; kind: string; typeCode: number; env: string;
  status: string; attempts: number; lastError: string | null; createdAt: string; submittedAt: string | null;
  errors: ZatcaMsg[]; warnings: ZatcaMsg[]; infos: ZatcaMsg[]; reportingStatus: string | null; response: unknown;
}

export interface ZatcaApi {
  status(): Promise<ZatcaStatus>;
  onboard(input: unknown): Promise<{ ok: boolean; error?: string; results?: { label: string; httpStatus: number; errors: string[]; warnings: string[] }[]; status?: ZatcaStatus }>;
  sign(payload: { invoiceId: string; doc: unknown; snapshot?: unknown }): Promise<{ ok: boolean; error?: string; details?: string[]; uuid?: string; icv?: number; invoiceHash?: string; qr?: string; status?: string; reused?: boolean; totals?: { taxable: number; tax: number; total: number } }>;
  runQueue(): Promise<ZatcaStatus>;
  docStatuses(): Promise<Record<string, { status: string; message: string | null }>>;
  orphans?(ids: string[]): Promise<{ invoiceId: string; number: string; createdAt: string; invoice: unknown; zatca: { uuid: string; icv: number; hash: string; qr: string; kind: string; status: string; message: string | null }; totals: { taxable: number | null; tax: number | null } }[]>;
  onQueue?(cb: (d: { lastRunAt: string | null; lastError: string | null }) => void): () => void;
  docDetail?(id: string): Promise<ZatcaDocDetail | null>;
  retryDoc(id: string): Promise<boolean>;
  disconnect(): Promise<ZatcaStatus>;
  exportXml(id: string): Promise<{ ok: boolean; canceled?: boolean; error?: string; path?: string }>;
  onStatus(cb: (d: { invoiceId: string; status: string; message: string | null; qr?: string | null }) => void): () => void;
  onProgress(cb: (d: { step: string; detail: string; at: string }) => void): () => void;
}

export interface OsPrinter { name: string; displayName: string; isDefault: boolean; description: string }
export interface BackupInfo { name: string; path: string; size: number; mtime: string }

export interface LicenseStatus {
  state: 'trial' | 'trial_expired' | 'active' | 'expired' | 'wrong_device' | 'needs_update';
  /** نظام ويندوز منسوخ من جهاز آخر (اختلف العتاد كله) — يظهر رمز جديد لهذا الجهاز */
  cloned?: boolean;
  machineCode: string;
  today: string;
  /** بصمة مفتاح التحقق داخل هذه النسخة */
  keyId?: string;
  clockWarning?: boolean;
  customer?: string;
  type?: 'year' | 'life';
  issued?: string;
  expires?: string | null;
  devices?: number;
  licenseId?: string;
  daysLeft?: number | null;
  trialStart?: string;
  trialEnds?: string;
  trialDays?: number;
  reason?: string;
  /** المزايا المتاحة للتشغيل (تشمل المكتسبة لمفاتيح ما قبل فصل الترخيص) */
  features?: string[];
  /** المزايا المرخّصة صراحةً في المفتاح — تلزم للعمليات التي تبدأ من جديد كالربط بمنصة فاتورة */
  licensedFeatures?: string[];
  /** حالة اشتراك كل ميزة: تاريخ الانتهاء والأيام المتبقية (سالبة بعد الانتهاء) والمهلة */
  featureStates?: Record<string, { expires: string | null; daysLeft: number | null; graceDays: number }>;
  /** أقل نسخة من البرنامج يقبلها هذا المفتاح */
  minVersion?: string | null;
  appVersion?: string;
}

export interface LedgerApi {
  isElectron: true;
  ui?: { setZoom(factor: number): void };
  db: {
    loadAll(): Promise<Snapshot>;
    saveCollection(name: string, items: unknown[]): Promise<boolean>;
    patchCollection?(name: string, patch: CollectionPatch): Promise<boolean>;
    patchCollectionSync?(name: string, patch: CollectionPatch): boolean;
    saveKv(key: string, value: unknown): Promise<boolean>;
    saveCollectionSync(name: string, items: unknown[]): boolean;
    /** حفظ ذرّي لعدة تغييرات في معاملة واحدة */
    batch?(ops: BatchOp[]): Promise<boolean>;
    batchSync?(ops: BatchOp[]): boolean;
    saveKvSync(key: string, value: unknown): boolean;
  };
  print: {
    list(): Promise<OsPrinter[]>;
    /** تشخيص مصادر قائمة الطابعات (Chromium / PowerShell / السجل) */
    listDiag?(): Promise<{ chromium: number; chromiumError: string; powershell: number; powershellError: string; registry: number; registryError: string; source: string; at: string; spooler?: SpoolerStatus | null }>;
    /** حالة خدمة الطباعة في ويندوز (Print Spooler) */
    spoolerStatus?(): Promise<SpoolerStatus>;
    /** إصلاحها بصلاحية المسؤول: تشغيل تلقائي + إعادة تشغيل + حذف الطباعات العالقة */
    repairSpooler?(): Promise<{ ok: boolean; reason?: string; cancelled?: boolean; status?: SpoolerStatus }>;
    /** pageSize 'printer': ورق الطابعة كما في تعريفها (بلا مقاس مخصص) وهوامش منطقة الطباعة */
    page(opts: { silent?: boolean; deviceName?: string; pageSize?: 'A4' | 'A5' | 'CF' | 'thermal' | 'printer'; copies?: number; pageSizeMm?: { width: number; height: number } }): Promise<{ ok: boolean; reason?: string }>;
    html(opts: { html: string; silent?: boolean; deviceName?: string; pageSize?: 'A4' | 'A5' | 'CF' | 'thermal' | 'printer'; pageSizeMm?: { width: number; height: number }; copies?: number; landscape?: boolean }): Promise<{ ok: boolean; reason?: string }>;
    pdf(opts: { html: string; defaultName: string; landscape?: boolean }): Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
    escposHtml?(opts: { html: string; printer: string; paper?: '80' | '58'; dpi?: 'auto' | '203' | '180'; widthDots: number; cssWidthMm: number; offsetMm?: number; cut?: boolean; copies?: number }): Promise<{ ok: boolean; reason?: string; detail?: string }>;
    /** صورة الإيصال عبر تعريف ويندوز (GDI) بورق الطابعة الافتراضي — reason 'unavailable' خارج ويندوز */
    gdiHtml?(opts: { html: string; printer: string; paper?: '80' | '58'; cssWidthMm: number; offsetMm?: number; copies?: number }): Promise<{ ok: boolean; reason?: string; detail?: string }>;
    pagePdf?(opts: { defaultName: string; pageSize: 'A4' | 'A5' | 'thermal'; heightMm?: number; open?: boolean }): Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
  };
  /** مشاركة PDF: يُحفظ الملف وينسخ للحافظة ثم يُفتح التطبيق (واتساب/البريد/المجلد) */
  clipboard?: { readText(): Promise<string>; writeText(t: string): Promise<boolean> };
  network?: NetworkApi;
  branches?: BranchesApi;
  license?: {
    status(): Promise<LicenseStatus>;
    activate(key: string): Promise<{ ok: boolean; error?: string; status?: LicenseStatus }>;
    remove(): Promise<LicenseStatus>;
    /** استرجاع كلمة المرور: طلب (باركود) يقرؤه مصدر المفاتيح، ثم التحقق من الرمز */
    pwResetChallenge?(o: { user: string; name?: string }): Promise<{ ok: boolean; request?: string; expiresAt?: number; error?: string }>;
    pwResetVerify?(o: { user: string; code: string }): Promise<{ ok: boolean; error?: string }>;
  };
  devices?: {
    openDrawer(opts: { printer?: string; pin?: 0 | 1 }): Promise<{ ok: boolean; reason?: string }>;
    scalePorts(): Promise<{ port: string; label?: string }[]>;
    scaleStart(cfg: Record<string, unknown>): Promise<{ ok: boolean; reason?: string }>;
    scaleStop(): Promise<{ ok: boolean }>;
    onScaleData(cb: (line: string) => void): () => void;
    onScaleStatus(cb: (s: { connected: boolean; port: string; reason?: string }) => void): () => void;
    displayOpen(opts?: { windowed?: boolean }): Promise<{ ok: boolean; secondary?: boolean }>;
    displayClose(): Promise<{ ok: boolean }>;
    displayInfo(): Promise<{ displays: number; open: boolean }>;
    displayUpdate(state: unknown): void;
    vfdStart(cfg: { port: string; baud: number; dataBits: number; parity: string }): Promise<{ ok: boolean; reason?: string }>;
    vfdStop(): Promise<{ ok: boolean }>;
    vfdWrite(bytes: number[]): Promise<{ ok: boolean }>;
    onVfdStatus(cb: (s: { connected: boolean; port: string; reason?: string }) => void): () => void;
  };
  share?: {
    file(opts: { fileName: string; html?: string; pageSize?: 'A4' | 'A5' | 'thermal'; heightMm?: number; target: 'whatsapp' | 'email' | 'folder'; phone?: string; email?: string; text?: string; subject?: string }): Promise<{ ok: boolean; path?: string; copied?: boolean; opened?: boolean; error?: string }>;
  };
  files: {
    saveText(opts: { defaultName: string; content: string; filters?: { name: string; extensions: string[] }[] }): Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
  };
  backup: {
    list(): Promise<BackupInfo[]>;
    exportTo(): Promise<{ ok: boolean; canceled?: boolean; path?: string }>;
    restoreFromFile(): Promise<{ ok: boolean; canceled?: boolean; error?: string }>;
    restoreFromAuto(name: string): Promise<{ ok: boolean; canceled?: boolean; error?: string }>;
  };
  app: { getVersion(): Promise<string>; setIcon?(dataUrl: string | null): Promise<boolean>; refocus?(): void; setFullScreen?(on: boolean): Promise<boolean>; minimize?(): Promise<boolean>; quit?(): Promise<boolean> };
  zatca?: ZatcaApi;
  archive?: ArchiveApi;
  update: {
    getState(): Promise<UpdateState>;
    check(): Promise<void>;
    setAuto?(enabled: boolean): Promise<UpdateState>;
    install(): Promise<void>;
    onStatus(cb: (s: UpdateState) => void): () => void;
  };
}

/** نسخة Pro: ربط الأجهزة على الشبكة المحلية */
export interface NetInfo {
  edition: 'pro';
  role: 'standalone' | 'server' | 'client';
  /** فرع مرتبط بالمركز: الحفظ بالدمج (تُرسل «ما كانت الشاشة تعرفه» مع كل تعديل) */
  merged?: boolean;
  /** رمز الجهاز في الترقيم (A، B...) — فارغ للجهاز المستقل */
  tag: string;
  deviceId: string;
  deviceName: string;
  host: string;
  port: number;
  token: string;
  hasToken: boolean;
  server: { listening: boolean; error: string | null; port: number; ips: string[] } | null;
  clients: { deviceId: string; tag?: string; name?: string; ip?: string; lastSeen?: string }[];
  connection: { connected: boolean; error: string; host: string; port: number } | null;
  localIps: string[];
}
export type NetChange =
  | { t: 'c'; name: string; upserts?: { id: string; item: unknown; at?: 'head' | 'tail' }[]; removes?: string[]; order?: string[]; full?: unknown[] }
  | { t: 'kv'; key: string; value: unknown };
export interface NetworkApi {
  info(): Promise<NetInfo>;
  configure(cfg: Partial<{ role: NetInfo['role']; tag: string; host: string; port: number; token: string; deviceName: string; regenerateToken: boolean }>): Promise<{ ok: boolean; error?: string; needsRestart?: boolean }>;
  discover(): Promise<{ host: string; port: number; name: string; version: string }[]>;
  test(opts: { host: string; port?: number; token: string }): Promise<{ ok: boolean; error?: string; name?: string; version?: string; tag?: string }>;
  relaunch(): Promise<boolean>;
  onChanges(cb: (changes: NetChange[]) => void): () => void;
  onReload(cb: () => void): () => void;
  onResync?(cb: () => void): () => void;
  onStatus(cb: (s: { connected: boolean; error: string; host: string; port: number }) => void): () => void;
  onFlushBeforeClose(cb: () => void): () => void;
  flushedForClose(): void;
}

/* ------------------------------------------------------------------ *
 * نسخة Pro: ربط الفروع عن بعد
 * ------------------------------------------------------------------ */
export type BranchMode = 'none' | 'hq' | 'branch';
export interface BranchSyncStatus {
  connected: boolean; syncing: boolean; lastSyncAt: string | null; lastError: string; lastAttemptAt: string | null;
  hqName: string; uploaded: number; downloaded: number; pendingUp: number; initialized: boolean;
  host: string; port: number; branchId: string; code: string; name: string;
}
export interface BranchRow {
  id: string; code: string; name: string; status: 'active' | 'suspended'; createdAt: string;
  lastSeenAt: string | null; lastIp: string | null; appVersion: string | null; pulledSeq: number;
  info: { device?: string; lan?: string } | null; counts: Record<string, number>;
}
export interface BranchesInfo {
  mode: BranchMode; intervalSec: number; blocked: string; lanRole: string; localIps: string[]; defaultPort: number;
  hq?: {
    port: number; publicHost: string; name: string;
    server: { listening: boolean; error: string | null; port: number } | null;
    /** الممر السحابي: hqKey السرّي لا يصل إلى الواجهة */
    relay?: { url: string; hqId: string; configured: boolean } | null;
    relayStatus?: { enabled: boolean; connected: boolean; lastError: string; lastConnectedAt: string | null; attempts: number; served: number } | null;
  };
  branches?: BranchRow[];
  branch?: { host: string; port: number; id: string; name: string; code: string; hqName: string; viaRelay?: boolean; sync: BranchSyncStatus | null };
}
type Res<T = object> = Promise<({ ok: true; error?: undefined } & T) | { ok: false; error?: string }>;
export interface BranchesApi {
  info(): Promise<BranchesInfo>;
  configure(input: { mode?: BranchMode; publicHost?: string; port?: number; hqName?: string; intervalSec?: number; relayUrl?: string }): Promise<{ ok: boolean; error?: string; needsRestart?: boolean }>;
  testLink(code: string): Promise<{ ok: boolean; error?: string; hqName?: string; version?: string; branch?: { id: string; code: string; name: string }; host?: string; port?: number }>;
  join(code: string): Promise<{ ok: boolean; error?: string; needsRestart?: boolean; hqName?: string }>;
  syncNow(): Promise<{ ok: boolean; error?: string; up?: number; down?: number }>;
  add(input: { name: string; code?: string }): Res<{ branch: BranchRow; linkCode: string }>;
  update(id: string, input: { name?: string; code?: string }): Res;
  setActive(id: string, on: boolean): Res;
  remove(id: string, purge: boolean): Res;
  linkCode(id: string): Res<{ linkCode: string }>;
  rekey(id: string): Res<{ linkCode: string }>;
  data(id: string, collections: string[]): Promise<Record<string, unknown[]>>;
  onStatus(cb: (s: BranchSyncStatus) => void): () => void;
  onChanged(cb: () => void): () => void;
}

declare global {
  interface Window {
    ledger?: LedgerApi;
  }
}

interface Snapshot {
  collections: Record<string, unknown[]>;
  kv: Record<string, unknown>;
}

type Pending = { kind: 'collection' | 'kv'; value: unknown };

export interface CollectionPatch {
  /** [id, index, item] — وفي نسخة Pro المتصلة: [id, index, item, base] للدمج الثلاثي على الجهاز الرئيسي */
  upserts: ([string, number, unknown] | [string, number, unknown, unknown])[];
  removes: string[];
  /** يُرسل فقط عند تغيّر الترتيب بشكل عام (تبديل/إدراج في المنتصف) → إعادة ترقيم */
  order?: string[];
  /** عدد العناصر الجديدة المضافة في بداية القائمة (بدون إعادة ترقيم الباقي) */
  head?: number;
  /** عدد العناصر الجديدة المضافة في نهاية القائمة */
  tail?: number;
  count: number;
}

/* ------------------------------------------------------------------ *
 * الحالة الداخلية
 * ------------------------------------------------------------------ */
const DEBOUNCE_MS = 300;
const RETRY_MS = 2000;
const LS_PREFIX = 'ledger:';

let snapshot: Snapshot = { collections: {}, kv: {} };
/** نسخة Pro: معلومات الشبكة (null = متصفح أو قبل التحميل) */
let netInfo: NetInfo | null = null;
const networked = () => !!netInfo && (netInfo.role !== 'standalone' || !!netInfo.merged);
export const getNetInfo = () => netInfo;
/**
 * رمز هذا الفرع في المركز (RYD، B01...) — فارغ للمركز وللجهاز غير المرتبط.
 * يدخل في ترقيم الفواتير حتى لا يتكرر رقم بين فرعين عند التجميع في المركز.
 */
let branchCode = '';
export const getBranchCode = () => branchCode;

/** المجموعات التي يرفعها الفرع ويقرأها المركز في تقاريره الموحّدة */
export const BRANCH_REPORT_COLLECTIONS = ['invoices', 'products', 'purchases', 'purchaseReturns', 'cashMovements', 'zReports'] as const;
export interface BranchBundle {
  invoices: unknown[]; products: unknown[]; purchases: unknown[];
  purchaseReturns: unknown[]; cashMovements: unknown[]; zReports: unknown[];
}
/** فروع هذا المركز (فارغة لغير المركز) — لمحدّد النطاق في التقارير */
export async function hqBranches(): Promise<{ id: string; code: string; name: string }[]> {
  if (!window.ledger?.branches) return [];
  try {
    const i = await window.ledger.branches.info();
    if (i.mode !== 'hq' || !Array.isArray(i.branches)) return [];
    return i.branches.map((b) => ({ id: b.id, code: b.code, name: b.name }));
  } catch { return []; }
}
/** بيانات فرع كما رفعها — تُقرأ عند الطلب فقط كي لا تثقل فتح البرنامج */
export async function hqBranchData(id: string): Promise<BranchBundle> {
  const empty: BranchBundle = { invoices: [], products: [], purchases: [], purchaseReturns: [], cashMovements: [], zReports: [] };
  if (!window.ledger?.branches) return empty;
  try {
    const d = await window.ledger.branches.data(id, [...BRANCH_REPORT_COLLECTIONS]);
    const take = (k: string) => (Array.isArray(d?.[k]) ? (d[k] as unknown[]) : []);
    return { invoices: take('invoices'), products: take('products'), purchases: take('purchases'), purchaseReturns: take('purchaseReturns'), cashMovements: take('cashMovements'), zReports: take('zReports') };
  } catch { return empty; }
}
/** آخر قيمة معروفة من الجهاز الرئيسي لكل مفتاح kv — تُرسل مع التعديل للدمج الثلاثي */
const kvBase = new Map<string, unknown>();
const pending = new Map<string, Pending>();
let timer: number | undefined;
let chain: Promise<void> = Promise.resolve();
const errorListeners = new Set<(hasError: boolean) => void>();

export function onSaveError(cb: (hasError: boolean) => void): () => void {
  errorListeners.add(cb);
  return () => errorListeners.delete(cb);
}
const emitError = (v: boolean) => errorListeners.forEach((cb) => cb(v));

/* ------------------------------------------------------------------ *
 * التحميل الأولي — يُستدعى مرة واحدة قبل رسم التطبيق
 * ------------------------------------------------------------------ */
/**
 * تنظيف دفاعي للبيانات المحمّلة (نسخ قديمة/مستعادة/مستوردة): سجل ناقص لا يُسقط الواجهة.
 * - كل مجموعة مصفوفة من كائنات (يُسقط null والقيم الشاذة)
 * - المستندات التي لها أصناف: items مصفوفة دائماً
 */
const DOC_KEYS = new Set(['invoices', 'purchases', 'purchaseReturns', 'quotations', 'parkedOrders']);
function sanitizeSnapshot(snap: Snapshot): Snapshot {
  const collections: Snapshot['collections'] = {};
  for (const [k, v] of Object.entries(snap?.collections || {})) {
    const list = Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [];
    if (DOC_KEYS.has(k)) for (const d of list as { items?: unknown }[]) if (!Array.isArray(d.items)) d.items = [];
    collections[k] = list;
  }
  return { collections, kv: snap?.kv && typeof snap.kv === 'object' ? snap.kv : {} };
}

export async function hydrate(): Promise<void> {
  if (window.ledger) {
    // إن فشل التحميل نرمي الخطأ: لا نبدأ بالبيانات الابتدائية كي لا نكتب فوق بيانات حقيقية
    if (window.ledger.network) {
      try { netInfo = await window.ledger.network.info(); } catch (e) { console.warn('network info', e); }
    }
    if (window.ledger.branches) {
      try {
        const bi = await window.ledger.branches.info();
        branchCode = bi && bi.mode === 'branch' && bi.branch ? String(bi.branch.code || '') : '';
      } catch (e) { console.warn('branches info', e); }
    }
    snapshot = sanitizeSnapshot(await window.ledger.db.loadAll());
    baselines.clear();
    kvBase.clear();
    for (const [k, v] of Object.entries(snapshot.kv)) kvBase.set(k, v);
    if (networked()) startNetworkSync();
    for (const [k, items] of Object.entries(snapshot.collections)) {
      if (Array.isArray(items)) setBaseline(k, items);
    }
    return;
  }
  // وضع المتصفح (التطوير بدون Electron): localStorage
  const next: Snapshot = { collections: {}, kv: {} };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(LS_PREFIX)) continue;
      const raw = localStorage.getItem(k);
      if (raw == null) continue;
      const rest = k.slice(LS_PREFIX.length);
      if (rest.startsWith('c:')) next.collections[rest.slice(2)] = JSON.parse(raw);
      else if (rest.startsWith('k:')) next.kv[rest.slice(2)] = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('localStorage read failed', e);
  }
  snapshot = sanitizeSnapshot(next);
}

/* ------------------------------------------------------------------ *
 * الحفظ التفاضلي للمجموعات
 *   مع ١٨ ألف صنف كان أي تعديل (بيع واحد يُنقص المخزون) يرسل المصفوفة كاملة
 *   إلى العملية الرئيسية فتُحوَّل كلها إلى JSON وتُقارن صفاً صفاً → تهنيج.
 *   الآن نقارن بالمرجع (React لا يغيّر مراجع العناصر التي لم تتعدّل)
 *   ونرسل فقط العناصر المتغيّرة/المحذوفة.
 * ------------------------------------------------------------------ */
interface Baseline { ids: string[]; byId: Map<string, unknown> }
/** آخر نسخة مؤكَّد حفظها في قاعدة البيانات لكل مجموعة */
const baselines = new Map<string, Baseline>();

function idsOf(items: unknown[]): string[] | null {
  const ids = new Array<string>(items.length);
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as { id?: unknown } | null;
    if (!it || it.id == null) return null; // بلا معرّف → الحفظ الكامل
    const id = String(it.id);
    if (seen.has(id)) return null; // معرّف مكرر → الحفظ الكامل
    seen.add(id);
    ids[i] = id;
  }
  return ids;
}

function makeBaseline(items: unknown[], ids: string[]): Baseline {
  const byId = new Map<string, unknown>();
  for (let i = 0; i < items.length; i++) byId.set(ids[i], items[i]);
  return { ids, byId };
}

function setBaseline(key: string, items: unknown[]) {
  const ids = idsOf(items);
  if (ids) baselines.set(key, makeBaseline(items, ids));
  else baselines.delete(key);
}

/** يُرجع null إن لزم الحفظ الكامل، أو patch (قد يكون فارغاً) */
function diffCollection(key: string, items: unknown[]): { patch: CollectionPatch; next: Baseline } | null {
  const base = baselines.get(key);
  if (!base) return null;
  const ids = idsOf(items);
  if (!ids) return null;
  const upserts: CollectionPatch['upserts'] = [];
  const nextIds = new Set<string>();
  const withBase = networked();
  for (let i = 0; i < items.length; i++) {
    const id = ids[i];
    nextIds.add(id);
    const prev = base.byId.get(id);
    if (prev !== items[i]) upserts.push(withBase ? [id, i, items[i], prev === undefined ? null : prev] : [id, i, items[i]]);
  }
  const removes: string[] = [];
  for (const id of base.ids) if (!nextIds.has(id)) removes.push(id);

  // الحالات الشائعة لا تحتاج إعادة ترقيم كل الصفوف:
  //   [جديد..., ...القديم بنفس الترتيب (ناقص المحذوف)..., جديد...]
  let head = 0;
  while (head < ids.length && !base.byId.has(ids[head])) head++;
  let tail = 0;
  while (tail < ids.length - head && !base.byId.has(ids[ids.length - 1 - tail])) tail++;
  let sameOrder = true;
  let j = head;
  for (const id of base.ids) {
    if (!nextIds.has(id)) continue; // محذوف
    if (ids[j] !== id) { sameOrder = false; break; }
    j++;
  }
  if (sameOrder && j !== ids.length - tail) sameOrder = false;

  const patch: CollectionPatch = { upserts, removes, count: items.length };
  if (!sameOrder) patch.order = ids;
  else {
    if (head) patch.head = head;
    if (tail) patch.tail = tail;
  }
  return { patch, next: makeBaseline(items, ids) };
}

const isEmptyPatch = (p: CollectionPatch) => p.upserts.length === 0 && p.removes.length === 0 && !p.order;

async function writeCollection(key: string, items: unknown[]): Promise<void> {
  const api = window.ledger!;
  if (api.db.patchCollection) {
    const d = diffCollection(key, items);
    if (d) {
      if (isEmptyPatch(d.patch)) return;
      try {
        const ok = await api.db.patchCollection(key, d.patch);
        if (ok) baselines.set(key, d.next);
        return;
      } catch (err) {
        // عدم تطابق مع القاعدة → نرجع للحفظ الكامل أدناه
        console.warn(`patch "${key}" failed, falling back to full save`, err);
      }
    }
  }
  const ok = await api.db.saveCollection(key, items);
  if (ok) setBaseline(key, items);
}

function writeCollectionSync(key: string, items: unknown[]) {
  const api = window.ledger!;
  if (api.db.patchCollectionSync) {
    const d = diffCollection(key, items);
    if (d) {
      if (isEmptyPatch(d.patch)) return;
      if (api.db.patchCollectionSync(key, d.patch)) { baselines.set(key, d.next); return; }
    }
  }
  if (api.db.saveCollectionSync(key, items)) setBaseline(key, items);
}

/* ------------------------------------------------------------------ *
 * الحفظ
 * ------------------------------------------------------------------ */
async function writeOne(key: string, p: Pending): Promise<void> {
  const api = window.ledger;
  if (api) {
    if (p.kind === 'collection') await writeCollection(key, p.value as unknown[]);
    else await api.db.saveKv(key, p.value);
  } else {
    localStorage.setItem(`${LS_PREFIX}${p.kind === 'collection' ? 'c' : 'k'}:${key}`, JSON.stringify(p.value));
  }
}

/**
 * يبني دفعة حفظ ذرّية من كل التغييرات المعلّقة. يعيد null إن لم تتوفر (المتصفح/نسخة قديمة).
 * commit: يُستدعى بعد نجاح الكتابة لتحديث الأساس (baselines) للحفظ التفاضلي التالي.
 */
function buildBatch(batch: [string, Pending][]): { ops: BatchOp[]; commit: () => void } | null {
  const api = window.ledger;
  if (!api?.db.batch) return null;
  const ops: BatchOp[] = [];
  const after: (() => void)[] = [];
  for (const [key, p] of batch) {
    if (p.kind === 'kv') { ops.push(networked() && kvBase.has(key) ? { t: 'kv', key, value: p.value, base: kvBase.get(key) } : { t: 'kv', key, value: p.value }); continue; }
    const items = p.value as unknown[];
    const d = diffCollection(key, items);
    if (d) {
      if (isEmptyPatch(d.patch)) continue;
      ops.push({ t: 'patch', name: key, patch: d.patch });
      after.push(() => baselines.set(key, d.next));
    } else {
      ops.push({ t: 'save', name: key, items });
      after.push(() => setBaseline(key, items));
    }
  }
  return { ops, commit: () => after.forEach((f) => f()) };
}

function flush(): Promise<void> {
  window.clearTimeout(timer);
  timer = undefined;
  urgent = false;
  const batch = Array.from(pending.entries());
  pending.clear();
  if (batch.length === 0) return chain;

  chain = chain.then(async () => {
    // 1) المسار الآمن: كل التغييرات في معاملة واحدة
    const b = buildBatch(batch);
    if (b) {
      if (b.ops.length === 0) { emitError(false); return; }
      try {
        const res = await window.ledger!.db.batch!(b.ops) as unknown;
        if (res) {
          b.commit();
          // نسخة Pro: الجهاز الرئيسي يعيد النسخة المدموجة (مثل المخزون بعد بيع من جهاز آخر)
          const changes = (res as { changes?: NetChange[] }).changes;
          if (Array.isArray(changes) && changes.length) applyRemoteChanges(changes);
          emitError(false);
          return;
        }
      } catch (err) {
        console.warn('atomic batch failed, falling back to per-key save', err);
        if (networked()) {
          // الشبكة: لا حفظ كامل احتياطي (قد يمسح ما أضافته الأجهزة الأخرى) — نعيد المحاولة لاحقاً
          for (const [key, p] of batch) if (!pending.has(key)) pending.set(key, p);
          emitError(true);
          timer = window.setTimeout(() => void flush(), RETRY_MS);
          return;
        }
      }
    }
    // 2) احتياطي: حفظ كل مفتاح على حدة
    let failed = false;
    for (const [key, p] of batch) {
      try {
        await writeOne(key, p);
      } catch (err) {
        failed = true;
        console.error(`Failed to save "${key}"`, err);
        // أعد الجدولة إلا إذا وصلت نسخة أحدث لنفس المفتاح
        if (!pending.has(key)) pending.set(key, p);
      }
    }
    emitError(failed);
    if (failed) timer = window.setTimeout(() => void flush(), RETRY_MS);
  });
  return chain;
}

function schedule(key: string, value: unknown) {
  // نُبقي اللقطة محدَّثة: أي مكوّن يُعاد تركيبه لاحقاً (تنقّل بين الشاشات) يقرأ آخر قيمة وليس قيمة بدء التشغيل
  if (Array.isArray(value)) snapshot.collections[key] = value;
  else snapshot.kv[key] = value;
  pending.set(key, { kind: Array.isArray(value) ? 'collection' : 'kv', value });
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void flush(), urgent ? 0 : DEBOUNCE_MS);
}

/** كتابة مجموعة مباشرة (لمكوّن غير معروض حالياً — مثل تصفير تقارير الإقفال عند إعادة التعيين) */
export function replaceCollection(key: string, value: unknown[]) { schedule(key, value); }

let urgent = false;
/**
 * العملية التالية (بيع، مرتجع، سداد...) تُحفظ فوراً بدل الانتظار 300ms —
 * يقلّص ما قد يضيع عند انقطاع الكهرباء المفاجئ إلى أجزاء من الثانية.
 */
export function saveUrgently() {
  urgent = true;
}

/** يحفظ كل ما هو معلّق فوراً (قبل تثبيت تحديث مثلاً) */
export function flushNow(): Promise<void> {
  return flush();
}

/** حفظ متزامن عند إغلاق النافذة كي لا يضيع آخر تعديل */
function flushSync() {
  const api = window.ledger;
  if (pending.size === 0) return;
  const b = buildBatch(Array.from(pending.entries()));
  if (b && api?.db.batchSync) {
    try {
      if (b.ops.length === 0 || api.db.batchSync(b.ops)) { b.commit(); pending.clear(); return; }
    } catch (e) { console.error('batchSync failed', e); }
  }
  for (const [key, p] of Array.from(pending.entries())) {
    try {
      if (api) {
        if (p.kind === 'collection') writeCollectionSync(key, p.value as unknown[]);
        else api.db.saveKvSync(key, p.value);
      } else {
        localStorage.setItem(`${LS_PREFIX}${p.kind === 'collection' ? 'c' : 'k'}:${key}`, JSON.stringify(p.value));
      }
      pending.delete(key);
    } catch (e) {
      console.error('flushSync failed', e);
    }
  }
}
window.addEventListener('beforeunload', flushSync);
window.addEventListener('pagehide', flushSync);

/* ------------------------------------------------------------------ *
 * نسخة Pro: تطبيق تغييرات الأجهزة الأخرى (من الجهاز الرئيسي)
 *   - السجل الذي لم يُعدَّل محلياً يُستبدل بنسخة الرئيسي، والمعدَّل محلياً (لم يُحفظ بعد) يبقى
 *     ويُرسل لاحقاً مع «ما كان يعرفه» ليدمجه الرئيسي حقلاً بحقل
 *   - الأساس (baseline) يتحدث بنفس العناصر فلا تُعاد كتابة ما وصل من الشبكة
 * ------------------------------------------------------------------ */
const remoteSetters = new Map<string, Set<(v: unknown) => void>>();
const echoKv = new Map<string, unknown>();

type Rec = { id?: unknown };
const rid = (it: unknown) => String((it as Rec)?.id);

function applyCollectionChange(ch: Extract<NetChange, { t: 'c' }>): unknown[] | null {
  const name = ch.name;
  if (ch.full) {
    const list = ch.full.slice();
    setBaseline(name, list);
    return list;
  }
  const cur = (snapshot.collections[name] as unknown[]) || [];
  if (!idsOf(cur)) return null; // مجموعة بلا معرّفات: تُحدَّث عند إعادة التحميل
  const base = baselines.get(name) || { ids: [], byId: new Map<string, unknown>() };
  const byId = new Map(base.byId);
  let list = cur.slice();
  let changed = false;

  if (ch.removes?.length) {
    const rm = new Set(ch.removes.map(String));
    const before = list.length;
    list = list.filter((it) => !rm.has(rid(it)));
    for (const id of rm) byId.delete(id);
    changed ||= list.length !== before;
  }
  const index = new Map<string, number>();
  list.forEach((it, i) => index.set(rid(it), i));
  const head: unknown[] = [], tail: unknown[] = [];
  for (const u of ch.upserts || []) {
    const id = String(u.id);
    const i = index.get(id);
    if (i !== undefined) {
      const local = list[i];
      if (local === base.byId.get(id) || !base.byId.has(id)) {
        // لا تعديل محلي معلّق: نأخذ نسخة الرئيسي
        list[i] = u.item;
        byId.set(id, u.item);
        changed = true;
      }
      // وإلا: تعديل محلي لم يُحفظ — يبقى، والأساس القديم يُستخدم للدمج عند حفظه
    } else {
      (u.at === 'head' ? head : tail).push(u.item);
      byId.set(id, u.item);
      changed = true;
    }
  }
  if (head.length || tail.length) list = [...head.reverse(), ...list, ...tail];
  if (ch.order?.length) {
    const pos = new Map(ch.order.map((id, i) => [String(id), i]));
    if (list.every((it) => pos.has(rid(it))) && list.length === ch.order.length) {
      list.sort((a, b) => pos.get(rid(a))! - pos.get(rid(b))!);
      changed = true;
    }
  }
  if (!changed) return null;
  baselines.set(name, { ids: list.map(rid).filter((id) => byId.has(id)), byId });
  return list;
}

/** يطبّق تغييرات وصلت من الجهاز الرئيسي على الحالة والشاشة */
export function applyRemoteChanges(changes: NetChange[]) {
  const touched = new Map<string, unknown>();
  for (const ch of changes) {
    if (!ch) continue;
    if (ch.t === 'kv') {
      kvBase.set(ch.key, ch.value);
      if (pending.has(ch.key)) continue; // تعديل محلي معلّق يفوز (ويُدمج على الرئيسي)
      snapshot.kv[ch.key] = ch.value;
      echoKv.set(ch.key, ch.value);
      touched.set(ch.key, ch.value);
    } else if (ch.t === 'c') {
      const list = applyCollectionChange(ch);
      if (!list) continue;
      snapshot.collections[ch.name] = list;
      touched.set(ch.name, list);
    }
  }
  for (const [key, value] of touched) remoteSetters.get(key)?.forEach((fn) => fn(value));
}

let syncStarted = false;
function startNetworkSync() {
  const n = window.ledger?.network;
  if (!n || syncStarted) return;
  syncStarted = true;
  n.onChanges((changes) => applyRemoteChanges(changes));
  // الجهاز الرئيسي أُعيد تشغيله أو فاتنا الكثير: تحميل كامل
  n.onReload(() => { void flush().finally(() => window.location.reload()); });
  // الجهاز الفرعي: حفظ كل ما هو معلّق على الرئيسي قبل إغلاق البرنامج
  n.onFlushBeforeClose(() => { void flush().finally(() => n.flushedForClose()); });
}

/* ------------------------------------------------------------------ *
 * الـ Hook: بديل useState يحفظ في SQLite تلقائياً
 *   - المصفوفات (أصناف، فواتير، عملاء...) → جدول records
 *   - غيرها (إعدادات، تفضيلات) → جدول kv
 * ------------------------------------------------------------------ */
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function usePersistentState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const init = typeof initial === 'function' ? (initial as () => T)() : initial;

    if (Array.isArray(init)) {
      return key in snapshot.collections ? (snapshot.collections[key] as T) : init;
    }
    if (key in snapshot.kv) {
      const saved = snapshot.kv[key];
      // دمج سطحي: الحقول الجديدة التي تضيفها التحديثات تأخذ قيمها الافتراضية
      if (isPlainObject(init) && isPlainObject(saved)) return { ...init, ...saved } as T;
      return saved as T;
    }
    return init;
  });

  // نسخة Pro: تحديثات الأجهزة الأخرى تصل إلى هذه الحالة مباشرة
  useEffect(() => {
    let set = remoteSetters.get(key);
    if (!set) { set = new Set(); remoteSetters.set(key, set); }
    const fn = (v: unknown) => setValue(v as T);
    set.add(fn);
    return () => { set!.delete(fn); };
  }, [key]);

  useEffect(() => {
    // قيمة وصلت من الجهاز الرئيسي: لا تُعاد كتابتها إليه
    if (echoKv.has(key) && echoKv.get(key) === value) { echoKv.delete(key); return; }
    schedule(key, value);
  }, [key, value]);

  return [value, setValue];
}
