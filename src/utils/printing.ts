import { unsnapClone } from './barcodeSnap';
import type { OsPrinter } from '../storage/persistence';

export interface PrintSettings {
  /** طباعة صامتة (بدون نافذة اختيار الطابعة) — تعمل في النسخة المكتبية فقط */
  silent: boolean;
  /** طابعة الإيصالات الافتراضية (اسمها في ويندوز). فارغ = طابعة النظام الافتراضية */
  receiptPrinter: string;
  /** طابعة A4 (الفواتير الكبيرة والتقارير). فارغ = نفس طابعة الإيصالات */
  a4Printer: string;
  /** طابعة ملصقات الباركود. فارغ = طابعة النظام الافتراضية */
  labelPrinter: string;
  /** طابعة عروض الأسعار. فارغ = طابعة A4 */
  quotationPrinter?: string;
  /** آخر ورق اختير لعرض السعر من نافذة المعاينة: A4 (أو المتصل مع الإبرية) / A5 / إيصال حراري */
  quotationPaper?: 'A4' | 'A5' | 'thermal';
  /** عدد نسخ الإيصال */
  copies: number;
  /** طباعة تذاكر المطبخ/الأقسام تلقائياً عند البيع (وضع المطعم) */
  autoKitchenTickets: boolean;
  /** قالب ألوان مستندات A4 (الفاتورة، عرض السعر، فاتورة الشراء، التقارير) */
  a4Theme?: A4Theme;
  /** حجم الشعار في إيصال 80مم */
  receiptLogo?: ReceiptLogoSize;
  /** عرض ورق الطابعة الحرارية */
  thermalPaper?: ThermalPaper;
  /** إزاحة أفقية للطباعة الحرارية بالمم (موجب = نحو اليمين) لتصحيح ميل الطابعة */
  thermalOffsetMm?: number;
  /** هامش يمين/يسار لإيصال 80مم (مم) — إن خرجت الكتابة عن الورقة */
  thermalPadRightMm?: number;
  thermalPadLeftMm?: number;
  /** حجم خط إيصال 80مم (نسبة مئوية، 100 = افتراضي) */
  thermalFontPct?: number;
  /** دقة رأس الطابعة الحرارية: auto = حسب اسم الطابعة (إبسون TM-T70/T88 = 180، غيرها 203) */
  thermalDpi?: ThermalDpi;
  /** إظهار باركود رقم المستند (افتراضي: الكل ظاهر) */
  docBarcode?: { receipt?: boolean; a4?: boolean; quotation?: boolean };
  /** مقاس ورق الفاتورة الكبيرة: A4 (الافتراضي) أو A5 (نصف A4) */
  largePaper?: 'A4' | 'A5';
  /** الطباعة على ورق بترويسة وتذييل مطبوعين مسبقاً (A4/A5) */
  letterhead?: Partial<LetterheadCfg>;
  /** وضع الطابعة الإبرية (A4/A5 وعرض السعر): بلا خلفيات ولا ألوان، خطوط رفيعة، خط أوضح، باركود وQR أكبر */
  dotMatrix?: boolean;
  /** مقاس الورق مع الطابعة الإبرية: متصل 9.5×11 إنش (الافتراضي) / متصل 9.5×12 / A4 / A5 */
  dotMatrixPaper?: DotMatrixPaper;
  /** الشروط والأحكام وبيانات البنك تظهر في PDF والمشاركة فقط — تُخفى عند الطباعة بالإبرية أو على الترويسة الجاهزة */
  extrasPdfOnly?: boolean;
  /** إيصال 80مم مباشرة للطابعة الحرارية (ESC/POS): بلا فراغ أعلى/أسفل + قص — افتراضي: نعم (قديم: يحلّ محله receiptMode) */
  receiptRaw?: boolean;
  /** طريقة طباعة الإيصال على الطابعة الحرارية (ESC/POS مباشر / تعريف ويندوز بمقاس الإيصال / تعريف ويندوز بورق الطابعة) */
  receiptMode?: ReceiptMode;
  /** طابعة المطبخ الرئيسية: تطبع كل أصناف الطلب */
  kitchenMain?: KitchenMainPrinter;
  /** إظهار أزرار «ورقة اختبار» في شاشة الطابعات */
  showTestButtons?: boolean;
  /** ماذا يحدث بعد البيع — غير محدد = حسب الطباعة الصامتة (توافق مع الإصدارات السابقة) */
  afterSale?: AfterSaleMode;
  /** المقاسات الظاهرة في نافذة المعاينة (الفواتير وعروض الأسعار) — كلها ظاهرة افتراضياً */
  previewPapers?: { thermal?: boolean; A4?: boolean; A5?: boolean };
  /**
   * الطباعة بلغتين (زر «ترجمة» بجانب قوالب A4): الإيصال الحراري والفاتورة وعرض السعر A4/A5 وعرض السعر 80مم —
   * كل عنوان بالعربي ومعه الإنجليزي. غير محدد = حسب لغة البرنامج (الإنجليزية تشغّله، العربية تطفئه).
   */
  bilingualPrint?: boolean;
}

export type PreviewPaperKey = 'thermal' | 'A4' | 'A5';
/** هل يظهر هذا المقاس في نافذة المعاينة؟ (افتراضياً نعم) */
export const previewPaperOn = (ps: PrintSettings | undefined, k: PreviewPaperKey) => ps?.previewPapers?.[k] !== false;
/** أول مقاس ظاهر بديلاً عن مقاس مخفي */
export function visiblePreviewPaper(ps: PrintSettings | undefined, want: PreviewPaperKey): PreviewPaperKey {
  if (previewPaperOn(ps, want)) return want;
  return (['A4', 'A5', 'thermal'] as PreviewPaperKey[]).find((k) => previewPaperOn(ps, k)) || want;
}

/** سلوك ما بعد البيع */
export type AfterSaleMode = 'print80' | 'printA4' | 'printA5' | 'ask' | 'pdf' | 'none';
export const AFTER_SALE_OPTIONS: { v: AfterSaleMode; label: string; hint: string }[] = [
  { v: 'print80', label: '🧾 إيصال 80مم مباشرة', hint: 'يُطبع على طابعة الإيصالات فوراً بدون أي نافذة' },
  { v: 'printA4', label: '📄 فاتورة A4 مباشرة', hint: 'تُطبع على طابعة A4 فوراً بدون أي نافذة' },
  { v: 'printA5', label: '📃 فاتورة A5 مباشرة', hint: 'تُطبع بمقاس A5 على طابعة A4 فوراً بدون أي نافذة' },
  { v: 'ask', label: '🪟 نافذة ما بعد البيع', hint: 'تظهر نافذة يختار فيها الكاشير: إيصال / A4 / A5 / PDF / مشاركة / إغلاق' },
  { v: 'pdf', label: '💾 حفظ PDF', hint: 'يُحفظ ملف PDF للفاتورة' },
  { v: 'none', label: '🚫 بدون طباعة', hint: 'لا طباعة ولا نافذة (يمكن الطباعة لاحقاً من سجل الفواتير)' },
];

/** حدود الضبط: الهوامش 0–20مم، الخط 60–160% */
export const TICKET_PAD_DEFAULT = 2;
export const PAD_MAX_MM = 20;
export const clampPad = (v: unknown, d = TICKET_PAD_DEFAULT) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(PAD_MAX_MM, n)) : d; };
export const clampFont = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.max(60, Math.min(160, Math.round(n))) : 100; };

export interface KitchenMainPrinter {
  enabled: boolean;
  /** اسم الطابعة (يظهر في رأس ورقة الطلب) — فارغ = «طابعة المطبخ» */
  name?: string;
  /** اسم طابعة ويندوز (فارغ = طابعة الإيصالات) */
  printer: string;
  /** ticket = ورقة طلب عادية (للتحضير)، priced = ورقة طلب بالأسعار */
  template: 'ticket' | 'priced';
  /** طباعة مباشرة بدون نافذة */
  silent: boolean;
  offsetMm: number;
  /** طابعة حرارية مباشرة (ESC/POS): طول الورقة = المحتوى + قص تلقائي */
  raw?: boolean;
  /** هامش يمين/يسار (مم) وحجم الخط (%) */
  padRightMm?: number;
  padLeftMm?: number;
  fontPct?: number;
  /** عدد النسخ لكل طلب (1–5) */
  copies?: number;
}
/** عدد نسخ ورقة الطلب: 1–5 */
export const clampCopies = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 ? Math.min(5, n) : 1; };
export const DEFAULT_KITCHEN_MAIN: KitchenMainPrinter = { enabled: false, printer: '', template: 'ticket', silent: true, offsetMm: 0, raw: true, padRightMm: TICKET_PAD_DEFAULT, padLeftMm: TICKET_PAD_DEFAULT, fontPct: 100, copies: 1 };

/* ---------------- مقاس الورق الحراري ----------------
 * الطابعة الحرارية 80مم تطبع فعلياً على 72مم فقط (و58مم على 48مم)، ومعظم التعريفات تبدأ الطباعة
 * من الحافة اليسرى للمنطقة القابلة للطباعة — لذلك المحتوى بعرض المنطقة الفعلية ومحاذى لليسار + إزاحة قابلة للضبط.
 * ونحدد مقاس الصفحة صراحةً (عرض الرول × طول المحتوى) بدل مقاس الطابعة الافتراضي (A4) */
export type ThermalPaper = '80' | '58';
/** دقة رأس الطباعة: 203 نقطة/بوصة (576 نقطة لـ 80مم — معظم الطابعات) أو 180 (512 نقطة — إبسون TM-T70/T88) */
export type ThermalDpi = 'auto' | '203' | '180';
let thermalCfg: { paper: ThermalPaper; offset: number; padR: number; padL: number; font: number; dpi: ThermalDpi } = { paper: '80', offset: 0, padR: 1, padL: 1, font: 100, dpi: 'auto' };
export const setThermal = (ps?: Partial<PrintSettings>) => {
  thermalCfg = {
    paper: ps?.thermalPaper === '58' ? '58' : '80',
    offset: Math.max(-8, Math.min(8, Number(ps?.thermalOffsetMm) || 0)),
    padR: clampPad(ps?.thermalPadRightMm, 1), padL: clampPad(ps?.thermalPadLeftMm, 1), font: clampFont(ps?.thermalFontPct),
    dpi: ps?.thermalDpi === '180' || ps?.thermalDpi === '203' ? ps.thermalDpi : 'auto',
  };
};
export const thermalDims = () => (thermalCfg.paper === '58' ? { page: 58, content: 48, offset: thermalCfg.offset } : { page: 80, content: 72, offset: thermalCfg.offset });
/** إعدادات الورق الحراري كاملة (للمستندات الحرارية المبنية كـ HTML مثل عرض السعر) */
export const thermalLayout = () => ({ ...thermalDims(), padR: thermalCfg.padR, padL: thermalCfg.padL, font: thermalCfg.font });

/** طول الإيصال الظاهر بالمم (لمقاس الصفحة) */
function measureThermalMm(): number {
  // الإيصال نفسه داخل #printable-invoice-body (العنصر الأول في الحاوية هو شريط أزرار المعاينة)
  const el = (document.querySelector('#printable-invoice-body > *') || document.getElementById('printable-invoice-body')) as HTMLElement | null;
  const { content } = thermalDims();
  // الهوامش تضيّق السطر والخط الأكبر يطيله → تقدير الطول بنفس النسبة
  const f = thermalCfg.font / 100;
  const narrowBy = content / Math.max(20, content - thermalCfg.padR - thermalCfg.padL + 2);
  const px = (el ? el.scrollHeight : 1100) * Math.max(1, f * narrowBy);
  // المحتوى يُطبع بعرض أضيق قليلاً من المعاينة (290px) → هامش بسيط للطول
  const ratio = content < 60 ? 290 / (content * 96 / 25.4) : 1.02;
  return Math.min(2000, Math.max(60, Math.ceil(px * ratio * 25.4 / 96 + 5)));
}

/** قواعد طباعة مؤقتة: مقاس الصفحة = الرول، والمحتوى بعرض المنطقة القابلة للطباعة */
function injectThermalPrintCss(heightMm: number, pdf = false): () => void {
  // PDF: صفحة 80مم بلا إزاحة الطابعة (الإزاحة تعويض لطابعة بعينها)
  const d = thermalDims();
  const page = pdf ? 80 : d.page, content = pdf ? 72 : d.content, offset = pdf ? 0 : d.offset;
  const { padR, padL, font } = thermalCfg;
  const z = font / 100;
  // الإيصال بعرض الرول كاملاً: الحافة غير القابلة للطباعة (≈4مم لكل جهة في 80مم) + هامش المستخدم لكل جهة
  // (سابقاً كان المحتوى 72مم ملتصقاً باليسار فيبقى فراغ ≈4مم يميناً مهما ضُبط الهامش)
  const base = (page - content) / 2;
  const st = document.createElement('style');
  st.id = 'thermal-print-size';
  st.textContent = `@media print {
    @page { size: ${page}mm ${heightMm}mm !important; margin: 0 !important; }
    html, body { width: ${page}mm !important; }
    #printable-invoice-container { width: ${page}mm !important; }
    #printable-invoice-body { display: block !important; width: ${page}mm !important; padding: 0 !important; direction: ltr !important; }
    #printable-invoice-body > * { direction: rtl; width: ${(page / z).toFixed(2)}mm !important; max-width: ${(page / z).toFixed(2)}mm !important; zoom: ${z}; margin: 0 !important; ${offset ? `transform: translateX(${offset / z}mm);` : ''} padding: 1.5mm ${((base + padR) / z).toFixed(2)}mm 1.5mm ${((base + padL) / z).toFixed(2)}mm !important; border: 0 !important; box-shadow: none !important; }
  }`;
  document.head.appendChild(st);
  return () => st.remove();
}

/** PDF/مشاركة الإيصال الحراري: نفس قواعد الطباعة (بلا إطار المعاينة وظلّها) وطول المحتوى الفعلي */
export function thermalPdfPrep(): { heightMm: number; cleanup: () => void } {
  const heightMm = measureThermalMm();
  return { heightMm, cleanup: injectThermalPrintCss(heightMm, true) };
}

/**
 * «ورق الطابعة»: لا نفرض مقاساً ولا هوامش — الورقة والهوامش من تعريف الطابعة نفسه (مثل ورقة ويندوز التجريبية)،
 * والإيصال يتمدد داخل منطقة الطباعة التي يعلنها التعريف (حدّه الأقصى 72/48مم) فلا يُقص من أي جهة.
 * يحاذى لبداية الورقة (اليسار) حتى لو كان ورق التعريف أعرض من الرول.
 * لا قاعدة ‎@page إطلاقاً (ولا الهامش الافتراضي للبرنامج): أي هامش من CSS قد يتقدّم على هوامش التعريف فيُقص الإيصال.
 */
function injectThermalFitCss(): () => void {
  const { content, offset } = thermalDims();
  const { padR, padL, font } = thermalCfg;
  const z = font / 100;
  const pageMargin = document.getElementById('sl-print-page-margin') as HTMLStyleElement | null;
  const prevMedia = pageMargin?.getAttribute('media');
  if (pageMargin) pageMargin.media = 'not all';
  const st = document.createElement('style');
  st.id = 'thermal-print-fit';
  st.textContent = `@media print {
    html, body { width: auto !important; }
    #printable-invoice-body { display: block !important; width: auto !important; padding: 0 !important; direction: ltr !important; }
    #printable-invoice-body > * { direction: rtl; box-sizing: border-box !important; width: auto !important; max-width: ${(content / z).toFixed(2)}mm !important; zoom: ${z}; margin: 0 auto 0 0 !important; ${offset ? `transform: translateX(${offset / z}mm);` : ''} padding: 1mm ${(padR / z).toFixed(2)}mm 1mm ${(padL / z).toFixed(2)}mm !important; border: 0 !important; box-shadow: none !important; }
    #printable-invoice-body img { max-width: 100% !important; height: auto !important; }
  }`;
  document.head.appendChild(st);
  return () => {
    st.remove();
    if (pageMargin) { if (prevMedia == null) pageMargin.removeAttribute('media'); else pageMargin.setAttribute('media', prevMedia); }
  };
}

/** نفس فكرة «ورق الطابعة» لمستند حراري مبني كـ HTML (ورقة المطبخ، عرض السعر، ورقة الاختبار): تُحذف قواعد ‎@page (المقاس والهوامش) */
function fitThermalHtml(html: string, offset = thermalDims().offset): string {
  const { content } = thermalDims();
  html = html.replace(/@page\s*\{[^{}]*\}/g, '');
  const css = `<style id="sl-fit">
  html { width: auto !important; margin: 0 !important; padding: 0 !important; }
  /* margin-right:auto = محاذاة لليسار حتى لو انتقل اتجاه body (rtl) للجذر */
  body { width: auto !important; max-width: ${content}mm !important; margin: 0 auto 0 0 !important; transform: ${offset ? `translateX(${offset}mm)` : 'none'} !important; }
  img, svg:not(.sl-ruler) { max-width: 100% !important; }
</style>`;
  return html.includes('</head>') ? html.replace('</head>', `${css}</head>`) : css + html;
}

/* ---------------- باركود رقم المستند ---------------- */
export type DocBarcodeKind = 'receipt' | 'a4' | 'quotation';
/** ارتفاع الباركود بالمم — موحّد لكل المستندات */
export const DOC_BARCODE_MM = 12;
let docBarcodeCfg: Required<NonNullable<PrintSettings['docBarcode']>> = { receipt: true, a4: true, quotation: true };
export const setDocBarcodes = (ps?: Partial<PrintSettings>) => {
  const d = ps?.docBarcode || {};
  docBarcodeCfg = { receipt: d.receipt !== false, a4: d.a4 !== false, quotation: d.quotation !== false };
  // مع الطابعة الإبرية: مقاسها هو المعتمد (الورق المتصل يأخذ خانة «الورقة الكبيرة»)
  largePaperCfg = ps?.dotMatrix ? (ps.dotMatrixPaper === 'A5' ? 'A5' : 'A4') : ps?.largePaper === 'A5' ? 'A5' : 'A4';
  dotMatrixPaperCfg = ps?.dotMatrixPaper || 'cf11';
  extrasPdfOnlyCfg = !!ps?.extrasPdfOnly;
  letterheadCfg = { ...DEFAULT_LETTERHEAD, ...(ps?.letterhead || {}) };
  dotMatrixCfg = !!ps?.dotMatrix;
};
/** هل الطباعة بلغتين مفعّلة؟ الإعداد الصريح، وإلا حسب لغة البرنامج (الإنجليزية = نعم) */
export const bilingualPrintOn = (ps: Pick<PrintSettings, 'bilingualPrint'> | undefined, uiLang: string, legacyReceipt = false) =>
  ps?.bilingualPrint ?? (legacyReceipt || uiLang === 'en');
/** الطباعة بلغتين لكل المستندات المطبوعة (الإيصال، A4/A5، عروض الأسعار) — يضبطها البرنامج عند كل رسم */
let printBilingualCfg = false;
export const setPrintBilingual = (on: boolean) => { printBilingualCfg = !!on; };
export const printBilingual = () => printBilingualCfg;
/** ترقيم الصفحات بلغتين (‎@page): كل جزء معزول اتجاهياً (RLI/LRI) حتى لا تختلط الأرقام بين العربي والإنجليزي */
export const PAGE_NO_BI = '"\u2067صفحة " counter(page) " من " counter(pages) "\u2069  ·  \u2066Page " counter(page) " of " counter(pages) "\u2069"';
export const docBarcodeOn = (k: DocBarcodeKind) => docBarcodeCfg[k] !== false;
/** مقاس الفاتورة الكبيرة (A4 / A5) — يُضبط من إعدادات الطباعة مع setDocBarcodes */
let largePaperCfg: 'A4' | 'A5' = 'A4';
/** اختيار المقاس من نافذة معاينة الطباعة (يتقدّم على الإعداد ما دامت مفتوحة) */
let largePaperOverride: 'A4' | 'A5' | null = null;
export const setLargePaperOverride = (p: 'A4' | 'A5' | null) => { largePaperOverride = p; };
export const largePaper = () => largePaperOverride ?? largePaperCfg;

/** ورق بترويسة جاهزة: تُخفى ترويسة الفاتورة وتذييلها ويُترك هامش بمقاسها */
export interface LetterheadCfg { enabled: boolean; topMm: number; bottomMm: number; hideSeller: boolean; pdfFull: boolean }
export const DEFAULT_LETTERHEAD: LetterheadCfg = { enabled: false, topMm: 40, bottomMm: 25, hideSeller: false, pdfFull: true };
let letterheadCfg: LetterheadCfg = DEFAULT_LETTERHEAD;
let letterheadSuppressed = false;
/** حفظ PDF/المشاركة/الأرشيف بالترويسة الكاملة مؤقتاً */
export const setLetterheadSuppressed = (v: boolean) => { letterheadSuppressed = v; };
export const letterheadSettings = () => letterheadCfg;
export const letterhead = (): LetterheadCfg | null => (letterheadCfg.enabled && !letterheadSuppressed ? letterheadCfg : null);

/** وضع الطابعة الإبرية — للطباعة فقط؛ PDF والمشاركة والأرشيف تبقى بالألوان */
let dotMatrixCfg = false;
let dotMatrixSuppressed = false;
export const setDotMatrixSuppressed = (v: boolean) => { dotMatrixSuppressed = v; };
export const dotMatrixSetting = () => dotMatrixCfg;
export const dotMatrix = () => dotMatrixCfg && !dotMatrixSuppressed;
/** الورق المتصل للطابعة الإبرية — العرض يشمل شريطي الثقوب (12.7مم لكل جانب) فيُترك هامش جانبي 15مم */
export type DotMatrixPaper = 'cf11' | 'cf12' | 'A4' | 'A5';
export const CONTINUOUS_PAPERS: Record<'cf11' | 'cf12', { w: number; h: number; label: string; hint: string }> = {
  cf11: { w: 241.3, h: 279.4, label: 'متصل \u20669.5×11\u2069', hint: 'ورق متصل \u206624×28\u2069 سم — الأكثر استخداماً' },
  cf12: { w: 241.3, h: 304.8, label: 'متصل \u20669.5×12\u2069', hint: 'ورق متصل \u206624×30.5\u2069 سم' },
};
export const CONTINUOUS_SIDE_MM = 15;
let dotMatrixPaperCfg: DotMatrixPaper = 'cf11';
/** «الشروط والبنك في PDF فقط» + علامة أن العرض الحالي لـ PDF/مشاركة/أرشيف (وليس للطباعة) */
let extrasPdfOnlyCfg = false;
let pdfRender = false;
export const setPdfRender = (v: boolean) => { pdfRender = v; };
/** الخيار مؤثّر الآن؟ (مفعّل + الطباعة بالإبرية أو بالترويسة الجاهزة) */
export const extrasPdfOnlyActive = () => extrasPdfOnlyCfg && (dotMatrixCfg || letterheadCfg.enabled);
/** إخفاء الشروط والبنك في هذا العرض: طباعة (أو معاينتها) بالإبرية/الترويسة مع تفعيل الخيار */
export const hidePrintExtras = () => extrasPdfOnlyActive() && !pdfRender;
export const dotMatrixPaperSetting = () => dotMatrixPaperCfg;
/** مقاس الورق المتصل إن كانت الطباعة الحالية على الإبرية بورق متصل (وليس PDF أو اختيار A5 من المعاينة) */
export const continuousPaper = (): { w: number; h: number; label: string } | null =>
  dotMatrix() && (dotMatrixPaperCfg === 'cf11' || dotMatrixPaperCfg === 'cf12') && largePaper() === 'A4' ? CONTINUOUS_PAPERS[dotMatrixPaperCfg] : null;
/** أنماط وضع الإبرية — تُطبَّق على عنصر يحمل الصنف المعطى (الفاتورة أو body عرض السعر) */
export const dotMatrixCss = (root: string, bold = true) => `
  ${root}, ${root} * { color: #000 !important; background: transparent !important; box-shadow: none !important; text-shadow: none !important; }
  ${root} { background: #fff !important; }
  ${root} * { border-color: #000 !important; }
  ${bold ? `${root} { font-weight: 600; }` : ''}
  ${root} img { filter: grayscale(1) contrast(1.15); }
  ${root} thead tr, ${root} th { border-top: 1.5px solid #000 !important; border-bottom: 1.5px solid #000 !important; }
  ${root} [data-dm="bar"] { border-top: 1.5px solid #000 !important; border-bottom: 1.5px solid #000 !important; border-radius: 0 !important; }
`;

/* ---------------- شعار الإيصال الحراري ---------------- */
export type ReceiptLogoSize = 'hidden' | 'sm' | 'md' | 'lg' | 'xl';
/** الارتفاع بالمم (العرض الأقصى 60مم ضمن عرض الطباعة 72مم) */
export const RECEIPT_LOGO_SIZES: Record<ReceiptLogoSize, { label: string; mm: number }> = {
  hidden: { label: 'بدون شعار', mm: 0 },
  sm: { label: 'صغير', mm: 12 },
  md: { label: 'متوسط', mm: 18 },
  lg: { label: 'كبير', mm: 25 },
  xl: { label: 'كبير جداً', mm: 32 },
};
let activeReceiptLogo: ReceiptLogoSize = 'md';
export const setReceiptLogo = (s?: ReceiptLogoSize) => { activeReceiptLogo = s && RECEIPT_LOGO_SIZES[s] ? s : 'md'; };
export const receiptLogoMm = () => RECEIPT_LOGO_SIZES[activeReceiptLogo].mm;

/* ---------------- قوالب ألوان A4 ---------------- */
export type A4Theme = 'green' | 'black' | 'blue' | 'plain';
export const A4_THEMES: Record<A4Theme, { label: string; main: string; soft: string; softBorder: string }> = {
  green: { label: 'أخضر — هوية البرنامج', main: '#134e4a', soft: '#f0fdfa', softBorder: '#ccfbf1' },
  black: { label: 'أسود — كلاسيكي', main: '#111111', soft: '#f4f4f5', softBorder: '#d4d4d8' },
  blue: { label: 'أزرق — رسمي', main: '#1e3a8a', soft: '#eff6ff', softBorder: '#bfdbfe' },
  // مفرّغ: أسود على أبيض بلا خلفيات ولا ألوان — يُطبَّق بأنماط «بلا ألوان» على كل مستندات A4/A5
  plain: { label: 'مفرّغ — بلا ألوان', main: '#000000', soft: '#ffffff', softBorder: '#000000' },
};
let activeA4Theme: A4Theme = 'green';
export const setA4Theme = (t?: A4Theme) => { activeA4Theme = t && A4_THEMES[t] ? t : 'green'; };
export const getA4Theme = (): A4Theme => activeA4Theme;
export const a4Colors = (t: A4Theme = activeA4Theme) => A4_THEMES[t] || A4_THEMES.green;
/** تصميم «مفرّغ» مختار لمستندات A4 */
export const plainTheme = () => activeA4Theme === 'plain';
/** يطبّق قالب الألوان على مستند HTML مبني بألوان الهوية الخضراء */
export function applyA4Theme(html: string, t: A4Theme = activeA4Theme): string {
  if (t === 'green' || !A4_THEMES[t]) return html;
  const c = A4_THEMES[t];
  const out = html.replace(/#134e4a/gi, c.main).replace(/#f0fdfa/gi, c.soft).replace(/#ccfbf1/gi, c.softBorder);
  // مفرّغ: إلغاء الخلفيات والألوان (أشرطة العناوين تصير خطوطاً)
  return t === 'plain' && !out.includes('data-plain-css') ? out.replace('</head>', `<style data-plain-css>${dotMatrixCss('body', false)} body { background: #fff !important; }</style></head>`) : out;
}

export const defaultPrintSettings: PrintSettings = {
  silent: false,
  receiptPrinter: '',
  a4Printer: '',
  labelPrinter: '',
  copies: 1,
  autoKitchenTickets: true,
  receiptMode: 'auto',
};

export const isElectron = () => typeof window !== 'undefined' && !!window.ledger;

/** اسم طابعة ويندوز الافتراضية (آخر قائمة) — لمعرفة نوعها حين لا تُحدَّد طابعة الإيصالات */
let osDefaultPrinter = '';
export async function listOsPrinters(): Promise<OsPrinter[]> {
  if (!window.ledger) return [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const list = await window.ledger.print.list();
      if (list.length) { osDefaultPrinter = list.find((p) => p.isDefault)?.name || ''; return list; }
    } catch (e) {
      console.error('listOsPrinters failed', e);
    }
    // قائمة فارغة: إعادة المحاولة مرة بعد ثانيتين (خدمة الطباعة قد تكون مشغولة لحظة فتح البرنامج)
    if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
  }
  return [];
}

/** الطريقة التي طُبعت بها الورقة فعلاً (للتشخيص في ورقة الاختبار) */
export type ThermalVia = 'escpos' | 'driver' | 'driverPaper';
export interface PrintResult { ok: boolean; reason?: string; via?: ThermalVia; /** فشلت الطريقة الأولى فطُبعت بطريقة بديلة */ fellBack?: boolean }

/** أُلغيت من نافذة الطباعة (ليست خطأ يستحق التنبيه) */
export const PRINT_CANCELLED = 'أُلغيت الطباعة';
/** أسباب فشل الطباعة عبر التعريف (رسائل Electron بالإنجليزية) → عربي واضح */
export function printReasonAr(reason: string | undefined, printer?: string): string {
  const r = String(reason || '').trim();
  if (!r) return '';
  if (/invalid deviceName/i.test(r)) return `الطابعة ${printer ? `«${printer}» ` : ''}غير متاحة في ويندوز — أو خدمة الطباعة (Print Spooler) متوقفة`;
  if (/cancel/i.test(r)) return PRINT_CANCELLED;
  if (/print job failed/i.test(r)) return 'فشلت مهمة الطباعة في ويندوز';
  return r;
}

/**
 * طابعات لا تفهم أوامر ESC/POS (الإرسال المباشر لها يطبع رموزاً غير مفهومة) فتُطبع في «تلقائي» عبر تعريف ويندوز:
 *  - CognitiveTPG (A798/A799…: أوامرها الأصلية أو محاكاة A793/A794)، وستار (وضع Star Line)
 *  - طابعات الملصقات (Zebra/TSC/Godex/Dymo/Brother/4BARCODE) والليزر والحبر (HP/Canon/Epson L وET…) والطابعات الافتراضية (PDF/XPS/OneNote/فاكس)
 */
const NON_ESCPOS = /cognitive\s*tpg|cognitivetpg|\bstar\b|\btsp\s?\d|\bsp7\d\d|mc-?print|zebra|zdesigner|\btsc\b|godex|dymo|brother|4barcode|\blabel\b|laserjet|deskjet|officejet|designjet|smart\s*tank|\benvy\b|canon|kyocera|ricoh|xerox|lexmark|konica|pantum|samsung\s+(m|c|sl|ml|clx|scx)|epson\s+(l\d|et-|wf-|xp-|stylus|workforce|ecotank)|pdf|xps|onenote|\bfax\b|anydesk|microsoft\s+print/i;
export const escposCompatible = (printer?: string) => !NON_ESCPOS.test(printer || '');

/**
 * طريقة طباعة الإيصال على الطابعة الحرارية:
 *  - auto: ESC/POS المباشر للطابعات الحرارية المعروفة، و«ورق الطابعة» عبر التعريف لمن لا تفهمه (CognitiveTPG)
 *  - escpos: صورة مباشرة للطابعة (بلا فراغ + قص) — حتى لو لم يتعرّف البرنامج على الطابعة
 *  - driver: تعريف ويندوز بصفحة مقاسها عرض الرول × طول الإيصال
 *  - driverPaper: تعريف ويندوز بورقه وهوامشه (الأكثر توافقاً — مثل ورقة ويندوز التجريبية)
 */
export type ReceiptMode = 'auto' | ThermalVia;
export const RECEIPT_MODES: { v: ReceiptMode; label: string; hint: string }[] = [
  { v: 'auto', label: '⚙️ تلقائي', hint: 'ESC/POS المباشر للطابعات الحرارية المعروفة، وتعريف ويندوز (ورق الطابعة) لمن لا تفهمه مثل CognitiveTPG' },
  { v: 'escpos', label: '✂️ مباشر ESC/POS', hint: 'بلا فراغ + قص تلقائي — أغلب الطابعات الحرارية (Xprinter، إبسون، رونقتا، سيويو…)' },
  { v: 'driver', label: '🖨️ تعريف ويندوز — مقاس الإيصال', hint: 'صفحة بعرض الرول وطول الإيصال بالضبط' },
  { v: 'driverPaper', label: '🧩 تعريف ويندوز — ورق الطابعة', hint: 'الأكثر توافقاً (مثل ورقة ويندوز التجريبية): ورق التعريف كما هو والإيصال على عرض منطقة الطباعة فلا يُقص — قد يبقى فراغ بعده حسب طول ورق التعريف' },
];
export const THERMAL_VIA_LABEL: Record<ThermalVia, string> = {
  escpos: 'ESC/POS مباشر',
  driver: 'تعريف ويندوز — مقاس الإيصال',
  driverPaper: 'تعريف ويندوز — ورق الطابعة',
};
/** الطريقة المختارة — الافتراضي «تلقائي» (حتى مع إعداد «إيقاف ESC/POS» القديم: التلقائي يعرف الطابعات التي لا تفهمه) */
export const receiptModeOf = (ps: Pick<PrintSettings, 'receiptMode'> | undefined): ReceiptMode =>
  ps?.receiptMode && (ps.receiptMode === 'auto' || ps.receiptMode in THERMAL_VIA_LABEL) ? ps.receiptMode : 'auto';
/** الطريقة الفعلية لطابعة معينة: ESC/POS يحتاج طباعة صامتة (وإلا تظهر نافذة ويندوز فيطبع عبر التعريف) */
export function resolveThermalMode(mode: ReceiptMode | undefined, printer: string | undefined, rawAllowed: boolean): ThermalVia {
  const m = mode || 'auto';
  if (m === 'driver' || m === 'driverPaper') return m;
  const name = printer || osDefaultPrinter; // بلا طابعة محددة = طابعة ويندوز الافتراضية
  if (rawAllowed && (m === 'escpos' || escposCompatible(name))) return 'escpos';
  // بلا ESC/POS: الطابعات التي لا تفهمه لا تقبل غالباً المقاس المخصص أيضاً → ورق الطابعة
  return escposCompatible(name) ? 'driver' : 'driverPaper';
}
/** بعد فشل طريقة: البديل التالي (ESC/POS → التعريف، المقاس المخصص → ورق الطابعة) */
const nextThermalVia = (via: ThermalVia, printer?: string): ThermalVia | null =>
  via === 'escpos' ? (escposCompatible(printer || osDefaultPrinter) ? 'driver' : 'driverPaper') : via === 'driver' ? 'driverPaper' : null;
const isCancel = (reason?: string) => /cancel/i.test(String(reason || ''));

/** يطبع الصفحة الحالية (الإيصال الظاهر بقواعد @media print). */
export async function printCurrentPage(
  settings: PrintSettings,
  opts: { template: 'thermal80' | 'A4'; deviceName?: string; forceSilent?: boolean }
): Promise<PrintResult> {
  const api = window.ledger;
  if (!api) {
    const cleanup = opts.template === 'A4' ? () => {} : injectThermalPrintCss(measureThermalMm());
    window.print();
    cleanup();
    return { ok: true };
  }
  const deviceName =
    opts.deviceName || (opts.template === 'A4' ? settings.a4Printer || settings.receiptPrinter : settings.receiptPrinter) || undefined;
  if (opts.template === 'A4') {
    const cf = continuousPaper();
    const r = await api.print.page({ silent: settings.silent || !!opts.forceSilent, deviceName, pageSize: cf ? 'CF' : largePaper(), pageSizeMm: cf ? { width: cf.w, height: cf.h } : undefined, copies: settings.copies });
    return r.ok ? r : { ok: false, reason: printReasonAr(r.reason, deviceName) };
  }
  // الإيصال الحراري حسب الطريقة المختارة، ثم البديل التالي عند الفشل (ESC/POS → التعريف → ورق الطابعة)
  const silent = settings.silent || !!opts.forceSilent;
  let via: ThermalVia | null = resolveThermalMode(receiptModeOf(settings), deviceName, silent && !!api.print.escposHtml);
  let firstReason = '';
  let fellBack = false;
  while (via) {
    const r = await printPageVia(via, settings, deviceName, silent);
    if (r.ok) return { ok: true, via, fellBack };
    if (isCancel(r.reason)) return { ok: false, reason: PRINT_CANCELLED };
    firstReason = firstReason || r.reason || '';
    console.warn(`thermal print via ${via} failed:`, r.reason);
    via = nextThermalVia(via, deviceName);
    fellBack = true;
  }
  // فشلت كل الطرق: سبب الطريقة الأولى أوضح (رمز ويندوز مترجم)
  return { ok: false, reason: printReasonAr(firstReason, deviceName) || 'تعذرت الطباعة' };
}

/** طباعة الإيصال الظاهر بطريقة واحدة محددة */
async function printPageVia(via: ThermalVia, settings: PrintSettings, deviceName: string | undefined, silent: boolean): Promise<PrintResult> {
  const api = window.ledger!;
  if (via === 'escpos') {
    if (!api.print.escposHtml) return { ok: false, reason: 'ESC/POS غير متاح' };
    try {
      const html = await receiptRasterHtml();
      if (!html) return { ok: false, reason: 'لا يوجد إيصال للطباعة' };
      const d = thermalDims();
      const r = await api.print.escposHtml({ html, printer: deviceName || '', paper: thermalCfg.paper, dpi: thermalCfg.dpi, widthDots: d.content < 60 ? 384 : 576, cssWidthMm: d.content, offsetMm: d.offset, cut: true, copies: settings.copies });
      return r.ok ? { ok: true } : { ok: false, reason: r.reason || r.detail || 'ESC/POS' };
    } catch (e) { return { ok: false, reason: String((e as Error)?.message || e) }; }
  }
  if (via === 'driverPaper') {
    // ورق الطابعة (صامتة): صورة الإيصال عبر تعريف ويندوز (GDI) بورقه الافتراضي — مثل ورقة ويندوز التجريبية
    if (silent && api.print.gdiHtml) {
      const html = await receiptRasterHtml();
      if (!html) return { ok: false, reason: 'لا يوجد إيصال للطباعة' };
      const d = thermalDims();
      const r = await api.print.gdiHtml({ html, printer: deviceName || '', paper: thermalCfg.paper, cssWidthMm: d.content, offsetMm: d.offset, copies: settings.copies });
      if (r.reason !== 'unavailable') return r.ok ? { ok: true } : { ok: false, reason: r.reason || r.detail || 'GDI' };
    }
    // نافذة الطباعة (أو خارج ويندوز): المتصفح بهوامش منطقة الطباعة والإيصال على عرضها
    const cleanup = injectThermalFitCss();
    try {
      return await api.print.page({ silent, deviceName, pageSize: 'printer', copies: settings.copies });
    } finally { cleanup(); }
  }
  // مقاس الإيصال: عرض الرول × طول المحتوى (وإلا تطبع الطابعة على مقاسها الافتراضي)
  const heightMm = measureThermalMm();
  const cleanup = injectThermalPrintCss(heightMm);
  try {
    return await api.print.page({ silent, deviceName, pageSize: 'thermal', pageSizeMm: { width: thermalDims().page, height: heightMm }, copies: settings.copies });
  } finally { cleanup(); }
}

/** ينسخ الإيصال المعروض كمستند مستقل (بأنماط البرنامج وخطه وصوره) لرسمه وطباعته مباشرة */
async function receiptRasterHtml(): Promise<string | null> {
  const src = document.querySelector('#printable-invoice-body > *') as HTMLElement | null;
  if (!src) return null;
  // ننتظر رمز QR (يُولَّد بعد ظهور الإيصال) حتى 1.5 ثانية
  for (let i = 0; i < 30 && src.querySelector('[data-qr-pending]'); i++) await new Promise((r) => setTimeout(r, 50));
  const clone = src.cloneNode(true) as HTMLElement;
  unsnapClone(clone);
  // الصور (الشعار) داخل المستند نفسه حتى لا تعتمد على مسار البرنامج
  const imgs = Array.from(clone.querySelectorAll('img'));
  await Promise.all(imgs.map(async (img) => {
    const u = img.getAttribute('src') || '';
    if (!u || u.startsWith('data:')) return;
    try {
      const b = await (await fetch(new URL(u, document.baseURI).href)).blob();
      const dataUrl = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(b); });
      img.setAttribute('src', dataUrl);
    } catch { img.remove(); }
  }));
  let css = '';
  for (const ss of Array.from(document.styleSheets)) {
    try { for (const r of Array.from(ss.cssRules)) css += r.cssText + '\n'; } catch { /* ورقة من مصدر آخر */ }
  }
  const { content } = thermalDims();
  const { padR, padL, font } = thermalCfg;
  const z = font / 100;
  const doc = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>${css}</style><style>
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; width: ${content}mm; }
    /* الصورة بعرض منطقة الطباعة بالضبط (72مم = 576 نقطة) + هوامش المستخدم */
    #sl-receipt { width: ${(content / z).toFixed(2)}mm; zoom: ${z}; padding: 0 ${(padR / z).toFixed(2)}mm 0 ${(padL / z).toFixed(2)}mm; box-sizing: border-box; direction: rtl; }
    #sl-receipt > * { width: 100% !important; max-width: none !important; margin: 0 !important; border: 0 !important; box-shadow: none !important; padding: 0 0 1mm !important; }
  </style></head><body><div id="sl-receipt">${clone.outerHTML}</div></body></html>`;
  return withAppFont(doc);
}

/* ---------------- خط البرنامج في المستندات المطبوعة ----------------
 * المستندات (عروض الأسعار، التقارير، فواتير الشراء...) تُطبع في نافذة مخفية لا ترى خطوط البرنامج،
 * فنضمّن خط Tajawal داخل المستند نفسه (data URI) — بلا إنترنت وبلا تثبيت على الجهاز. */
let appFontCache: Promise<string> | null = null;
const toB64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
export function appFontCss(): Promise<string> {
  if (appFontCache) return appFontCache;
  appFontCache = (async () => {
    try {
      let out = '';
      for (const ss of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try { rules = ss.cssRules; } catch { continue; }
        for (const r of Array.from(rules)) {
          if (!(r instanceof CSSFontFaceRule)) continue;
          if (!/tajawal/i.test(r.style.getPropertyValue('font-family'))) continue;
          const weight = (r.style.getPropertyValue('font-weight') || '400').trim();
          if (!['400', '700', '800', '900'].includes(weight)) continue;
          const m = /url\(["']?([^"')]+\.woff2)["']?\)/.exec(r.style.getPropertyValue('src'));
          if (!m) continue;
          const url = new URL(m[1], ss.href || location.href).href;
          const res = await fetch(url);
          if (!res.ok) continue;
          const range = r.style.getPropertyValue('unicode-range');
          out += `@font-face{font-family:Tajawal;font-style:normal;font-display:block;font-weight:${weight};src:url(data:font/woff2;base64,${toB64(await res.arrayBuffer())}) format('woff2');${range ? `unicode-range:${range};` : ''}}`;
        }
      }
      return out;
    } catch { return ''; }
  })();
  return appFontCache;
}
/** يضيف خط البرنامج إلى مستند HTML (يُستخدم قبل الطباعة/PDF/المشاركة) */
export async function withAppFont(html: string): Promise<string> {
  const css = await appFontCss();
  return css && html.includes('</head>') ? html.replace('</head>', `<style>${css}</style></head>`) : html;
}

/** يطبع مستنداً HTML جاهزاً (تذكرة مطبخ، تقرير...) */
export async function printHtmlDocument(
  html: string,
  opts: { silent?: boolean; deviceName?: string; pageSize?: 'A4' | 'A5' | 'CF' | 'thermal' | 'printer'; pageSizeMm?: { width: number; height: number }; copies?: number; landscape?: boolean }
): Promise<PrintResult> {
  const api = window.ledger;
  html = await withAppFont(applyA4Theme(html));
  if (api) return api.print.html({ html, ...opts });
  // المتصفح: نافذة جديدة ثم طباعة
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return { ok: false, reason: 'blocked' };
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* تجاهل */ } }, 300);
  return { ok: true };
}

export async function exportHtmlAsPdf(html: string, defaultName: string, landscape = false): Promise<boolean> {
  const api = window.ledger;
  html = await withAppFont(applyA4Theme(html));
  if (!api) {
    // المتصفح: يفتح نافذة الطباعة ويختار المستخدم "حفظ كـ PDF"
    await printHtmlDocument(html, { pageSize: 'A4', landscape });
    return true;
  }
  const res = await api.print.pdf({ html, defaultName, landscape });
  return !!res.ok;
}

/** يبني مستنداً حرارياً: heightMm = طول الصفحة (مقاس الإيصال)، raster = للإرسال المباشر، fit = لورق الطابعة */
export type ThermalBuild = (heightMm?: number, raster?: boolean, fit?: boolean) => string;
interface ThermalDocOpts {
  deviceName?: string;
  silent: boolean;
  copies: number;
  /** الطريقة المختارة (تلقائي/…) — ثم البديل التالي عند الفشل */
  mode?: ReceiptMode;
  /** طريقة واحدة بعينها بلا بديل (ورقة الاختبار) */
  exact?: ThermalVia;
  /** ESC/POS مسموح (الطباعة صامتة) */
  rawAllowed?: boolean;
  offsetMm?: number;
  minHeightMm?: number;
  fallbackHeightMm?: () => number;
}

/** مستند حراري (HTML) بطريقة واحدة */
async function printThermalDocVia(via: ThermalVia, build: ThermalBuild, o: ThermalDocOpts): Promise<PrintResult> {
  const api = typeof window !== 'undefined' ? window.ledger?.print : undefined;
  if (via === 'escpos') {
    if (!api?.escposHtml) return { ok: false, reason: 'ESC/POS غير متاح' };
    const d = thermalDims();
    const html = await withAppFont(build(undefined, true));
    const r = await api.escposHtml({ html, printer: o.deviceName || '', paper: thermalCfg.paper, dpi: thermalCfg.dpi, widthDots: d.content < 60 ? 384 : 576, cssWidthMm: d.content, offsetMm: o.offsetMm ?? d.offset, cut: true, copies: o.copies });
    return r.ok ? { ok: true } : { ok: false, reason: r.reason || r.detail || 'ESC/POS' };
  }
  if (via === 'driverPaper') {
    // صامتة: صورة المستند عبر تعريف ويندوز (GDI) بورقه الافتراضي؛ وإلا نافذة الطباعة بهوامش منطقة الطباعة
    if (o.silent && api?.gdiHtml) {
      const d = thermalDims();
      const html = await withAppFont(build(undefined, true, true));
      const r = await api.gdiHtml({ html, printer: o.deviceName || '', paper: thermalCfg.paper, cssWidthMm: d.content, offsetMm: o.offsetMm ?? d.offset, copies: o.copies });
      if (r.reason !== 'unavailable') return r.ok ? { ok: true } : { ok: false, reason: r.reason || r.detail || 'GDI' };
    }
    return printHtmlDocument(fitThermalHtml(build(undefined, false, true), o.offsetMm ?? thermalDims().offset), { silent: o.silent, deviceName: o.deviceName || undefined, pageSize: 'printer', copies: o.copies });
  }
  // مرحلتان: قياس طول المحتوى الفعلي ثم توليد الورقة بهذا الطول بالضبط
  const width = thermalDims().page;
  const h = Math.max(o.minHeightMm ?? 60, (await measureHtmlHeightMm(build(), width)) ?? (o.fallbackHeightMm ? o.fallbackHeightMm() : 200));
  return printHtmlDocument(build(h), { silent: o.silent, deviceName: o.deviceName || undefined, pageSize: 'thermal', pageSizeMm: { width, height: h }, copies: o.copies });
}

/** مستند حراري (HTML) بالطريقة المختارة ثم البديل التالي عند الفشل (ESC/POS → التعريف → ورق الطابعة) */
async function printThermalDoc(build: ThermalBuild, o: ThermalDocOpts): Promise<PrintResult> {
  const hasRaw = !!(typeof window !== 'undefined' && window.ledger?.print?.escposHtml);
  let via: ThermalVia | null = o.exact || resolveThermalMode(o.mode, o.deviceName, !!o.rawAllowed && hasRaw);
  let firstReason = '';
  let fellBack = false;
  while (via) {
    const r: PrintResult = await printThermalDocVia(via, build, o).catch((e: unknown) => ({ ok: false, reason: String((e as Error)?.message || e) }));
    if (r.ok) return { ok: true, via, fellBack };
    if (isCancel(r.reason)) return { ok: false, reason: PRINT_CANCELLED, via };
    firstReason = firstReason || r.reason || '';
    console.warn(`thermal document via ${via} failed:`, r.reason);
    if (o.exact) break;
    via = nextThermalVia(via, o.deviceName);
    fellBack = true;
  }
  return { ok: false, reason: printReasonAr(firstReason, o.deviceName) || 'تعذرت الطباعة', via: o.exact };
}

/**
 * طباعة مستند حراري مبني كـ HTML بطول محتواه (عرض السعر على الإيصال…) بطريقة الإيصال المختارة:
 * صامتة → ESC/POS مباشرة (قص تلقائي) ثم التعريف عند الفشل؛ وإلا عبر التعريف.
 * build(heightMm, raster, fit): يبني الـHTML — raster: بعرض منطقة الطباعة بلا إزاحة (للإرسال المباشر)
 */
export async function printThermalHtml(build: ThermalBuild, opts: { deviceName?: string; silent?: boolean; copies?: number; raw?: boolean; mode?: ReceiptMode; exact?: ThermalVia } = {}): Promise<PrintResult> {
  return printThermalDoc(build, {
    deviceName: opts.deviceName, silent: !!opts.silent, copies: clampCopies(opts.copies),
    mode: opts.mode ?? (opts.raw === false ? 'driver' : 'auto'), exact: opts.exact, rawAllowed: !!opts.silent,
  });
}

/* ---------------- ورقة اختبار طابعة الإيصالات ----------------
 * بنفس هندسة الإيصال في كل طريقة + إطار بحدّين أسودين ومسطرة بالمم تبدأ من اليمين:
 * ما يُقص من أي جهة يظهر فوراً وبكم ملّيمتر. */
export interface ThermalTestInfo {
  title: string;
  storeName?: string;
  printer?: string;
  /** رقم الطريقة عند تجربة الطرق كلها */
  index?: number;
  total?: number;
}
export function thermalTestHtml(info: ThermalTestInfo, o: { heightMm?: number; raster?: boolean; fit?: boolean } = {}): string {
  const L = thermalLayout();
  // raster + fit = صورة عبر تعريف ويندوز (GDI)؛ fit وحدها = نافذة الطباعة بورق الطابعة
  const via: ThermalVia = o.fit ? 'driverPaper' : o.raster ? 'escpos' : 'driver';
  const k = (L.font || 100) / 100;
  const fz = (px: number) => `${(px * k).toFixed(1)}px`;
  // هندسة الإيصال: المباشر = منطقة الطباعة فقط؛ مقاس الإيصال = الرول كاملاً + حافة غير قابلة للطباعة لكل جهة؛ ورق الطابعة = هوامش التعريف
  const page = o.raster ? L.content : L.page;
  const edge = o.raster || o.fit ? 0 : (L.page - L.content) / 2;
  const inner = Math.max(20, Math.floor(L.content - L.padR - L.padL));
  const W = inner * 10; // وحدة الرسم = 0.1مم
  let ticks = '';
  for (let i = 0; i <= inner; i++) {
    const x = W - i * 10;
    const len = i % 10 === 0 ? 42 : i % 5 === 0 ? 28 : 16;
    ticks += `<line x1="${x}" y1="0" x2="${x}" y2="${len}" stroke="#000" stroke-width="${i % 10 === 0 ? 4 : 2.5}"/>`;
    if (i % 10 === 0) ticks += `<text x="${i === 0 ? W - 3 : Math.max(3, x)}" y="76" font-size="30" font-weight="700" font-family="Arial, sans-serif" text-anchor="${i === 0 ? 'end' : x < 30 ? 'start' : 'middle'}">${i}</text>`;
  }
  // direction:ltr — داخل مستند rtl تنعكس محاذاة النصوص (start/end) فيختفي رقما الطرفين
  const ruler = `<svg class="sl-ruler" xmlns="http://www.w3.org/2000/svg" width="${inner}mm" height="8mm" viewBox="0 0 ${W} 80" style="display:block;margin-left:auto;max-width:none;direction:ltr">${ticks}<line x1="0" y1="1.5" x2="${W}" y2="1.5" stroke="#000" stroke-width="3"/></svg>`;
  const d = new Date();
  const dpi = thermalCfg.dpi === 'auto' ? 'تلقائي' : thermalCfg.dpi;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>
  @page { size: ${page}mm ${o.heightMm ? `${o.heightMm}mm` : 'auto'}; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html { margin: 0; padding: 0; width: ${page}mm; direction: ltr; }
  body { font-family: Tajawal, Tahoma, Arial, sans-serif; color: #000; direction: rtl; width: ${page}mm; margin: 0; ${!o.raster && L.offset ? `transform: translateX(${L.offset}mm);` : ''} padding: 2mm ${edge + L.padR}mm 3mm ${edge + L.padL}mm; font-size: ${fz(12)}; font-weight: 700; }
  .store { text-align: center; font-size: ${fz(15)}; font-weight: 900; line-height: 1.25; margin-bottom: 2px; }
  .dept { border: 2px solid #000; border-radius: 6px; text-align: center; font-size: ${fz(15)}; font-weight: 900; padding: 3px 4px; margin-bottom: 3px; }
  .num { text-align: center; font-size: ${fz(40)}; font-weight: 900; line-height: 1; margin: 3px 0 1px; }
  .num small { display: block; font-size: ${fz(11)}; font-weight: 800; margin-top: 2px; }
  .r { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; padding: 1px 0; }
  .r b { font-weight: 900; text-align: left; }
  .ltr { direction: ltr; unicode-bidi: isolate; }
  .frame { margin: 3mm 0 1mm; border: 0.6mm solid #000; border-left-width: 2.2mm; border-right-width: 2.2mm; padding: 1.5mm 1mm; text-align: center; font-size: ${fz(12)}; font-weight: 900; }
  .rul { overflow: hidden; }
  .hint { font-size: ${fz(11)}; font-weight: 700; line-height: 1.45; margin-top: 2mm; }
  .sample { margin-top: 2mm; border-top: 1px dashed #000; padding-top: 2mm; text-align: center; font-size: ${fz(13)}; font-weight: 800; line-height: 1.4; }
</style></head><body>
  ${info.storeName ? `<div class="store">${esc(info.storeName)}</div>` : ''}
  <div class="dept">ورقة اختبار — ${esc(info.title)}</div>
  ${info.index ? `<div class="num">${info.index}<small>الطريقة ${info.index} من ${info.total || info.index}</small></div>` : ''}
  <div class="r"><span>الطريقة:</span><b>${THERMAL_VIA_LABEL[via]}</b></div>
  <div class="r"><span>الطابعة:</span><b class="ltr">${esc(info.printer || 'الافتراضية')}</b></div>
  <div class="r"><span>الورق:</span><b>${L.page} مم (منطقة الطباعة ${L.content} مم)</b></div>
  ${via === 'escpos' ? `<div class="r"><span>دقة الرأس:</span><b>${dpi}</b></div>` : ''}
  <div class="r"><span>الهامش يمين / يسار:</span><b>${L.padR} مم / ${L.padL} مم</b></div>
  <div class="frame">إطار كامل بخطين أسودين = المقاس مضبوط</div>
  <div class="rul">${ruler}</div>
  <div class="hint">• المسطرة بالملّيمتر وتبدأ من اليمين (0).<br>• إن لم يظهر الخط الأسود أو الصفر يميناً: زِد «هامش من اليمين» بعدد الملّيمترات الناقصة — وكذلك اليسار.<br>• إن خرجت رموز غير مفهومة: اختر «تعريف ويندوز».</div>
  <div class="sample">أبجد هوز حطي كلمن سعفص قرشت<br><span class="ltr">0123456789 · ABC xyz · 1,234.50</span></div>
  <div class="r" style="margin-top:2mm"><span class="ltr">${d.toLocaleDateString('en-GB')}</span><span class="ltr">${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></div>
</body></html>`;
}

/** ورقة اختبار لطابعة الإيصالات: بالطريقة المختارة (مع البديل) أو بطريقة واحدة بعينها (exact) */
export async function printThermalTest(info: ThermalTestInfo, o: { deviceName?: string; silent: boolean; mode?: ReceiptMode; exact?: ThermalVia }): Promise<PrintResult> {
  return printThermalDoc((h, raster, fit) => thermalTestHtml(info, { heightMm: h, raster, fit }), {
    deviceName: o.deviceName, silent: o.silent, copies: 1, mode: o.mode, exact: o.exact, rawAllowed: o.silent, minHeightMm: 50,
  });
}

/* ---------------- تذكرة المطبخ ---------------- */

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export interface KitchenTicket {
  title: string;               // اسم الطابعة/القسم
  /** اسم المتجر أعلى الورقة */
  storeName?: string;
  invoiceNumber: string;
  orderNumber?: number;
  orderType?: string;
  date: string;
  /** price/total تظهر فقط في «ورقة الطلب بالأسعار» — sub: أسطر صغيرة تحت الصنف (مكوّنات الباقة، ملاحظة الكاشير) */
  items: { name: string; qty: number; price?: number; total?: number; sub?: string[] }[];
  /** الإجمالي المستحق (ورقة الأسعار) */
  total?: number;
  note?: string;
  /** اسم الكاشير (حسب إعداد «اسم الكاشير في الإيصال») */
  cashier?: string;
}

export interface KitchenTicketOptions {
  /** ورقة الطلب بالأسعار بدل ورقة التحضير العادية */
  priced?: boolean;
  /** رسم للطباعة الحرارية المباشرة: الصفحة بعرض منطقة الطباعة فقط (الإزاحة تُطبَّق على الصورة) */
  raster?: boolean;
  /** إزاحة أفقية خاصة بهذه الطابعة (بالمم) — وإلا الإزاحة العامة */
  offsetMm?: number;
  /** هامش يمين/يسار داخل الورقة (مم) — حتى لا تخرج الكتابة عن الحافة */
  padRightMm?: number;
  padLeftMm?: number;
  /** حجم الخط (نسبة مئوية) */
  fontPct?: number;
}

/** ارتفاع تقريبي (احتياطي عند تعذّر القياس الفعلي) */
export function kitchenTicketHeightMm(t: KitchenTicket, o: KitchenTicketOptions = {}): number {
  const narrow = thermalDims().content < 60 ? 1.3 : 1;
  const lines = t.items.reduce((s, i) => s + Math.max(1, Math.ceil(String(i.name || '').length / 22)) + (i.sub?.length || 0) * 0.8, 0);
  return Math.round(Math.min(1500, (44 + (t.orderNumber != null ? 10 : 0) + (t.orderType ? 7 : 0) + (t.cashier ? 5 : 0) + lines * 7 + t.items.length * 2 + (o.priced ? 12 : 0)) * narrow));
}

/** يقيس الطول الفعلي لمستند HTML بعرض الرول (إطار مخفي) — حتى لا تخرج ورقة أطول من المحتوى */
export async function measureHtmlHeightMm(html: string, widthMm: number): Promise<number | null> {
  if (typeof document === 'undefined') return null;
  try {
    const css = await appFontCss();
    const doc = css && html.includes('</head>') ? html.replace('</head>', `<style>${css}</style></head>`) : html;
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = `position:fixed;left:-10000px;top:0;width:${widthMm}mm;height:10px;border:0;visibility:hidden;`; // إطار قصير: الطول المقاس = طول المحتوى فقط
    document.body.appendChild(f);
    const h = await new Promise<number>((resolve) => {
      const done = () => {
        try { const d = f.contentDocument!; void (d as Document & { fonts?: FontFaceSet }).fonts?.ready; resolve(Math.max(d.documentElement.scrollHeight, d.body.scrollHeight)); } catch { resolve(0); }
      };
      f.onload = () => setTimeout(done, 60);
      f.srcdoc = doc;
      setTimeout(done, 1500);
    });
    f.remove();
    if (!h) return null;
    return Math.ceil(h * 25.4 / 96) + 3;
  } catch { return null; }
}

export function kitchenTicketHtml(t: KitchenTicket, o: KitchenTicketOptions = {}, heightMm?: number): string {
  const base = thermalDims();
  const dims = o.raster
    ? { ...base, page: base.content, offset: 0 }
    : { ...base, offset: o.offsetMm != null ? Math.max(-8, Math.min(8, o.offsetMm)) : base.offset };
  const orderTypeAr: Record<string, string> = { dine_in: 'محلي', takeaway: 'سفري', delivery: 'توصيل' };
  const totalQty = t.items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  const pr = clampPad(o.padRightMm), pl = clampPad(o.padLeftMm);
  const k = clampFont(o.fontPct) / 100;
  const fz = (px: number) => `${(px * k).toFixed(1)}px`;
  const money = (n?: number) => (Number.isFinite(n) ? (n as number).toFixed(2) : '');
  const subs = (i: KitchenTicket['items'][number]) => (i.sub || []).map((x) => `<div class="sub">${esc(x)}</div>`).join('');
  const rows = t.items
    .map((i) => o.priced
      ? `<tr><td class="q">${esc(i.qty)}</td><td class="n">${esc(i.name)}${subs(i)}${i.price != null ? `<div class="up">× ${money(i.price)}</div>` : ''}</td><td class="t">${money(i.total)}</td></tr>`
      : `<tr><td class="q">${esc(i.qty)}</td><td class="n">${esc(i.name)}${subs(i)}</td></tr>`)
    .join('');
  const d = new Date(t.date);
  const when = isNaN(d.getTime())
    ? esc(t.date)
    : `<b class="dt">${d.toLocaleDateString('en-GB')}</b> &nbsp; <b class="dt">${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</b>`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>
  /* طول الصفحة صريح (المقاس قبل الطباعة) — «auto» كان يجعل الطابعة تستخدم طولها الافتراضي فتخرج ورقة طويلة */
  @page { size: ${dims.page}mm ${heightMm ? `${heightMm}mm` : 'auto'}; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html { margin: 0; padding: 0; width: ${dims.page}mm; direction: ltr; }
  /* المحتوى بعرض المنطقة القابلة للطباعة ومحاذى لبداية الورقة + إزاحة الضبط */
  body { font-family: Tajawal, Tahoma, Arial, sans-serif; color: #000; direction: rtl; width: ${dims.content}mm; margin: 0 auto 0 ${Math.max(0, dims.offset)}mm; ${dims.offset < 0 ? `transform: translateX(${dims.offset}mm);` : ''} padding: 2mm ${pr}mm 3mm ${pl}mm; }
  /* رأس الورقة: مستطيل أبيض بإطار أسود واسم الطابعة بالأسود */
  .store { text-align: center; font-size: ${fz(15)}; font-weight: 900; line-height: 1.25; margin-bottom: 3px; }
  .dept { background: #fff; color: #000; border: 2px solid #000; text-align: center; font-size: ${fz(17)}; font-weight: 900; padding: 3px 4px; border-radius: 6px; }
  .order { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 5px 0 2px; }
  .order .lbl { font-size: ${fz(11)}; font-weight: 700; text-align: center; }
  .order .num { font-size: ${fz(30)}; font-weight: 900; line-height: 1; text-align: center; }
  .type { border: 2px solid #000; border-radius: 30px; padding: 1px 12px; font-size: ${fz(15)}; font-weight: 900; }
  .meta { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; flex-wrap: wrap; font-size: ${fz(12.5)}; font-weight: 700; margin: 5px 0 3px; padding-bottom: 4px; border-bottom: 2px solid #000; }
  .meta .dt { font-size: ${fz(14)}; font-weight: 900; }
  .meta .cashier { flex-basis: 100%; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { font-size: ${fz(11.5)}; text-align: right; padding: 2px; border-bottom: 1.5px solid #000; white-space: nowrap; overflow: hidden; }
  td { padding: 4px 2px; border-bottom: 1px dashed #000; vertical-align: top; }
  td.q { text-align: center; font-size: ${fz(19)}; font-weight: 900; }
  td.n { font-size: ${fz(o.priced ? 15 : 17)}; font-weight: 800; line-height: 1.25; word-break: break-word; }
  td.t { text-align: left; font-size: ${fz(14)}; font-weight: 800; direction: ltr; white-space: nowrap; }
  .up { font-size: ${fz(11)}; font-weight: 700; direction: ltr; text-align: right; }
  .sub { font-size: ${fz(o.priced ? 12 : 13.5)}; font-weight: 700; line-height: 1.25; padding-right: 2mm; }
  .sum { display: flex; justify-content: space-between; gap: 4px; flex-wrap: wrap; font-size: ${fz(13)}; font-weight: 900; margin-top: 4px; padding-top: 3px; border-top: 2px solid #000; }
  .grand { display: flex; justify-content: space-between; font-size: ${fz(18)}; font-weight: 900; margin-top: 3px; padding: 3px 0; border-top: 2px solid #000; border-bottom: 2px solid #000; }
  .note { margin-top: 4px; border: 1.5px dashed #000; padding: 3px; font-size: ${fz(13)}; font-weight: 800; }
</style></head><body>
  ${t.storeName ? `<div class="store">${esc(t.storeName)}</div>` : ''}
  <div class="dept">${esc(t.title)}</div>
  ${t.orderNumber != null || t.orderType ? `<div class="order">
    ${t.orderNumber != null ? `<div><div class="lbl">رقم الطلب</div><div class="num">${esc(t.orderNumber)}</div></div>` : ''}
    ${t.orderType ? `<div class="type">${esc(orderTypeAr[t.orderType] || t.orderType)}</div>` : ''}
  </div>` : ''}
  <div class="meta"><span>فاتورة: <b>${esc(t.invoiceNumber)}</b></span><span>${when}</span>${t.cashier ? `<span class="cashier">الكاشير: <b>${esc(t.cashier)}</b></span>` : ''}</div>
  <table><thead><tr><th style="text-align:center;width:${(11 * Math.max(1, k)).toFixed(1)}mm">الكمية</th><th>الصنف</th>${o.priced ? `<th style="text-align:left;width:${(17 * Math.max(1, k)).toFixed(1)}mm">المجموع</th>` : ''}</tr></thead><tbody>${rows}</tbody></table>
  <div class="sum"><span>عدد الأصناف: ${t.items.length}</span><span>إجمالي الكمية: ${esc(totalQty)}</span></div>
  ${o.priced && t.total != null ? `<div class="grand"><span>الإجمالي</span><span dir="ltr">${money(t.total)}</span></div>` : ''}
  ${t.note ? `<div class="note">ملاحظة: ${esc(t.note)}</div>` : ''}
</body></html>`;
}

/**
 * طباعة تذكرة مطبخ بطول محتواها الفعلي.
 * الافتراضي: طباعة حرارية مباشرة (ESC/POS) — الورقة بطول المحتوى بالضبط مع قص تلقائي مهما كان تعريف الطابعة.
 * إن فشلت (طابعة غير حرارية/لا تفهم ESC/POS) أو طُلبت نافذة ويندوز: الطباعة عبر التعريف ثم «ورق الطابعة».
 */
export async function printKitchenTicket(t: KitchenTicket, opts: KitchenTicketOptions & { deviceName?: string; silent?: boolean; raw?: boolean; copies?: number; mode?: ReceiptMode; exact?: ThermalVia }): Promise<PrintResult> {
  return printThermalDoc(
    (h, raster) => (raster ? kitchenTicketHtml(t, { ...opts, raster: true }) : kitchenTicketHtml(t, opts, h)),
    {
      deviceName: opts.deviceName, silent: opts.silent !== false, copies: clampCopies(opts.copies),
      mode: opts.mode ?? (opts.raw === false ? 'driver' : 'auto'), exact: opts.exact, rawAllowed: opts.silent !== false,
      offsetMm: opts.offsetMm, minHeightMm: 40, fallbackHeightMm: () => kitchenTicketHeightMm(t, opts),
    },
  );
}
