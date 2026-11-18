import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Invoice, Quotation } from '../types';

/**
 * مسح باركود المستندات (رقم الفاتورة / المرتجع / عرض السعر المطبوع على الورقة):
 * مطابقة الرقم بغض النظر عن حالة الأحرف والمسافات.
 */
export const normDocCode = (s: unknown) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '');

/* ---------------- لوحة المفاتيح العربية ----------------
 * قارئ الباركود يعمل كلوحة مفاتيح: إن كانت لغة ويندوز عربية تتحوّل الحروف حسب مواقع الأزرار
 * (INV-00332 → ÷آ{-00332). نعيدها للحروف اللاتينية حسب نفس الأزرار (لوحة Arabic 101). */
const AR_KEYS: [string, string][] = [
  // بدون Shift
  ['`', 'ذ'], ['q', 'ض'], ['w', 'ص'], ['e', 'ث'], ['r', 'ق'], ['t', 'ف'], ['y', 'غ'], ['u', 'ع'], ['i', 'ه'], ['o', 'خ'], ['p', 'ح'], ['[', 'ج'], [']', 'د'],
  ['a', 'ش'], ['s', 'س'], ['d', 'ي'], ['f', 'ب'], ['g', 'ل'], ['h', 'ا'], ['j', 'ت'], ['k', 'ن'], ['l', 'م'], [';', 'ك'], ["'", 'ط'],
  ['z', 'ئ'], ['x', 'ء'], ['c', 'ؤ'], ['v', 'ر'], ['b', 'لا'], ['n', 'ى'], ['m', 'ة'], [',', 'و'], ['.', 'ز'], ['/', 'ظ'],
  // مع Shift (الباركود غالباً بحروف كبيرة)
  ['~', 'ّ'], ['Q', 'َ'], ['W', 'ً'], ['E', 'ُ'], ['R', 'ٌ'], ['T', 'لإ'], ['Y', 'إ'], ['U', '‘'], ['I', '÷'], ['O', '×'], ['P', '؛'], ['{', '<'], ['}', '>'],
  ['A', 'ِ'], ['S', 'ٍ'], ['D', ']'], ['F', '['], ['G', 'لأ'], ['H', 'أ'], ['J', 'ـ'], ['K', '،'], ['L', '/'],
  ['Z', '~'], ['X', 'ْ'], ['C', '}'], ['V', '{'], ['B', 'لآ'], ['N', 'آ'], ['M', '’'], ['<', ','], ['>', '.'], ['?', '؟'],
];
// الأطول أولاً (لإ، لأ، لآ، لا حرفان)
const AR_REV = [...AR_KEYS].sort((a, b) => b[1].length - a[1].length);
const AR_SINGLE = new Map(AR_REV.filter(([, a]) => a.length === 1).map(([l, a]) => [a, l] as [string, string]));
const ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;
const toLatinDigits = (s: string) => s.replace(ARABIC_DIGITS, (d) => String((d.charCodeAt(0) & 0xf) % 10));

/** يعيد النص كما لو كُتب بلوحة إنجليزية (نفس الأزرار) — للباركود فقط */
export function arabicLayoutToLatin(s: string): string {
  let out = '';
  const str = toLatinDigits(String(s ?? ''));
  for (let i = 0; i < str.length; i++) {
    const two = str.slice(i, i + 2);
    const pair = AR_REV.find(([, a]) => a.length === 2 && a === two);
    if (pair) { out += pair[0]; i++; continue; }
    out += AR_SINGLE.get(str[i]) ?? str[i];
  }
  return out;
}

/** القراءة كما هي ثم بعد تصحيح لوحة المفاتيح العربية (إن اختلفت) */
export function scanCandidates(s: string): string[] {
  const raw = String(s ?? '').trim();
  const fixed = arabicLayoutToLatin(raw);
  return fixed !== raw ? [raw, fixed] : [raw];
}

/** الحرف اللاتيني للزر المضغوط فعلياً (مستقل عن لغة لوحة المفاتيح) */
const CODE_CHARS: Record<string, [string, string]> = {
  Minus: ['-', '_'], Equal: ['=', '+'], BracketLeft: ['[', '{'], BracketRight: [']', '}'], Backslash: ['\\', '|'],
  Semicolon: [';', ':'], Quote: ["'", '"'], Comma: [',', '<'], Period: ['.', '>'], Slash: ['/', '?'], Backquote: ['`', '~'], Space: [' ', ' '],
  NumpadSubtract: ['-', '-'], NumpadAdd: ['+', '+'], NumpadMultiply: ['*', '*'], NumpadDivide: ['/', '/'], NumpadDecimal: ['.', '.'],
};
const SHIFT_DIGITS = ')!@#$%^&*(';
type KeyLike = Pick<KeyboardEvent, 'code' | 'key' | 'shiftKey' | 'getModifierState'>;
export function keyCodeToLatin(e: KeyLike): string | null {
  const code = e.code || '';
  let m = /^Key([A-Z])$/.exec(code);
  if (m) {
    const caps = typeof e.getModifierState === 'function' && e.getModifierState('CapsLock');
    return e.shiftKey !== caps ? m[1] : m[1].toLowerCase();
  }
  m = /^Digit(\d)$/.exec(code);
  if (m) return e.shiftKey ? SHIFT_DIGITS[Number(m[1])] : m[1];
  m = /^Numpad(\d)$/.exec(code);
  if (m) return m[1];
  const c = CODE_CHARS[code];
  return c ? (e.shiftKey ? c[1] : c[0]) : null;
}
// رموز لاتينية تُخرجها اللوحة العربية مكان حروف (Shift+V = { ...)
const LAYOUT_ASCII = new Set(['{', '}', '[', ']', '<', '>', '/', ',', '.', '~']);

/**
 * لحقول الباركود فقط: يكتب الحرف اللاتيني للزر المضغوط حتى لو كانت لغة ويندوز عربية.
 * (لا يُستخدم في حقول البحث بالاسم لأنها تحتاج الكتابة بالعربية)
 */
export function latinBarcodeKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const k = e.key;
  if (!k || k.length > 2 || k === 'Enter') return;
  const lat = keyCodeToLatin(e.nativeEvent);
  if (!lat || lat === k) return;
  if (!(/[^\x20-\x7E]/.test(k) || LAYOUT_ASCII.has(k))) return;
  e.preventDefault();
  const el = e.currentTarget;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const next = el.value.slice(0, start) + lat + el.value.slice(end);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(el, next); else el.value = next;
  try { el.setSelectionRange(start + lat.length, start + lat.length); } catch { /* */ }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function findInvoiceByCode(invoices: Invoice[], code: string): Invoice | undefined {
  for (const cand of scanCandidates(code)) {
    const c = normDocCode(cand);
    if (c.length < 3) continue;
    const hit = invoices.find((i) => normDocCode(i.invoiceNumber) === c || normDocCode(i.number) === c);
    if (hit) return hit;
  }
  return findInvoiceBySerial(invoices, code);
}

/** الرقم التسلسلي (S/N): مقارنة بلا مسافات ولا حالة أحرف */
export const normSerial = (s?: string) => String(s || '').replace(/\s+/g, '').toLowerCase();
/** صنف في الفاتورة يحمل هذا الرقم التسلسلي (أو جزءاً منه عند partial) */
export const serialHit = (inv: Invoice, q: string, partial = false): string | undefined => {
  const k = normSerial(q);
  if (k.length < 3) return undefined;
  for (const it of inv.items || []) {
    const s = normSerial(it.serial);
    if (s && (partial ? s.includes(k) : s === k)) return it.serial;
  }
  return undefined;
};
/** فاتورة بيع (الأحدث) فيها صنف بهذا الرقم التسلسلي بالضبط */
export function findInvoiceBySerial(invoices: Invoice[], code: string): Invoice | undefined {
  let found: Invoice | undefined;
  for (const inv of invoices) {
    if (!serialHit(inv, code)) continue;
    if (!found || (inv.docType !== 'return' && (found.docType === 'return' || String(inv.date) > String(found.date)))) found = inv;
  }
  return found;
}

export function findQuotationByCode(quotations: Quotation[], code: string): Quotation | undefined {
  for (const cand of scanCandidates(code)) {
    const c = normDocCode(cand);
    if (c.length < 3) continue;
    const hit = quotations.find((q) => normDocCode(q.number) === c);
    if (hit) return hit;
  }
  return undefined;
}

/** طلب مسح مُمرَّر بين الشاشات (ts يجعل نفس الرقم يُعاد فتحه عند مسحه مرة أخرى) */
export interface ScanRequest { code: string; ts: number }

/**
 * يلتقط قراءة قارئ الباركود في أي مكان من الشاشة (حتى بدون مؤشر في خانة البحث):
 * القارئ يكتب الحروف بسرعة كبيرة ثم Enter — الكتابة اليدوية أبطأ فلا تُلتقط.
 * لا يعمل أثناء الكتابة داخل حقل إدخال (للحقل معالجه الخاص).
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const cb = useRef(onScan);
  cb.current = onScan;
  useEffect(() => {
    if (!enabled) return;
    let buf = '';
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) { buf = ''; return; }
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const now = performance.now();
      if (now - last > 80) buf = ''; // فاصل طويل = كتابة يدوية → نبدأ من جديد
      last = now;
      if (e.key === 'Enter') {
        if (buf.length >= 4) { e.preventDefault(); cb.current(buf); }
        buf = '';
        return;
      }
      // الحرف حسب الزر الفعلي (لا يتأثر بلغة لوحة المفاتيح العربية)
      const ch = keyCodeToLatin(e) ?? (e.key.length === 1 ? e.key : '');
      if (ch) buf += ch;
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}
