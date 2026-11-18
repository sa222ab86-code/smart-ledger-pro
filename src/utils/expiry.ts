/** تاريخ صلاحية الأصناف: الحالة وعدد الأيام المتبقية */
import type { Product } from '../types';

export type ExpiryState = 'expired' | 'soon' | 'ok';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayYmd = () => ymd(new Date());

/** الأيام المتبقية حتى تاريخ الانتهاء (سالب = منتهي) */
export function daysLeft(expiry: string, today = todayYmd()): number {
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+expiry.slice(0, 4), +expiry.slice(5, 7) - 1, +expiry.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export function expiryState(expiry: string | undefined, warnDays: number, today = todayYmd()): ExpiryState | null {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return null;
  const d = daysLeft(expiry, today);
  if (d < 0) return 'expired';
  if (d <= warnDays) return 'soon';
  return 'ok';
}

/** وصف مختصر: «منتهي منذ 3 أيام» / «باقي 12 يوماً» */
export function expiryLabel(expiry: string, today = todayYmd()): string {
  const d = daysLeft(expiry, today);
  if (d < 0) return `منتهي منذ ${-d} يوم`;
  if (d === 0) return 'ينتهي اليوم';
  return `باقي ${d} يوم`;
}

/**
 * تاريخ الصلاحية بعد استلام دفعة جديدة: يبقى الأقرب انتهاءً ما دام في المخزون كمية صالحة،
 * وإلا (المخزون صفر أو التاريخ القديم منتهٍ) يصبح تاريخ الدفعة الجديدة.
 */
export function mergeExpiry(p: Pick<Product, 'expiryDate' | 'stock'>, incoming: string | undefined, today = todayYmd()): string | undefined {
  if (!incoming) return p.expiryDate;
  const cur = p.expiryDate;
  if (!cur || (p.stock || 0) <= 0 || cur < today) return incoming;
  return incoming < cur ? incoming : cur;
}
