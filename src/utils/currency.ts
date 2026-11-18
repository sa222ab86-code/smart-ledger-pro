import type { CompanySettings, CurrencyConfig } from '../types';

/**
 * حالة العملات الفعلية:
 * - العملة الأساسية تُختار دائماً (حتى مع إيقاف تعدد العملات) — منشأة خارج السعودية تختار عملتها.
 * - تعدد العملات مغلق افتراضياً؛ لا يُعدّ مفعلاً إلا إذا فعّله المستخدم بنفسه (configured)،
 *   فالتثبيتات القديمة التي حُفظ فيها enabled=true افتراضياً تُعامل كمغلقة.
 */
export const isRiyalSymbol = (c?: { code?: string; symbol?: string }) =>
  !!c && (c.code === 'SAR' || c.symbol === 'ر.س' || c.symbol === '⃁' || c.symbol === '﷼');

export function currencyState(s?: CompanySettings | null) {
  const mc = s?.multiCurrency;
  const list: CurrencyConfig[] = Array.isArray(mc?.currencies) ? mc!.currencies : [];
  const baseCode = mc?.baseCurrency || 'SAR';
  const base: CurrencyConfig = list.find((c) => c.code === baseCode)
    || { code: baseCode, nameAr: baseCode === 'SAR' ? 'ريال سعودي' : baseCode, symbol: baseCode === 'SAR' ? '﷼' : baseCode, exchangeRate: 1, isBase: true, isEnabled: true };
  const enabled = !!(mc?.enabled && mc?.configured);
  const extras = enabled ? list.filter((c) => c.isEnabled && c.code !== baseCode && (c.exchangeRate || 0) > 0) : [];
  return { enabled, base, baseCode, extras, baseIsRiyal: isRiyalSymbol(base) };
}

/** المبلغ بالعملة الأساسية ← العملة الأخرى (سعر الصرف: 1 وحدة = rate من الأساسية) */
export const toCurrency = (amount: number, c: CurrencyConfig) => (c.exchangeRate > 0 ? amount / c.exchangeRate : amount);
