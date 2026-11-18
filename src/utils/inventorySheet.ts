import { printStampCss } from './printStamp';
import type { CompanySettings, Product } from '../types';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * كشف الجرد للطباعة/PDF كمستند HTML مستقل:
 *  - مقسّم صفحات A4 تلقائياً، رأس الجدول يتكرر في كل صفحة، والصفوف لا تنقسم بين صفحتين
 *  - ترقيم «صفحة X من Y» أسفل كل صفحة
 *  - لا يمر عبر React → سريع حتى مع آلاف الأصناف
 */
export function inventorySheetHtml(products: Product[], company: CompanySettings, defaultThreshold: number, filterLabel: string): string {
  const now = new Date().toLocaleString('ar-SA-u-ca-gregory-nu-latn');
  let totalStock = 0, totalValue = 0, reorder = 0;
  const rows = products.map((p, i) => {
    const stock = p.stock || 0;
    const min = p.minStock ?? defaultThreshold;
    const cost = p.cost || 0;
    totalStock += stock; totalValue += stock * cost;
    if (stock <= min) reorder++;
    const status = stock <= 0 ? '<span class="out">نافد</span>' : stock <= min ? '<span class="low">منخفض</span>' : 'متوفر';
    return `<tr><td>${i + 1}</td><td class="name">${esc(p.nameAr)}</td><td class="mono">${esc(p.barcode)}</td><td>${esc(p.categoryAr)}</td><td class="mono">${cost.toFixed(2)}</td><td class="mono sys">${stock}</td><td class="box"></td><td class="box"></td><td>${status}</td><td class="note"></td></tr>`;
  }).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف جرد المخزون</title>
<style>
  @page {
    size: A4; margin: 12mm 9mm 15mm;
    @bottom-center { content: "صفحة " counter(page) " من " counter(pages); font: 10px Tahoma, Arial, sans-serif; color: #000; } ${printStampCss()}
    @bottom-left { content: "${esc(company.companyName || '')} — كشف الجرد"; font: 9px Tahoma, Arial, sans-serif; color: #000; }
  }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Tajawal, Tahoma, Arial, sans-serif; color: #000; margin: 0; font-size: 11px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #134e4a; padding-bottom: 6px; margin-bottom: 8px; }
  header h1 { margin: 0; font-size: 18px; }
  header small { display: block; margin-top: 2px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px; }
  .kpi { border: 1px solid #94a3b8; border-radius: 6px; padding: 5px 8px; }
  .kpi b { display: block; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { background: #134e4a; color: #fff; padding: 5px 4px; font-size: 10.5px; border: 1px solid #134e4a; }
  td { border: 1px solid #94a3b8; padding: 4px; text-align: center; height: 24px; }
  td.name { text-align: right; font-weight: 700; }
  td.mono { font-family: Consolas, monospace; }
  td.sys { font-weight: 800; background: #fefce8; }
  td.box { width: 62px; }
  td.note { width: 90px; }
  tr:nth-child(even) td:not(.sys) { background: #f8fafc; }
  .out { color: #b91c1c; font-weight: 800; } .low { color: #b45309; font-weight: 800; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 18px; font-size: 11px; text-align: center; break-inside: avoid; }
  .sign div { border-top: 1px solid #000; padding-top: 4px; margin-top: 30px; }
</style></head><body>
<header>
  <div><h1>كشف جرد ومطابقة أرصدة المخزون</h1><small>${esc(filterLabel)}</small><small>تاريخ الطباعة: ${esc(now)}</small></div>
  <div style="text-align:left"><b>${esc(company.companyName || '')}</b>${company.vatNumber ? `<small>الرقم الضريبي: ${esc(company.vatNumber)}</small>` : ''}${company.address ? `<small>${esc(company.address)}</small>` : ''}${company.shortAddress?.trim() ? `<small>العنوان المختصر: <bdi dir="ltr">${esc(company.shortAddress.trim())}</bdi></small>` : ''}</div>
</header>
<div class="kpis">
  <div class="kpi">عدد الأصناف<b>${products.length}</b></div>
  <div class="kpi">إجمالي الرصيد بالنظام<b>${totalStock}</b></div>
  <div class="kpi">القيمة التقديرية (تكلفة)<b>${totalValue.toFixed(2)}</b></div>
  <div class="kpi">بحاجة لإعادة طلب<b>${reorder}</b></div>
</div>
<table>
  <thead><tr><th style="width:34px">م</th><th>اسم الصنف</th><th>الباركود</th><th>التصنيف</th><th>التكلفة</th><th>رصيد النظام</th><th>العد الفعلي</th><th>الفرق</th><th>الحالة</th><th>ملاحظات</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="sign"><div>أمين المستودع (القائم بالجرد)</div><div>المحاسب / المدقق</div><div>اعتماد الإدارة</div></div>
</body></html>`;
}
