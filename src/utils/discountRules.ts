/** قواعد الخصم من إعدادات التطبيق */
export interface DiscountRules {
  /** السماح بالخصم في البيع وعروض الأسعار */
  enabled: boolean;
  /** أعلى نسبة خصم مسموحة من قيمة الفاتورة (1–99). 100 = بلا حد إضافي */
  maxPercent: number;
}
export const DEFAULT_DISCOUNT_RULES: DiscountRules = { enabled: true, maxPercent: 100 };

/**
 * يتحقق من الخصم: يعيد رسالة الخطأ أو null.
 * لا يُقبل أبداً خصم يساوي قيمة الفاتورة أو يتجاوزها (فاتورة بصفر أو بالسالب).
 */
export function checkDiscount(
  rules: DiscountRules | undefined,
  d: { type: 'fixed' | 'percent'; value: number; scope?: 'total' | 'subtotal'; rawSubtotal: number; rawTotalWithTax: number }
): string | null {
  const r = rules || DEFAULT_DISCOUNT_RULES;
  const v = Number(d.value) || 0;
  if (v <= 0) return null;
  if (!r.enabled) return 'الخصم مغلق من إعدادات التطبيق';
  const base = d.type === 'percent' ? 100 : d.scope === 'subtotal' ? d.rawSubtotal : d.rawTotalWithTax;
  if (!(base > 0)) return 'لا يمكن الخصم على فاتورة فارغة';
  const pct = d.type === 'percent' ? v : (v / base) * 100;
  if (pct >= 100 - 1e-9) return `الخصم (${v.toFixed(2)}${d.type === 'percent' ? '%' : ''}) يساوي قيمة الفاتورة أو يتجاوزها — غير مسموح`;
  const max = Math.min(100, Math.max(0, Number(r.maxPercent) || 0));
  if (max < 100 && pct > max + 1e-9) return `الخصم ${pct.toFixed(1)}% يتجاوز الحد المسموح (${max}%) في إعدادات التطبيق`;
  return null;
}
