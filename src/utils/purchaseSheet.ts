import { contactLine } from './contact';
import { printStampCss } from './printStamp';
import type { PurchaseInvoice } from '../types';
import { tafqeet } from './tafqeet';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (n?: number) => (Number.isFinite(n) ? (n as number).toFixed(2) : '0.00');

/** فاتورة شراء A4 للطباعة أو الحفظ PDF (بنفس هوية عرض السعر) */
export function purchaseHtml(
  p: PurchaseInvoice,
  company: { name: string; nameEn?: string; vat: string; address?: string; shortAddress?: string; phone?: string; mobile?: string; email?: string; logoUrl?: string; footerInfo?: boolean },
  supplier?: { phone?: string; vatNumber?: string; address?: string },
  /** مستند آخر بنفس التصميم (مرتجع المشتريات) */
  doc?: { title: string; number?: string; refLine?: string; reason?: string; foot?: string; accent?: string }
): string {
  const accent = doc?.accent || '#134e4a';
  const inc = !!p.pricesInclusive;
  const rows = p.items
    .map((it, i) => `<tr>
      <td>${i + 1}</td>
      <td class="name">${esc(it.productName)}</td>
      <td>${esc(it.unitName || 'حبة')}${(it.factor || 1) > 1 ? ` <small>(${esc(it.factor)} حبة)</small>` : ''}</td>
      <td>${esc(it.qty)}</td>
      <td>${money(it.price)}</td>
      <td>${money(it.total)}</td>
    </tr>`)
    .join('');
  const contact = contactLine(company);
  const linesSum = p.items.reduce((s, i) => s + (i.total || 0), 0);
  const subtotal = p.subtotal ?? linesSum;
  const vat = p.vat ?? 0;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(doc?.title || 'فاتورة شراء')} ${esc(doc?.number || p.supplierInvoiceNo || p.date)}</title>
<style>
  @page { size: A4; margin: 12mm 12mm 16mm; @bottom-center { content: "صفحة " counter(page) " من " counter(pages); font: 10px Tahoma, Arial, sans-serif; color: #000; } ${printStampCss()} }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Tajawal, Tahoma, Arial, sans-serif; color: #000; margin: 0; font-size: 13px; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${accent}; padding-bottom: 10px; }
  .co { display: flex; gap: 12px; align-items: center; }
  .co img { max-height: 70px; max-width: 120px; object-fit: contain; }
  .co h2 { margin: 0; font-size: 20px; }
  .co .en { display: block; font-size: 14px; font-weight: 700; margin-top: 1px; direction: ltr; text-align: right; }
  .co small { display: block; margin-top: 2px; }
  .title { text-align: left; }
  .title h1 { margin: 0; font-size: 26px; }
  .title div { margin-top: 3px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 14px 0; }
  .box { border-top: 3px solid ${accent}; background: #f0fdfa; border-radius: 6px; padding: 9px 12px; }
  .box b { display: block; color: ${accent}; font-size: 11px; margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: ${accent}; color: #fff; padding: 8px 6px; font-size: 12px; }
  th small, td small { font-weight: normal; font-size: 10px; }
  td { padding: 7px 6px; border-bottom: 1px solid #e2e8f0; text-align: center; }
  td.name { text-align: right; }
  tr:nth-child(even) td { background: #f8fafc; }
  .totals { width: 46%; margin: 14px 0 0 auto; border-top: 3px solid ${accent}; background: #f0fdfa; border-radius: 6px; overflow: hidden; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #e2e8f0; }
  .totals .grand { background: ${accent}; color: #fff; font-weight: 800; font-size: 15px; border-bottom: 0; }
  .words { margin-top: 8px; padding: 8px 12px; border-radius: 6px; background: #f0fdfa; border-right: 4px solid ${accent}; color: ${accent}; font-weight: 800; }
  .sign { display: flex; justify-content: space-between; margin-top: 46px; font-size: 12px; }
  .sign div { width: 40%; border-top: 1.5px solid ${accent}; padding-top: 5px; text-align: center; }
.footbar { margin-top: 26px; border-radius: 10px; background: ${accent}; color: #fff; padding: 7px 14px; display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; font-weight: 700; break-inside: avoid; }
</style></head><body>
<div class="top">
  <div class="co">
    ${company.logoUrl ? `<img src="${esc(company.logoUrl)}" alt="">` : ''}
    <div>
      <h2>${esc(company.name || '')}</h2>
      ${company.nameEn?.trim() ? `<span class="en">${esc(company.nameEn.trim())}</span>` : ''}
      ${company.vat ? `<small>الرقم الضريبي: ${esc(company.vat)}</small>` : ''}
      ${company.address ? `<small>${esc(company.address)}</small>` : ''}
      ${company.shortAddress?.trim() ? `<small>العنوان المختصر: <bdi dir="ltr">${esc(company.shortAddress.trim())}</bdi></small>` : ''}
      ${contact ? `<small>${esc(contact)}</small>` : ''}
    </div>
  </div>
  <div class="title">
    <h1>${esc(doc?.title || 'فاتورة شراء')}</h1>
    ${doc?.number ? `<div>رقم المستند: <b>${esc(doc.number)}</b></div>` : ''}
    <div>${doc ? 'التاريخ' : 'تاريخ الشراء'}: <b>${esc(p.date)}</b></div>
    ${p.supplierInvoiceNo ? `<div>${doc ? 'عن فاتورة المورد' : 'رقم فاتورة المورد'}: <b>${esc(p.supplierInvoiceNo)}</b></div>` : ''}
    ${doc?.refLine ? `<div>${esc(doc.refLine)}</div>` : ''}
    <div>عدد الأصناف: ${p.items.length}</div>
  </div>
</div>
<div class="meta">
  <div class="box"><b>المورد</b>${esc(p.supplierName)}${supplier?.phone ? ` — ${esc(supplier.phone)}` : ''}</div>
  <div class="box"><b>الرقم الضريبي للمورد</b>${esc(supplier?.vatNumber || '—')}</div>
</div>
<table>
  <thead><tr><th style="width:36px">#</th><th>الصنف</th><th style="width:110px">الوحدة</th><th style="width:70px">الكمية</th><th style="width:100px">سعر الوحدة<br><small>${inc ? 'شامل الضريبة' : 'غير شامل الضريبة'}</small></th><th style="width:110px">المجموع</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="totals">
  ${p.discount ? `<div><span>المجموع${inc ? ' (شامل الضريبة)' : ''}</span><span>${money(p.items.reduce((s, it) => s + (it.total || 0), 0))}</span></div>
  <div><span>الخصم${p.discountType === 'percent' ? ` (${esc(p.discountValue)}%)` : ''}</span><span>- ${money(p.discount)}</span></div>` : ''}
  <div><span>الإجمالي غير شامل الضريبة</span><span>${money(subtotal)}</span></div>
  <div><span>ضريبة المدخلات${p.vatRate ? ` (${esc(p.vatRate)}%)` : ''}</span><span>${money(vat)}</span></div>
  <div class="grand"><span>الإجمالي شامل الضريبة</span><span>${money(p.total)}</span></div>
</div>
${doc?.reason ? `<div class="words" style="margin-top:12px">سبب الإرجاع: ${esc(doc.reason)}</div>` : ''}
<div class="words">${esc(tafqeet(p.total))}</div>
<div class="sign"><div>${doc ? 'المورد (المستلم)' : 'المستلم'}</div><div>المعتمد</div></div>
<div class="footbar"><span>${esc(doc?.foot || 'فاتورة شراء — مستند داخلي')}</span>${company.footerInfo ? `<span>${esc(company.name || '')}${contact ? ' — ' + esc(contact) : ''}</span>` : ''}</div>
</body></html>`;
}
