/**
 * المستخدمون والصلاحيات
 *  - كلمات المرور لا تُحفظ أبداً كنص: نحفظ بصمة SHA-256 مكرَّرة مع ملح عشوائي لكل مستخدم
 *  - المدير يملك كل الصلاحيات دائماً (لا يمكن أن يُقفل البرنامج على صاحبه)
 */
import type { AppUser } from '../types';

/* ----------------------------- الصلاحيات ----------------------------- */
export const PERMISSION_GROUPS = [
  {
    label: 'نقطة البيع',
    items: [
      { id: 'pos.sell', label: 'البيع وإصدار الفواتير' },
      { id: 'pos.voidItem', label: 'حذف صنف من السلة أو تفريغها' },
      { id: 'pos.discount', label: 'تطبيق خصم على الفاتورة' },
      { id: 'pos.editPrice', label: 'تعديل سعر الصنف في السلة' },
      { id: 'pos.belowCost', label: 'البيع بأقل من سعر التكلفة (تجاوز المنع)' },
      { id: 'pos.credit', label: 'البيع الآجل والدفع الجزئي' },
      { id: 'pos.costPeek', label: 'رؤية تكلفة الصنف وربحه في شاشة البيع (ضغط مطوّل)' },
    ],
  },
  {
    label: 'الفواتير والتقارير',
    items: [
      { id: 'invoices.view', label: 'عرض الفواتير وإعادة طباعتها' },
      { id: 'invoices.collect', label: 'تحصيل سداد الفواتير الآجلة' },
      { id: 'cash.manage', label: 'الصندوق (إدخال وصرف وتعديل الحركات)' },
      { id: 'cash.delete', label: 'حذف حركة من الصندوق (المدير)' },
      { id: 'sales.return', label: 'مرتجع المبيعات' },
      { id: 'reports.view', label: 'التقارير' },
      { id: 'reports.close', label: 'الإقفال اليومي (كل الكاشيرية)' },
      { id: 'pos.closeShift', label: 'إقفال ورديته (مبيعاته فقط)' },
      { id: 'quotations.manage', label: 'عروض الأسعار' },
    ],
  },
  {
    label: 'الأصناف والمخزون',
    items: [
      { id: 'products.manage', label: 'إضافة وتعديل الأصناف والمجموعات' },
      { id: 'products.delete', label: 'حذف الأصناف' },
      { id: 'inventory.manage', label: 'تعديل المخزون والجرد' },
      { id: 'purchases.manage', label: 'المشتريات ومرتجعها والموردون' },
    ],
  },
  {
    label: 'المحاسبة والفروع (Pro)',
    items: [
      { id: 'accounting.view', label: 'عرض القيود والقوائم المالية' },
      { id: 'accounting.manage', label: 'القيود اليدوية والسندات ودليل الحسابات وإعدادات المحاسبة' },
      { id: 'branches.manage', label: 'ربط الفروع وإدارتها' },
    ],
  },
  {
    label: 'الإدارة',
    items: [
      { id: 'customers.manage', label: 'إدارة العملاء' },
      { id: 'settings.manage', label: 'الإعدادات والطابعات والنسخ الاحتياطي' },
      { id: 'users.manage', label: 'إدارة المستخدمين والصلاحيات' },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]['items'][number]['id'];
const FLAT_ITEMS: { id: Permission; label: string }[] = [];
for (const g of PERMISSION_GROUPS as readonly { items: readonly { id: string; label: string }[] }[]) {
  for (const it of g.items) FLAT_ITEMS.push({ id: it.id as Permission, label: it.label });
}
export const ALL_PERMISSIONS: Permission[] = FLAT_ITEMS.map((i) => i.id);
export const permissionLabel = (p: Permission) => FLAT_ITEMS.find((i) => i.id === p)?.label || p;

export type UserRole = AppUser['role'];
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'مدير',
  supervisor: 'مشرف',
  cashier: 'كاشير',
  custom: 'صلاحيات مخصصة',
};
export const ROLE_PRESETS: Record<Exclude<UserRole, 'custom'>, Permission[]> = {
  admin: ALL_PERMISSIONS,
  // رؤية التكلفة في شاشة البيع: للمدير فقط، ويمنحها لمن يختار بالصلاحيات المخصصة
  // حذف حركات الصندوق للمدير وحده — التصحيح يكون بالتعديل لا بالمحو
  supervisor: ALL_PERMISSIONS.filter((p) => p !== 'users.manage' && p !== 'settings.manage' && p !== 'pos.costPeek' && p !== 'cash.delete' && p !== 'branches.manage' && p !== 'accounting.manage'),
  cashier: ['pos.sell', 'pos.voidItem', 'invoices.view', 'pos.closeShift'],
};

export function permissionsOf(u: AppUser | null | undefined): Set<Permission> {
  if (!u) return new Set();
  if (u.role === 'admin') return new Set(ALL_PERMISSIONS);
  if (u.role === 'custom') return new Set((u.permissions || []) as Permission[]);
  return new Set(ROLE_PRESETS[u.role] || []);
}
export const can = (u: AppUser | null | undefined, p: Permission) => permissionsOf(u).has(p);

/** الصلاحية المطلوبة لفتح كل شاشة */
export const VIEW_PERMISSION: Record<string, Permission> = {
  pos: 'pos.sell',
  dailyReports: 'reports.view',
  stats: 'reports.view',
  dailyClosing: 'reports.close',
  salesLog: 'invoices.view',
  invoices: 'invoices.view',
  creditInvoices: 'invoices.view',
  cashBox: 'cash.manage',
  quotations: 'quotations.manage',
  products: 'products.manage',
  productGroups: 'products.manage',
  barcodeLabels: 'products.manage',
  promotions: 'products.manage',
  inventory: 'inventory.manage',
  customers: 'customers.manage',
  suppliers: 'purchases.manage',
  purchases: 'purchases.manage',
  purchaseReturns: 'purchases.manage',
  users: 'users.manage',
  printers: 'settings.manage',
  devices: 'settings.manage',
  settings: 'settings.manage',
  appSettings: 'settings.manage',
  network: 'settings.manage',
  accounting: 'accounting.view',
  branches: 'branches.manage',
  einvoice: 'settings.manage',
  backup: 'settings.manage',
};
export const canView = (u: AppUser | null | undefined, view: string) => {
  // شاشة الإقفال: للإقفال اليومي، أو لإقفال الكاشير ورديته فقط
  if (view === 'dailyClosing') return can(u, 'reports.close') || can(u, 'pos.closeShift');
  const p = VIEW_PERMISSION[view];
  return !p || can(u, p);
};
/** أول شاشة متاحة للمستخدم (للدخول أو عند منعه من الشاشة الحالية) */
export function firstAllowedView(u: AppUser | null | undefined): string {
  const order = ['pos', 'invoices', 'products', 'inventory', 'customers', 'dailyReports', 'quotations', 'purchases', 'settings'];
  return order.find((v) => canView(u, v)) || 'pos';
}

/* ------------------------------ SHA-256 ------------------------------ */
// تنفيذ صغير بلا مكتبات (يعمل في أي بيئة دون الحاجة لـ crypto.subtle)
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Bytes(msg: Uint8Array): Uint8Array {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = msg.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const bits = len * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(total - 4, bits >>> 0);
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [A, B, C, D, E, F, G, H] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((E >>> 6) | (E << 26)) ^ ((E >>> 11) | (E << 21)) ^ ((E >>> 25) | (E << 7));
      const ch = (E & F) ^ (~E & G);
      const t1 = (H + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ((A >>> 2) | (A << 30)) ^ ((A >>> 13) | (A << 19)) ^ ((A >>> 22) | (A << 10));
      const maj = (A & B) ^ (A & C) ^ (B & C);
      const t2 = (S0 + maj) >>> 0;
      H = G; G = F; F = E; E = (D + t1) >>> 0; D = C; C = B; B = A; A = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + A) >>> 0; h[1] = (h[1] + B) >>> 0; h[2] = (h[2] + C) >>> 0; h[3] = (h[3] + D) >>> 0;
    h[4] = (h[4] + E) >>> 0; h[5] = (h[5] + F) >>> 0; h[6] = (h[6] + G) >>> 0; h[7] = (h[7] + H) >>> 0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, h[i]);
  return out;
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export const sha256Hex = (s: string) => toHex(sha256Bytes(new TextEncoder().encode(s)));

const ITERATIONS = 2000;
export function hashPassword(password: string, salt: string): string {
  let h = sha256Bytes(new TextEncoder().encode(`${salt}:${password}`));
  const saltBytes = new TextEncoder().encode(salt);
  for (let i = 1; i < ITERATIONS; i++) {
    const m = new Uint8Array(h.length + saltBytes.length);
    m.set(h); m.set(saltBytes, h.length);
    h = sha256Bytes(m);
  }
  return toHex(h);
}

export function newSalt(): string {
  const b = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  return toHex(b);
}

export function withPassword(u: AppUser, password: string): AppUser {
  const salt = newSalt();
  return { ...u, passwordSalt: salt, passwordHash: hashPassword(password, salt) };
}

export function verifyPassword(u: AppUser, password: string): boolean {
  if (!u.passwordHash || !u.passwordSalt) return false;
  const a = hashPassword(password, u.passwordSalt);
  // مقارنة بزمن ثابت
  let diff = a.length ^ u.passwordHash.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (u.passwordHash.charCodeAt(i) || 0);
  return diff === 0;
}

export const hasPassword = (u: AppUser) => !!(u.passwordHash && u.passwordSalt);
export const isActiveAdmin = (u: AppUser) => u.role === 'admin' && u.status === 'active';
