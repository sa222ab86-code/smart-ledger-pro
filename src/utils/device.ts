import type { Invoice } from '../types';

/**
 * الجهاز الذي أصدر الفاتورة (ربط الأجهزة): يُحفظ رمزه واسمه في الفاتورة وقت إصدارها.
 * الفواتير الأقدم تُعرف من رقمها (INV-B-27-00001 ← B)، وما قبل الربط بلا رمز.
 */
export const NO_DEVICE = 'بدون ربط';

export function deviceTagOf(inv: Pick<Invoice, 'deviceTag' | 'invoiceNumber' | 'number'>): string {
  if (inv.deviceTag) return inv.deviceTag;
  const m = String(inv.invoiceNumber || inv.number || '').match(/^[A-Z]{2,4}-([A-Z0-9]{1,2})-/);
  return m && !/^\d{2}$/.test(m[1]) ? m[1] : '';
}

/** اسم العرض لرمز جهاز: «جهاز B — كاشير 2» أو «جهاز B» (الاسم اختياري يكتبه المستخدم في «ربط الأجهزة») */
export function deviceTitle(tag: string, name?: string): string {
  if (!tag || tag === NO_DEVICE) return NO_DEVICE;
  return name ? `جهاز ${tag} — ${name}` : `جهاز ${tag}`;
}

export function deviceLabelOf(inv: Pick<Invoice, 'deviceTag' | 'deviceName' | 'invoiceNumber' | 'number'>, names?: Map<string, string>): string {
  const tag = deviceTagOf(inv);
  return deviceTitle(tag, names?.get(tag) || inv.deviceName || '');
}

/** آخر اسم لكل رمز جهاز (من الفواتير المحفوظة) */
export function deviceNames(invoices: Invoice[]): Map<string, string> {
  // الاسم من أحدث فاتورة لكل جهاز (تغيير الاسم أو مسحه يسري على كل فواتيره)
  const m = new Map<string, string>(); const at = new Map<string, string>();
  for (const i of invoices) {
    if (!i.deviceTag) continue;
    const d = String(i.date || '');
    if (!at.has(i.deviceTag) || d >= at.get(i.deviceTag)!) { at.set(i.deviceTag, d); m.set(i.deviceTag, i.deviceName || ''); }
  }
  return m;
}
