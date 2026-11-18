import { printStampCss } from './printStamp';
import type { Product, ProductGroup } from '../types';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** قائمة المنتجات كمستند A4 مقسّم صفحات (رأس الجدول يتكرر، ترقيم الصفحات) — للتصدير PDF */
export function productsSheetHtml(products: Product[], groups: ProductGroup[], companyName: string, filterLabel: string): string {
  const groupName = new Map(groups.map((g) => [g.id, g.nameAr]));
  const now = new Date().toLocaleString('ar-SA-u-ca-gregory-nu-latn');
  const rows = products.map((p, i) => {
    const units = (p.units || []).map((u) => `${esc(u.name)} (${u.factor}) ${Number(u.price || 0).toFixed(2)}${u.barcode ? ` — ${esc(u.barcode)}` : ''}`).join('<br>');
    return `<tr><td>${i + 1}</td><td class="name">${esc(p.nameAr)}${p.nameEn ? `<div class="en">${esc(p.nameEn)}</div>` : ''}</td><td class="mono">${esc(p.barcode)}</td><td>${esc((p.groupId && groupName.get(p.groupId)) || p.categoryAr || '')}</td><td class="mono b">${Number(p.price || 0).toFixed(2)}</td><td class="mono">${Number(p.cost || 0).toFixed(2)}</td><td class="mono">${p.stock ?? 0}</td><td class="units">${units || '—'}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>قائمة المنتجات</title>
<style>
  @page {
    size: A4; margin: 12mm 9mm 15mm;
    @bottom-center { content: "صفحة " counter(page) " من " counter(pages); font: 10px Tahoma, Arial, sans-serif; color: #000; } ${printStampCss()}
    @bottom-left { content: "${esc(companyName)} — قائمة المنتجات"; font: 9px Tahoma, Arial, sans-serif; color: #000; }
  }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Tajawal, Tahoma, Arial, sans-serif; color: #000; margin: 0; font-size: 11px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #134e4a; padding-bottom: 6px; margin-bottom: 8px; }
  header h1 { margin: 0; font-size: 18px; }
  header small { display: block; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { background: #134e4a; color: #fff; padding: 5px 4px; font-size: 10.5px; border: 1px solid #134e4a; }
  td { border: 1px solid #94a3b8; padding: 4px; text-align: center; vertical-align: middle; }
  td.name { text-align: right; font-weight: 700; }
  td.name .en { font-weight: 400; font-size: 9.5px; }
  td.mono { font-family: Consolas, monospace; }
  td.b { font-weight: 800; }
  td.units { font-size: 9.5px; text-align: right; }
  tr:nth-child(even) td { background: #f8fafc; }
</style></head><body>
<header>
  <div><h1>قائمة المنتجات</h1><small>${esc(filterLabel)} — ${products.length} صنف</small></div>
  <div style="text-align:left"><b>${esc(companyName)}</b><small>${esc(now)}</small></div>
</header>
<table>
  <thead><tr><th style="width:34px">م</th><th>الصنف</th><th>الباركود</th><th>المجموعة</th><th>سعر البيع</th><th>التكلفة</th><th>المخزون</th><th>التعبئات</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;
}
