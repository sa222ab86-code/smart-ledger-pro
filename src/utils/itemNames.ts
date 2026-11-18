import type { Product } from '../types';

/** أسماء الأصناف بالإنجليزي في الفواتير: عربي فقط / إنجليزي فقط / الاثنان (الإنجليزي تحت العربي) */
export type ItemNameMode = 'ar' | 'en' | 'both';

let byId = new Map<string, Product>();
/** يُستدعى من App عند تغيّر الأصناف — للفواتير القديمة التي لم يُحفظ فيها الاسم الإنجليزي */
export function setProductsForNames(list: Product[]) { byId = new Map(list.map((p) => [p.id, p])); }

/** الاسم الإنجليزي لسطر فاتورة: المحفوظ فيه، أو من بطاقة الصنف مع لاحقة المقاس/التعبئة كما هي */
export function englishNameOf(item: { productId?: string; name: string; nameEn?: string }, products?: Map<string, Product>): string {
  if (item.nameEn) return item.nameEn;
  const p = item.productId ? (products || byId).get(item.productId) : undefined;
  const en = p?.nameEn?.trim();
  if (!en) return '';
  const ar = (p!.nameAr || '').trim();
  const suffix = ar && item.name.startsWith(ar) ? item.name.slice(ar.length) : '';
  return en + suffix;
}
