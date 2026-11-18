/**
 * العروض والتخفيضات — تُطبَّق تلقائياً على أسطر السلة:
 *  - percent:  تخفيض بنسبة % من سعر الصنف
 *  - fixed:    تخفيض مبلغ ثابت من سعر الحبة
 *  - buyXgetY: اشترِ X واحصل على Y مجاناً (من نفس الصنف)
 *  - multiBuy: كمية بسعر (مثل 3 حبات بـ 10)
 * المبالغ تُدخل بنفس طريقة أسعار الأصناف (شاملة/غير شاملة الضريبة حسب إعداد المنشأة).
 */
export type PromoType = 'percent' | 'fixed' | 'buyXgetY' | 'multiBuy';

export interface Promotion {
  id: string;
  name: string;
  type: PromoType;
  /** النسبة % أو المبلغ المخصوم من الحبة */
  value?: number;
  buyQty?: number;
  freeQty?: number;
  multiQty?: number;
  /** سعر الكمية كاملة في «كمية بسعر» */
  multiPrice?: number;
  scope: 'products' | 'group' | 'all';
  productIds?: string[];
  groupId?: string;
  /** YYYY-MM-DD */
  from?: string;
  to?: string;
  active: boolean;
  createdAt?: string;
}

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export type PromoStatus = 'active' | 'scheduled' | 'expired' | 'stopped';
export function promoStatus(p: Promotion, today = todayStr()): PromoStatus {
  if (!p.active) return 'stopped';
  if (p.from && today < p.from) return 'scheduled';
  if (p.to && today > p.to) return 'expired';
  return 'active';
}

export function promoApplies(p: Promotion, productId: string, groupId?: string): boolean {
  if (p.scope === 'all') return true;
  if (p.scope === 'group') return !!p.groupId && p.groupId === groupId;
  return (p.productIds || []).includes(productId);
}

/** وصف مختصر للعرض (يظهر في السلة والفاتورة) */
export function promoLabel(p: Promotion): string {
  const n = (v?: number) => String(Number(v || 0)).replace(/\.0+$/, '');
  switch (p.type) {
    case 'percent': return `خصم ${n(p.value)}%`;
    case 'fixed': return `خصم ${n(p.value)} على الحبة`;
    case 'buyXgetY': return `اشترِ ${n(p.buyQty)} واحصل على ${n(p.freeQty)} مجاناً`;
    case 'multiBuy': return `${n(p.multiQty)} بـ ${n(p.multiPrice)}`;
  }
}

/**
 * إجمالي السطر (صافي قبل الضريبة) بعد العرض.
 * base: سعر الحبة الصافي قبل العرض، toNet: يحوّل مبلغاً مُدخلاً (كسعر الصنف) إلى صافٍ.
 * wholeUnits: false لأسطر الوزن/العبوات (لا تنطبق عليها عروض الكميات).
 */
export function promoLineTotal(p: Promotion, base: number, qty: number, toNet: (v: number) => number, wholeUnits: boolean): number | null {
  if (!(qty > 0) || !(base > 0)) return null;
  switch (p.type) {
    case 'percent': {
      const v = Math.min(100, Math.max(0, Number(p.value) || 0));
      return v > 0 ? base * (1 - v / 100) * qty : null;
    }
    case 'fixed': {
      const off = toNet(Math.max(0, Number(p.value) || 0));
      return off > 0 ? Math.max(0, base - off) * qty : null;
    }
    case 'buyXgetY': {
      if (!wholeUnits) return null;
      const x = Math.floor(Number(p.buyQty) || 0), y = Math.floor(Number(p.freeQty) || 0);
      if (x < 1 || y < 1) return null;
      const free = Math.floor(qty / (x + y)) * y;
      return free > 0 ? base * (qty - free) : null;
    }
    case 'multiBuy': {
      if (!wholeUnits) return null;
      const n = Math.floor(Number(p.multiQty) || 0);
      const price = toNet(Math.max(0, Number(p.multiPrice) || 0));
      if (n < 2 || !(price > 0)) return null;
      const groups = Math.floor(qty / n);
      return groups > 0 ? groups * price + (qty - groups * n) * base : null;
    }
  }
}

/** أفضل عرض فعّال للسطر (الأقل إجمالياً للعميل) */
export function bestPromo(promos: Promotion[], productId: string, groupId: string | undefined, base: number, qty: number, toNet: (v: number) => number, wholeUnits: boolean, today = todayStr()): { promo: Promotion; total: number } | null {
  let best: { promo: Promotion; total: number } | null = null;
  for (const p of promos) {
    if (promoStatus(p, today) !== 'active' || !promoApplies(p, productId, groupId)) continue;
    const t = promoLineTotal(p, base, qty, toNet, wholeUnits);
    if (t === null || t >= base * qty - 0.00001) continue;
    if (!best || t < best.total) best = { promo: p, total: t };
  }
  return best;
}
