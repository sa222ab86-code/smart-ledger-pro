import { contactLine, contactParts } from './contact';
import { printStampCss } from './printStamp';
import type { Quotation, QuotationItem, QuotationStatus } from '../types';
import { round2, customerLabel } from './invoiceMath';
import { tafqeet, amountInWordsEn } from './tafqeet';
import { docBarcodeHtml } from './barcode';
import { docBarcodeOn, letterhead, letterheadSettings, dotMatrix, dotMatrixCss, plainTheme, continuousPaper, CONTINUOUS_SIDE_MM, thermalLayout, receiptLogoMm, printBilingual, PAGE_NO_BI } from './printing';

export const STATUS_LABEL: Record<QuotationStatus, string> = {
  draft: 'مسودة',
  sent: 'مُرسل للعميل',
  accepted: 'مقبول',
  rejected: 'مرفوض',
  invoiced: 'حُوِّل إلى فاتورة',
};

export const DEFAULT_TERMS =
  'الأسعار المذكورة لا تشمل أي رسوم إضافية غير مذكورة. العرض صالح حتى التاريخ المحدد أعلاه، وقابل للتعديل بعد انتهائه.';

export interface QuotationTotals {
  rawSubtotal: number;
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  grossRaw?: number;       // الأسعار الشاملة: الإجمالي قبل الخصم شامل الضريبة
  grossDiscount?: number;  // الأسعار الشاملة: الخصم شامل الضريبة
}

/** سعر الوحدة المعروض: شامل الضريبة عند تفعيلها (البند يُخزَّن صافياً دائماً) */
export const shownUnitPrice = (net: number, taxRatePercent: number, inclusive?: boolean) =>
  inclusive ? round2((Number(net) || 0) * (1 + (Number(taxRatePercent) || 0) / 100)) : Number(net) || 0;

/** تحويل السعر المُدخل إلى صافي قبل الضريبة */
export const netFromShown = (shown: number, taxRatePercent: number, inclusive?: boolean) =>
  inclusive ? Math.round(((Number(shown) || 0) / (1 + (Number(taxRatePercent) || 0) / 100)) * 1e6) / 1e6 : Number(shown) || 0;

/**
 * الأسعار قبل الضريبة؛ الخصم يُطبَّق قبل الضريبة (مثل منطق الكاشير).
 * عند الأسعار الشاملة: الإجمالي = مجموع الأسعار الشاملة − الخصم (شامل)، ثم تُستخرج الضريبة منه
 * فيطابق الإجمالي ما يراه العميل تماماً. rawSubtotal يبقى صافياً قبل الخصم.
 */
export function calcQuotation(
  items: QuotationItem[],
  discountType: 'fixed' | 'percent',
  discountValue: number,
  taxRatePercent: number,
  inclusive?: boolean
): QuotationTotals {
  const r = (Number(taxRatePercent) || 0) / 100;
  const raw = round2(items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0));
  if (inclusive) {
    const gross = round2(items.reduce((s, i) => s + shownUnitPrice(i.price, taxRatePercent, true) * (Number(i.qty) || 0), 0));
    const want = discountType === 'percent' ? (gross * (Number(discountValue) || 0)) / 100 : Number(discountValue) || 0;
    const discGross = round2(Math.min(Math.max(0, want), gross));
    const total = round2(gross - discGross);
    const subtotal = round2(total / (1 + r));
    const tax = round2(total - subtotal);
    const discount = discGross > 0 ? round2(Math.max(0, raw - subtotal)) : 0;
    return { rawSubtotal: raw, discount, subtotal, tax, total, grossRaw: gross, grossDiscount: discGross };
  }
  const want = discountType === 'percent' ? (raw * (Number(discountValue) || 0)) / 100 : Number(discountValue) || 0;
  const discount = round2(Math.min(Math.max(0, want), raw));
  const subtotal = round2(raw - discount);
  const tax = round2(subtotal * r);
  return { rawSubtotal: raw, discount, subtotal, tax, total: round2(subtotal + tax) };
}

export const todayYmd = (d: Date = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const addDaysYmd = (days: number) => todayYmd(new Date(Date.now() + days * 86400000));

/** منتهي الصلاحية: لم يُقبل ولم يُحوَّل وتجاوز تاريخ الصلاحية */
export function isExpired(q: Quotation): boolean {
  return (q.status === 'draft' || q.status === 'sent') && !!q.validUntil && q.validUntil < todayYmd();
}

export function nextQuotationNumber(all: Quotation[]): string {
  const max = all.reduce((m, q) => {
    const n = parseInt((q.number || '').replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `QT-${String(max + 1).padStart(4, '0')}`;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '0.00');

export type QuotePaper = 'A4' | 'A5' | 'thermal';
type QuoteCompany = { name: string; nameEn?: string; vat: string; address?: string; shortAddress?: string; phone?: string; mobile?: string; email?: string; logoUrl?: string; footerInfo?: boolean };

/** مقاس طباعة عرض السعر: A5، أو ورق متصل مع الإبرية، وإلا A4 (pageSize 'A4' = هوامش @page من المستند) */
export function quotationPrintSize(paper: 'A4' | 'A5' = 'A4'): { pageSize: 'A4' | 'A5' | 'CF' } {
  if (paper === 'A5') return { pageSize: 'A5' };
  return { pageSize: continuousPaper() ? 'CF' : 'A4' };
}

/** نسبة تصغير محتوى A5 (نفس تصميم A4) */
const A5_ZOOM = 0.74;

/** أنماط المعاينة على الشاشة فقط: ورقة بيضاء بمقاس الورق وهوامشه (لا تؤثر على الطباعة) */
export function quotationPreviewCss(paper: QuotePaper): string {
  if (paper === 'thermal') {
    const d = thermalLayout();
    return `@media screen { html { background: #2b3036; width: auto !important; padding: 0; } body { background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.15); width: ${d.content}mm !important; margin: 0 auto !important; transform: none !important; padding: 3mm 4mm 4mm !important; box-sizing: content-box !important; } }`;
  }
  const cf = paper === 'A4' ? continuousPaper() : null;
  const w = paper === 'A5' ? 148 : cf ? cf.w : 210;
  const z = paper === 'A5' ? A5_ZOOM : 1;
  return `@media screen { html { background: #2b3036; padding: 0; } body { background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.15); margin: 0 auto !important; width: ${(w / z).toFixed(1)}mm; min-height: ${((paper === 'A5' ? 210 : cf ? cf.h : 297) / z).toFixed(1)}mm; padding: ${(10 / z).toFixed(1)}mm ${((cf ? CONTINUOUS_SIDE_MM : 9) / z).toFixed(1)}mm ${(12 / z).toFixed(1)}mm ${((cf ? CONTINUOUS_SIDE_MM : 11) / z).toFixed(1)}mm; } }`;
}

/** عرض السعر على إيصال حراري (80/58مم) — بنفس ترتيب إيصال البيع: الرأس، البيانات، الأصناف (الاسم ثم الكمية × السعر)، الإجماليات */
export function quotationThermalHtml(q: Quotation, company: QuoteCompany, o: { heightMm?: number; raster?: boolean } = {}): string {
  const base = thermalLayout();
  const dims = o.raster ? { ...base, page: base.content, offset: 0 } : base;
  const k = (base.font || 100) / 100;
  const fz = (px: number) => `${(px * k).toFixed(1)}px`;
  const inc = !!q.pricesIncludeTax;
  const hasVat = (Number(q.taxRate) || 0) > 0;
  const t = inc ? calcQuotation(q.items, q.discountType, q.discountValue, q.taxRate, true) : null;
  const gross = inc ? t!.grossRaw || 0 : q.rawSubtotal;
  const disc = inc ? t!.grossDiscount || 0 : q.discount;
  const logoMm = receiptLogoMm();
  const rows = q.items.map((it) => {
    const up = shownUnitPrice(it.price, q.taxRate, q.pricesIncludeTax);
    return `<div class="it"><div class="nm">${esc(it.name)}</div><div class="ln"><span class="mono" dir="ltr">${esc(it.qty)} × ${money(up)}</span><span class="mono b9">${money(up * it.qty)}</span></div></div>`;
  }).join('');
  const bc = docBarcodeOn('quotation') ? docBarcodeHtml(q.number, { heightMm: 9, moduleMm: 0.3, maxWidthMm: 64, text: false }) : '';
  const row = (k2: string, v: string, cls = '') => `<div class="r ${cls}"><span>${k2}</span><span class="mono">${v}</span></div>`;
  // بلغتين (زر «ترجمة»): كل عنوان بالعربي وتحته الإنجليزي — مثل إيصال البيع
  const bi = printBilingual();
  const L = (ar: string, en: string) => (bi ? `<span class="bl">${ar}<span class="en">${en}</span></span>` : ar);
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(q.number)}</title>
<style>
  @page { size: ${dims.page}mm ${o.heightMm ? `${o.heightMm}mm` : 'auto'}; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html { margin: 0; padding: 0; width: ${dims.page}mm; direction: ltr; }
  body { font-family: "Tajawal", "Segoe UI", Tahoma, sans-serif; color: #000; direction: rtl; text-align: right; width: ${dims.content}mm; margin: 0 auto 0 ${Math.max(0, dims.offset)}mm; ${dims.offset < 0 ? `transform: translateX(${dims.offset}mm);` : ''} padding: 1mm ${base.padR}mm 3mm ${base.padL}mm; font-size: ${fz(12.5)}; font-weight: 600; }
  .mono { font-family: "Tajawal", "Segoe UI", Tahoma, sans-serif; direction: ltr; unicode-bidi: isolate; }
  .b9 { font-weight: 900; }
  .head { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 3mm; margin-bottom: 3mm; }
  .logo { display: flex; justify-content: center; margin: 0 auto 2mm; }
  .logo img { display: block; max-height: ${logoMm}mm; max-width: 60mm; width: auto; height: auto; object-fit: contain; }
  .head h2 { margin: 0; font-size: ${fz(15)}; font-weight: 900; line-height: 1.3; }
  .head .en { margin: 0; font-size: ${fz(12.5)}; font-weight: 900; direction: ltr; }
  .head p { margin: 1px 0 0; font-size: ${fz(11)}; line-height: 1.3; }
  .head .vat { font-size: ${fz(10.5)}; font-weight: 700; }
  .title { display: inline-block; margin-top: 2mm; font-weight: 900; border: 2px solid #000; padding: 1px 12px; border-radius: 4px; font-size: ${fz(12)}; }
  .meta { border-bottom: 1px solid #000; padding-bottom: 2mm; margin-bottom: 3mm; font-weight: 700; }
  .r { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; padding: 1px 0; }
  .ih { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 1mm; font-size: ${fz(11.5)}; font-weight: 900; }
  .ih small { font-weight: 700; font-size: inherit; }
  .it { padding: 1.5mm 0; border-bottom: 1px dashed rgba(0,0,0,.45); }
  .nm { font-size: ${fz(12.5)}; font-weight: 900; line-height: 1.3; word-break: break-word; }
  .ln { display: flex; justify-content: space-between; align-items: baseline; font-size: ${fz(12)}; margin-top: 1px; }
  .box { border: 1px dashed #000; padding: 1.5mm; margin: 2mm 0; font-size: ${fz(12)}; font-weight: 700; }
  .tot { border-top: 1px solid #000; padding-top: 2mm; margin-top: 3mm; font-weight: 700; }
  .grand { border-top: 2px dashed #000; padding-top: 1.5mm; margin-top: 1mm; font-weight: 900; font-size: ${fz(16)}; align-items: center; }
  .words { text-align: center; font-size: ${fz(12)}; font-weight: 700; line-height: 1.35; margin-top: 1mm; }
  .terms { margin-top: 3mm; font-size: ${fz(11)}; font-weight: 600; line-height: 1.4; }
  .terms b { display: block; font-weight: 900; margin-bottom: 1px; }
  .bc { margin-top: 3mm; display: flex; justify-content: center; }
  .foot { margin-top: 3mm; padding-top: 2mm; border-top: 2px dashed #000; text-align: center; font-size: ${fz(11)}; font-weight: 800; }
  .bl { display: inline-flex; flex-direction: column; line-height: 1.15; }
  .en { display: block; direction: ltr; text-align: right; font-size: ${fz(9.5)}; font-weight: 700; letter-spacing: -.1px; }
  .title .en, .foot .en, .words .en { text-align: center; }
  .grand .en { font-size: ${fz(10)}; }
</style></head><body>
<div class="head">
  ${company.logoUrl && logoMm > 0 ? `<div class="logo"><img src="${esc(company.logoUrl)}" alt=""></div>` : ''}
  ${company.name ? `<h2>${esc(company.name)}</h2>` : ''}
  ${company.nameEn?.trim() ? `<p class="en">${esc(company.nameEn.trim())}</p>` : ''}
  ${company.address ? `<p>${esc(company.address)}</p>` : ''}
  ${company.shortAddress?.trim() ? `<p>العنوان المختصر${bi ? ' <bdi dir="ltr">Short Address</bdi>' : ''}: <span class="mono">${esc(company.shortAddress.trim())}</span></p>` : ''}
  ${company.vat ? `<p class="vat">الرقم الضريبي${bi ? ' <bdi dir="ltr">VAT No.</bdi>' : ''}: <span class="mono">${esc(company.vat)}</span></p>` : ''}
  ${contactParts(company, bi).map((c) => `<p>${esc(c.label)}: <span class="mono">${esc(c.value)}</span></p>`).join('')}
  <div><span class="title">عرض سعر${bi ? '<span class="en">QUOTATION</span>' : ''}</span></div>
</div>
<div class="meta">
  ${row(L('رقم العرض:', 'Quotation No.'), esc(q.number))}
  <div class="r"><span>${L('التاريخ والوقت:', 'Date & time')}</span><span class="mono b9">${esc((q.date || '').slice(0, 16))}</span></div>
  ${row(L('صالح حتى:', 'Valid until'), esc(q.validUntil))}
  <div class="r"><span>${L('العميل:', 'Customer')}</span><span>${esc(customerLabel(q.customerName))}</span></div>
  ${q.customerPhone ? row(L('الجوال:', 'Mobile'), esc(q.customerPhone)) : ''}
</div>
<div class="ih"><span>${bi ? L('الصنف (الكمية × السعر)', 'Item (Qty × Price)') : 'الصنف <small>(الكمية × السعر)</small>'}</span><span>${L('المجموع', 'Total')}</span></div>
${rows}
${q.notes ? `<div class="box">${bi ? 'ملاحظة / Note' : 'ملاحظة'}: ${esc(q.notes).replace(/\n/g, '<br>')}</div>` : ''}
<div class="tot">
  ${disc > 0
    ? `${row(L(`المجموع قبل الخصم${inc && hasVat ? ' (شامل)' : ''}:`, `Subtotal before discount${inc && hasVat ? ' (incl. VAT)' : ''}`), money(gross))}${row(L(`الخصم${q.discountType === 'percent' ? ` (${esc(q.discountValue)}%)` : ''}:`, `Discount${q.discountType === 'percent' ? ` (${esc(q.discountValue)}%)` : ''}`), `- ${money(disc)}`, 'b9')}${row(L(hasVat ? 'الإجمالي الخاضع للضريبة:' : 'الإجمالي:', hasVat ? 'Taxable amount' : 'Subtotal'), money(q.subtotal))}`
    : row(L(hasVat ? 'المجموع (الخاضع للضريبة):' : 'المجموع:', hasVat ? 'Taxable amount' : 'Subtotal'), money(q.subtotal))}
  ${hasVat ? row(L(`الضريبة (${esc(q.taxRate)}%):`, `VAT (${esc(q.taxRate)}%)`), money(q.tax)) : ''}
  ${row(L(hasVat ? 'الإجمالي الشامل:' : 'الإجمالي:', hasVat ? 'Total (incl. VAT)' : 'Total'), money(q.total), 'grand')}
  <div class="words">${esc(tafqeet(q.total))}${bi && amountInWordsEn(q.total) ? `<span class="en">${esc(amountInWordsEn(q.total))}</span>` : ''}</div>
</div>
${q.terms ? `<div class="terms"><b>${bi ? 'الشروط والأحكام / Terms' : 'الشروط والأحكام'}</b>${esc(q.terms).replace(/\n/g, '<br>')}</div>` : ''}
${bc ? `<div class="bc">${bc}</div>` : ''}
<div class="foot">هذا المستند عرض سعر وليس فاتورة ضريبية${bi ? '<span class="en">This is a quotation, not a tax invoice</span>' : ''}</div>
</body></html>`;
}

export function quotationHtml(
  q: Quotation,
  company: QuoteCompany,
  /** full: PDF/مشاركة بالترويسة الكاملة حتى لو كانت الطباعة على ورق بترويسة جاهزة — paper: A4 (أو المتصل) / A5 */
  opts: { full?: boolean; paper?: 'A4' | 'A5' } = {}
): string {
  const a5 = opts.paper === 'A5';
  const hasVat = (Number(q.taxRate) || 0) > 0;
  // تصميم «مفرّغ»: بلا ألوان دائماً (طباعة وPDF) — والإبرية للطباعة فقط
  const plain = plainTheme();
  const rows = q.items
    .map(
      (it, i) => `<tr>
        <td>${i + 1}</td>
        <td class="name">${esc(it.name)}</td>
        <td>${esc(it.qty)}</td>
        <td>${money(shownUnitPrice(it.price, q.taxRate, q.pricesIncludeTax))}</td>
        <td>${money(shownUnitPrice(it.price, q.taxRate, q.pricesIncludeTax) * it.qty)}</td>
      </tr>`
    )
    .join('');
  // بلغتين (زر «ترجمة» بجانب قوالب A4): T = الإنجليزي بجانب العربي، TB = تحته
  const bi = printBilingual();
  const T = (ar: string, en: string) => (bi ? `${ar} <span class="en2">${en}</span>` : ar);
  const TB = (ar: string, en: string) => (bi ? `${ar}<span class="en3">${en}</span>` : ar);
  const contact = bi ? contactParts(company, true).map((p) => `${p.label}: ${p.value}`).join(' — ') : contactLine(company);
  const lhCfg = letterhead();
  const lh = lhCfg && !(opts.full && letterheadSettings().pdfFull) ? lhCfg : null;
  // وضع الطابعة الإبرية — للطباعة فقط (PDF والمشاركة بالألوان)
  // plain (المفرّغ): أنماط الإبرية بلا ألوان — حتى في PDF؛ الإبرية الحقيقية للطباعة فقط
  const realDm = dotMatrix() && !opts.full;
  const dm = plain || realDm;
  const cf = realDm && !a5 ? continuousPaper() : null;
  const side = cf ? `${CONTINUOUS_SIDE_MM}mm` : '';
  const bcHtml = docBarcodeOn('quotation') ? docBarcodeHtml(q.number, { heightMm: realDm ? 10 : 8, moduleMm: realDm ? 0.3 : 0.25, text: false }) : '';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(q.number)}</title>
<style>
  @page { size: ${cf ? `${cf.w}mm ${cf.h}mm` : a5 ? 'A5' : 'A4'}; margin: ${a5 ? (lh ? `${lh.topMm}mm 4mm ${lh.bottomMm}mm 6mm` : '7mm 4mm 11mm 6mm') : lh ? `${lh.topMm}mm ${side || '9mm'} ${lh.bottomMm}mm ${side || '11mm'}` : `12mm ${side || '9mm'} 16mm ${side || '11mm'}`}; ${lh ? '' : `@bottom-center { content: ${bi ? PAGE_NO_BI : '"صفحة " counter(page) " من " counter(pages)'}; font: 10px Tahoma, Arial, sans-serif; color: #000; } ${printStampCss()}`} }
  .en2 { direction: ltr; unicode-bidi: isolate; font-size: .85em; font-weight: 600; }
  .en3 { display: block; direction: ltr; font-size: 9.5px; font-weight: 600; line-height: 1.2; }
  .title .ten { margin-top: 0; font-size: 12px; font-weight: 700; letter-spacing: .2em; direction: ltr; text-align: left; }
  .lhhead .ten { text-align: center; font-size: 12px; font-weight: 700; letter-spacing: .2em; }
  .words .wen { display: block; direction: ltr; text-align: right; font-size: 11px; font-weight: 600; margin-top: 2px; }
  ${a5 ? '.en2 { font-size: .95em; font-weight: 700; } .en3 { font-size: 10.5px; font-weight: 700; } .words .wen { font-size: 12px; font-weight: 700; }' : ''}
  .lhhead { border-bottom: 3px solid #134e4a; padding-bottom: 8px; }
  .lhhead h1 { margin: 0; padding-top: 16px; font-size: 24px; text-align: center; }
  .lhrow { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-top: 6px; }
  .lhrow .l { text-align: left; }
  .lhrow .l .bc { margin-top: 4px; }
  .lhnote { margin-top: 18px; text-align: center; font-size: 10px; font-weight: 700; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: "Tajawal", "Segoe UI", Tahoma, sans-serif; color: #000; margin: 0; font-size: 13px; }
  ${a5 ? `body { zoom: ${A5_ZOOM}; }` : ''}
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #134e4a; padding-bottom: 10px; }
  .co { display: flex; gap: 12px; align-items: center; }
  .co img { max-height: 70px; max-width: 120px; object-fit: contain; }
  .co h2 { margin: 0; font-size: 20px; }
  .co small { display: block; color: #000; margin-top: 2px; }
  .title { text-align: left; }
  .title h1 { margin: 0; font-size: 26px; color: #000; }
  .title div { margin-top: 3px; color: #000; }
  .title .bc { margin-top: 6px; text-align: left; }
  .title .bc div { margin-top: 0; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 14px 0; }
  .box { border-top: 3px solid #134e4a; background: #f0fdfa; border-radius: 6px; padding: 9px 12px; }
  .box b { display: block; color: #134e4a; color: #000; font-size: 11px; margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: #134e4a; color: #fff; padding: 8px 6px; font-size: 12px; }
  td { padding: 7px 6px; border-bottom: 1px solid #e2e8f0; text-align: center; }
  td.name { text-align: right; }
  tr:nth-child(even) td { background: #f8fafc; }
  .totals { width: 46%; margin: 14px 0 0 auto; border-top: 3px solid #134e4a; background: #f0fdfa; border-radius: 6px; overflow: hidden; }
  .totals div { display: flex; justify-content: space-between; padding: 5px 10px; border-bottom: 1px solid #e2e8f0; }
  .totals .disc { color: #b45309; }
  .totals .grand { background: #134e4a; color: #fff; font-weight: 800; font-size: 15px; border-bottom: 0; }
  .words { margin-top: 8px; padding: 8px 12px; border-radius: 6px; background: #f0fdfa; border-right: 4px solid #134e4a; color: #134e4a; font-weight: 800; }
  .notes { margin-top: 16px; font-size: 12px; }
  .notes h4 { margin: 0 0 4px; color: #000; }
  .sign { display: flex; justify-content: space-between; margin-top: 46px; font-size: 12px; color: #000; }
  .sign div { width: 40%; border-top: 1.5px solid #134e4a; padding-top: 5px; text-align: center; }
  .foot { margin-top: 18px; text-align: center; color: #000; font-size: 10px; }
  .co .en { display: block; font-size: 14px; font-weight: 700; margin-top: 1px; direction: ltr; text-align: right; }
${dm ? `${dotMatrixCss('body.dm', realDm)}
  ${realDm ? 'body.dm { font-size: 14px; }' : ''}
  body.dm .top, body.dm .lhhead { border-bottom-width: 1.5px !important; }
  body.dm .box, body.dm .totals { border-top-width: 1px !important; border-radius: 0 !important; }
  body.dm .words { border-right-width: 1px !important; }
  body.dm .totals .grand, body.dm .footbar { border-top: 1.5px solid #000 !important; border-bottom: 1.5px solid #000 !important; border-radius: 0 !important; }
  body.dm .sign div { border-top-width: 1px !important; }` : ''}
.footbar { margin-top: 26px; border-radius: 10px; background: #134e4a; color: #fff; padding: 7px 14px; display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; font-weight: 700; break-inside: avoid; }
</style></head><body${dm ? ' class="dm"' : ''}>
${lh ? `<div class="lhhead">
  <h1>عرض سعر</h1>${bi ? '<div class="ten">QUOTATION</div>' : ''}
  <div class="lhrow">
    <div class="r"><div>${T('تاريخ الإصدار', 'Date')}: ${esc((q.date || '').slice(0, 10))}</div>${(q.date || '').split(/[ T]/)[1] ? `<div>${T('الوقت', 'Time')}: ${esc((q.date || '').split(/[ T]/)[1].slice(0, 8))}</div>` : ''}<div>${T('صالح حتى', 'Valid until')}: <b>${esc(q.validUntil)}</b></div></div>
    <div class="l"><div>${T('رقم العرض', 'Quotation No.')}: <b>${esc(q.number)}</b></div>${bcHtml ? `<div class="bc">${bcHtml}</div>` : ''}</div>
  </div>
</div>` : `<div class="top">
  <div class="co">
    ${company.logoUrl ? `<img src="${esc(company.logoUrl)}" alt="">` : ''}
    <div>
      <h2>${esc(company.name || '')}</h2>
      ${company.nameEn?.trim() ? `<span class="en">${esc(company.nameEn.trim())}</span>` : ''}
      ${company.vat ? `<small>${T('الرقم الضريبي', 'VAT No.')}: ${esc(company.vat)}</small>` : ''}
      ${company.address ? `<small>${esc(company.address)}</small>` : ''}
      ${company.shortAddress?.trim() ? `<small>${T('العنوان المختصر', 'Short Address')}: <bdi dir="ltr">${esc(company.shortAddress.trim())}</bdi></small>` : ''}
      ${contact ? `<small>${esc(contact)}</small>` : ''}
    </div>
  </div>
  <div class="title">
    <h1>عرض سعر</h1>${bi ? '<div class="ten">QUOTATION</div>' : ''}
    <div>${T('رقم العرض', 'Quotation No.')}: <b>${esc(q.number)}</b></div>
    <div>${T('تاريخ الإصدار', 'Date')}: ${esc((q.date || '').slice(0, 10))}</div>
    <div>${T('صالح حتى', 'Valid until')}: <b>${esc(q.validUntil)}</b></div>
    ${bcHtml ? `<div class="bc">${bcHtml}</div>` : ''}
  </div>
</div>`}
<div class="meta">
  <div class="box"><b>${T('السادة / العميل', 'Customer')}</b>${esc(customerLabel(q.customerName))}</div>
  <div class="box"><b>${T('الجوال', 'Mobile')}</b>${esc(q.customerPhone || '—')}</div>
</div>
<table>
  <thead><tr><th style="width:36px">#</th><th>${TB('الصنف / الوصف', 'Item / Description')}</th><th style="width:70px">${TB('الكمية', 'Qty')}</th><th style="width:100px">${TB('سعر الوحدة', 'Unit price')}${hasVat ? `<br><small>${q.pricesIncludeTax ? TB('شامل الضريبة', 'VAT incl.') : TB('غير شامل الضريبة', 'VAT excl.')}</small>` : ''}</th><th style="width:110px">${TB('المجموع', 'Total')}${hasVat ? `<br><small>${q.pricesIncludeTax ? TB('شامل الضريبة', 'VAT incl.') : TB('غير شامل الضريبة', 'VAT excl.')}</small>` : ''}</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="totals">
  ${(() => {
    const inc = !!q.pricesIncludeTax;
    const t = inc ? calcQuotation(q.items, q.discountType, q.discountValue, q.taxRate, true) : null;
    const gross = inc ? t!.grossRaw || 0 : q.rawSubtotal;
    const disc = inc ? t!.grossDiscount || 0 : q.discount;
    const pct = q.discountType === 'percent' ? ` (${esc(q.discountValue)}%)` : '';
    return `
  ${disc > 0 ? `<div><span>${TB(`المجموع${inc && hasVat ? ' (شامل الضريبة)' : ''}`, `Subtotal${inc && hasVat ? ' (VAT incl.)' : ''}`)}</span><span>${money(gross)}</span></div>
  <div class="disc"><span>${TB(`الخصم${pct}`, `Discount${pct}`)}</span><span>- ${money(disc)}</span></div>` : ''}
  ${hasVat ? `<div><span>${TB('الإجمالي غير شامل الضريبة', 'Total excl. VAT')}</span><span>${money(q.subtotal)}</span></div>
  <div><span>${TB(`ضريبة القيمة المضافة (${esc(q.taxRate)}%)`, `VAT (${esc(q.taxRate)}%)`)}</span><span>${money(q.tax)}</span></div>` : ''}`;
  })()}
  <div class="grand"><span>${TB(hasVat ? 'الإجمالي شامل الضريبة' : 'الإجمالي', hasVat ? 'Total incl. VAT' : 'Total')}</span><span>${money(q.total)}</span></div>
</div>
<div class="words">${esc(tafqeet(q.total))}${bi && amountInWordsEn(q.total) ? `<span class="wen">${esc(amountInWordsEn(q.total))}</span>` : ''}</div>
${q.notes ? `<div class="notes"><h4>${T('ملاحظات', 'Notes')}</h4>${esc(q.notes).replace(/\n/g, '<br>')}</div>` : ''}
${q.terms ? `<div class="notes"><h4>${T('الشروط والأحكام', 'Terms & Conditions')}</h4>${esc(q.terms).replace(/\n/g, '<br>')}</div>` : ''}
<div class="sign"><div>${T('ختم وتوقيع المنشأة', 'Company stamp & signature')}</div><div>${T('موافقة العميل', 'Customer approval')}</div></div>
${lh ? `<div class="lhnote">${T('هذا المستند عرض سعر وليس فاتورة ضريبية', 'This is a quotation, not a tax invoice')}</div>` : `<div class="footbar"><span>${T('هذا المستند عرض سعر وليس فاتورة ضريبية', 'This is a quotation, not a tax invoice')}</span>${company.footerInfo ? `<span>${esc(company.name || '')}${contact ? ' — ' + esc(contact) : ''}</span>` : ''}</div>`}
</body></html>`;
}
