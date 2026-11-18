import type { Product } from '../types';

export interface BelowCostHit {
  product: Product;
  /** اسم الصنف (ومعه اسم العبوة إن كانت هي المشكلة) */
  label: string;
  /** سعر البيع كما في البطاقة */
  price: number;
  /** أقل سعر مسموح بنفس طريقة عرض الأسعار (شامل/قبل الضريبة) */
  minPrice: number;
}

/**
 * أصناف سعرها في البطاقة أقل من تكلفتها (+ هامش الربح الأدنى).
 * k = 1 + نسبة الضريبة إن كانت الأسعار شاملة الضريبة، وإلا 1 — التكلفة مخزّنة صافية دائماً.
 * نفس قاعدة البيع: تكلفة العبوة = تكلفة الحبة × عدد حباتها.
 */
export function belowCostProducts(products: Product[], k: number, minMarginPct = 0): BelowCostHit[] {
  const m = 1 + Math.max(0, Number(minMarginPct) || 0) / 100;
  const out: BelowCostHit[] = [];
  for (const p of products) {
    if (p.disabled) continue;
    const c = Number(p.cost) || 0;
    if (!(c > 0)) continue;
    const check = (label: string, shown: number, cost: number) => {
      if (!(shown > 0)) return; // بلا سعر: يُحدَّد عند البيع
      const min = cost * m;
      if (shown / k < min - 0.005) out.push({ product: p, label, price: shown, minPrice: Math.ceil(min * k * 100 - 1e-6) / 100 });
    };
    if (p.sellBaseUnit !== false || !(p.units && p.units.length)) check(p.nameAr, Number(p.price) || 0, c);
    for (const u of p.units || []) {
      if (!u.name || !u.name.trim()) continue;
      const f = (u.factor || 0) > 0 ? u.factor : 1;
      check(`${p.nameAr} — ${u.name}`, Number(u.price) || 0, c * f);
    }
  }
  return out;
}
