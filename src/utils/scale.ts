/**
 * الميزان الإلكتروني:
 *  1) ملصقات الميزان (EAN-13 تبدأ بـ 2): بادئة + كود الصنف (PLU) + الوزن أو السعر + رقم التحقق
 *  2) ميزان متصل مباشرة (COM/USB) يقرأ الوزن الحي — القراءة تتم في العملية الرئيسية لـ Electron
 */
import type { Product } from '../types';

export interface ScaleSettings {
  /** قراءة ملصقات الميزان */
  barcodeEnabled: boolean;
  /** البادئات المقبولة مفصولة بفواصل، مثل "2" أو "20,21,22" */
  prefixes: string;
  /** عدد أرقام كود الصنف بعد البادئة */
  itemDigits: number;
  /** ما يحمله الملصق: الوزن أو السعر */
  mode: 'weight' | 'price';
  /** عدد الخانات العشرية للقيمة (الوزن عادة 3 = جرام، السعر عادة 2 = هللة) */
  decimals: number;

  /** الميزان المتصل مباشرة */
  serialEnabled: boolean;
  port: string;
  baud: number;
  dataBits: 7 | 8;
  parity: 'None' | 'Even' | 'Odd';
  /** أمر طلب الوزن: بعض الموازين ترسل باستمرار (none) وبعضها ينتظر أمراً */
  command: 'none' | 'W' | 'ENQ' | 'P' | 'S';
  intervalMs: number;
}

export const DEFAULT_SCALE_SETTINGS: ScaleSettings = {
  barcodeEnabled: true,
  prefixes: '2',
  itemDigits: 5,
  mode: 'weight',
  decimals: 3,
  serialEnabled: false,
  port: 'COM3',
  baud: 9600,
  dataBits: 8,
  parity: 'None',
  command: 'none',
  intervalMs: 300,
};

export interface ScaleBarcodeHit {
  product: Product;
  /** الكمية بالكيلو (وضع الوزن) أو المحسوبة من السعر */
  qty: number;
  /** السعر المطبوع على الملصق (وضع السعر) */
  labelPrice?: number;
  itemCode: string;
}

const isEan13Valid = (code: string) => {
  if (!/^\d{13}$/.test(code)) return false;
  const d = code.split('').map(Number);
  const sum = d.slice(0, 12).reduce((s, n, i) => s + n * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === d[12];
};

const stripZeros = (s: string) => s.replace(/^0+(?=\d)/, '');

/** يطابق كود الميزان مع الصنف: حقل «كود الميزان» أولاً ثم الباركود القصير */
export function findScaleProduct(products: Product[], prefix: string, itemCode: string): Product | undefined {
  const key = stripZeros(itemCode);
  return (
    products.find((p) => p.scaleCode && stripZeros(p.scaleCode) === key) ||
    products.find((p) => {
      const b = (p.barcode || '').trim();
      return !!b && b.length <= 7 && (stripZeros(b) === key || b === prefix + itemCode);
    })
  );
}

/**
 * يفك باركود الميزان. unitPriceWithTax: سعر الكيلو كما يدفعه العميل (لوضع السعر).
 * يعيد null إذا لم يكن الباركود من الميزان أو لم يُعرف الصنف.
 */
export function parseScaleBarcode(
  code: string,
  s: ScaleSettings,
  products: Product[],
  unitPriceWithTax: (p: Product) => number
): ScaleBarcodeHit | { error: string } | null {
  if (!s.barcodeEnabled || !/^\d{13}$/.test(code)) return null;
  const prefixes = s.prefixes.split(/[,\s،]+/).map((x) => x.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  const prefix = prefixes.find((p) => code.startsWith(p));
  if (!prefix) return null;
  if (!isEan13Valid(code)) return { error: 'باركود الميزان غير صالح (رقم التحقق خطأ) — أعد المسح' };
  const itemDigits = Math.max(1, Math.min(7, s.itemDigits || 5));
  const valueStart = prefix.length + itemDigits;
  if (valueStart >= 12) return null;
  const itemCode = code.slice(prefix.length, valueStart);
  const raw = Number(code.slice(valueStart, 12));
  const value = raw / Math.pow(10, Math.max(0, Math.min(4, s.decimals)));
  const product = findScaleProduct(products, prefix, itemCode);
  if (!product) return { error: `صنف الميزان رقم ${itemCode} غير معرّف — أدخله في «كود الميزان» بشاشة المنتجات` };
  if (value <= 0) return { error: 'ملصق الميزان بقيمة صفر' };
  if (s.mode === 'price') {
    const unit = unitPriceWithTax(product);
    if (!(unit > 0)) return { error: `حدد سعر الكيلو للصنف «${product.nameAr}» لحساب الوزن من سعر الملصق` };
    return { product, qty: Math.round((value / unit) * 1000) / 1000, labelPrice: value, itemCode };
  }
  return { product, qty: Math.round(value * 1000) / 1000, itemCode };
}

/** يستخرج الوزن بالكيلو من سطر يرسله الميزان، مثل "ST,GS,+  1.250kg" أو "  0750 g" */
export function parseScaleLine(line: string): { kg: number; stable: boolean } | null {
  const m = [...line.matchAll(/([+-]?\s*\d+(?:[.,]\d+)?)\s*(kg|g|lb)?/gi)];
  if (!m.length) return null;
  const last = m[m.length - 1];
  let n = Number(last[1].replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const unit = (last[2] || 'kg').toLowerCase();
  if (unit === 'g') n /= 1000;
  if (unit === 'lb') n *= 0.45359237;
  const stable = !/\bUS\b|unstable|M$/i.test(line);
  return { kg: Math.round(n * 1000) / 1000, stable };
}
