/**
 * رسوم تقديم منتجات التبغ (نسخة Pro).
 * لائحة رسوم تقديم منتجات التبغ (وزارة الشؤون البلدية والقروية والإسكان):
 *   رسم بنسبة 100% من إجمالي مبيعات منتجات التبغ، على ألا يقل عن 25 ريالاً لكل وحدة تبغ.
 * ضريبة القيمة المضافة تُحسب على سعر المنتج مضافاً إليه الرسم (الرسم جزء من المبلغ الخاضع للضريبة).
 * النسبة والحد الأدنى قابلان للتعديل من «إعدادات المنشأة» إن تغيّرت اللائحة.
 */
import { round2 } from './invoiceMath';

export const TOBACCO_FEE_ID = '__tobacco_fee__';
export const TOBACCO_FEE_NAME = 'رسوم تقديم منتجات التبغ';

export interface TobaccoFeeSettings {
  enabled: boolean;
  /** النسبة من سعر المنتج (100 = 100%) */
  ratePercent: number;
  /** الحد الأدنى للرسم لكل وحدة تبغ (ريال، قبل الضريبة) */
  minPerUnit: number;
}

export const DEFAULT_TOBACCO_FEE: TobaccoFeeSettings = { enabled: false, ratePercent: 100, minPerUnit: 25 };

/** الرسم لكل وحدة: النسبة من السعر الصافي (قبل الضريبة) أو الحد الأدنى أيهما أكبر */
export function tobaccoFeePerUnit(netUnitPrice: number, cfg: Partial<TobaccoFeeSettings>): number {
  const rate = Math.max(0, Number(cfg.ratePercent ?? 100)) / 100;
  const min = Math.max(0, Number(cfg.minPerUnit ?? 25));
  return Math.max(Math.max(0, netUnitPrice) * rate, min);
}

/** مجموع الرسوم لأسطر منتجات التبغ في السلة (الكمية = عدد الوحدات المباعة) */
export function tobaccoFeeFor(lines: { price: number; qty: number }[], cfg: Partial<TobaccoFeeSettings>): number {
  let total = 0;
  for (const l of lines) {
    const q = Number(l.qty) || 0;
    if (q <= 0) continue;
    total += tobaccoFeePerUnit(Number(l.price) || 0, cfg) * q;
  }
  return round2(total);
}
