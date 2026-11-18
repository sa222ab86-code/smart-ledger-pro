/**
 * مولّد باركود بلا مكتبات خارجية:
 *  - EAN-13 (للأكواد المكوّنة من 13 رقماً وبرقم تحقق صحيح)
 *  - Code 128 لأي نص ASCII آخر (مع التحويل التلقائي للمجموعة C للأرقام المتتالية)
 * المخرجات SVG جاهز للطباعة.
 */

/* --------------------------- Code 128 --------------------------- */
// عرض (شريط، فراغ، شريط، فراغ، شريط، فراغ) لكل رمز 0..105، ثم نمط الإيقاف
const C128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232',
];
const C128_STOP = '2331112';
const START_B = 104;
const START_C = 105;
const CODE_C = 99;

export const C128_TABLE_FOR_TESTS = C128_PATTERNS;

function code128Values(text: string): number[] | null {
  if (!text) return null;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) return null; // خارج ASCII (مثل العربية) لا يُرمَّز
  }
  const values: number[] = [];
  const allDigits = /^\d+$/.test(text);

  if (allDigits && text.length >= 4) {
    // المجموعة C: كل رقمين برمز واحد (أصغر وأدق). الطول الفردي: أول رقم في B ثم نبدّل إلى C
    if (text.length % 2 === 0) {
      values.push(START_C);
      for (let i = 0; i < text.length; i += 2) values.push(parseInt(text.slice(i, i + 2), 10));
    } else {
      values.push(START_B, text.charCodeAt(0) - 32, CODE_C);
      for (let i = 1; i < text.length; i += 2) values.push(parseInt(text.slice(i, i + 2), 10));
    }
  } else {
    // نص ينتهي بأرقام (مثل INV-00012): البادئة في B ثم الأرقام أزواجاً في C → باركود أقصر وخطوط أعرض
    const tail = (/\d+$/.exec(text)?.[0].length) || 0;
    const cRun = tail >= 4 ? tail - (tail % 2) : 0;
    const head = text.slice(0, text.length - cRun);
    values.push(START_B);
    for (const ch of head) values.push(ch.charCodeAt(0) - 32);
    if (cRun) {
      values.push(CODE_C);
      for (let i = text.length - cRun; i < text.length; i += 2) values.push(parseInt(text.slice(i, i + 2), 10));
    }
  }
  let sum = values[0];
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103);
  return values;
}

function patternToBits(pattern: string): string {
  let bits = '';
  let bar = true;
  for (const d of pattern) {
    bits += (bar ? '1' : '0').repeat(Number(d));
    bar = !bar;
  }
  return bits;
}

export function code128Bits(text: string): string | null {
  const values = code128Values(text);
  if (!values) return null;
  return values.map((v) => patternToBits(C128_PATTERNS[v])).join('') + patternToBits(C128_STOP);
}

/* ---------------------------- EAN-13 ---------------------------- */
const EAN_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const EAN_G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const EAN_R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
const EAN_PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

export const EAN_TABLES_FOR_TESTS = { EAN_L, EAN_G, EAN_R, EAN_PARITY };

export function ean13Check(d12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13Check(code.slice(0, 12)) === Number(code[12]);
}

/** رقم تحقق EAN-8 / UPC-A (نفس طريقة الأوزان 3 و1 من اليمين) */
function gtinCheckOk(code: string): boolean {
  const d = code.split('').map(Number);
  const check = d.pop()!;
  let sum = 0;
  for (let i = d.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += d[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * حالة باركود الصنف للفلترة: 'none' بلا باركود، 'invalid' تنسيق غير صالح
 * (حروف غير لاتينية/مسافات لا تُطبع، أو رقم بطول 8/12/13 برقم تحقق خطأ — لن يقرأه الماسح كـ EAN/UPC)، وإلا null
 */
export function barcodeIssue(value?: string | null): 'none' | 'invalid' | null {
  const v = String(value ?? '');
  if (!v.trim()) return 'none';
  if (v !== v.trim() || /\s/.test(v)) return 'invalid';
  if (/^\d+$/.test(v) && (v.length === 8 || v.length === 12 || v.length === 13) && !gtinCheckOk(v)) return 'invalid';
  if (!code128Bits(v)) return 'invalid';
  return null;
}

export function ean13Bits(code: string): string | null {
  if (!isValidEan13(code)) return null;
  const parity = EAN_PARITY[Number(code[0])];
  let bits = '101';
  for (let i = 0; i < 6; i++) {
    const d = Number(code[i + 1]);
    bits += parity[i] === 'L' ? EAN_L[d] : EAN_G[d];
  }
  bits += '01010';
  for (let i = 7; i < 13; i++) bits += EAN_R[Number(code[i])];
  return bits + '101';
}

/* ------------------------------ SVG ------------------------------ */
export type BarcodeKind = 'ean13' | 'code128';

export function encodeBarcode(value: string): { kind: BarcodeKind; bits: string } | null {
  const v = (value || '').trim();
  const ean = ean13Bits(v);
  if (ean) return { kind: 'ean13', bits: ean };
  const c = code128Bits(v);
  return c ? { kind: 'code128', bits: c } : null;
}

function bitsToSvg(bits: string, quiet: number, attrs = ''): string {
  const total = bits.length + quiet * 2;
  let d = '';
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let j = i;
      while (j < bits.length && bits[j] === '1') j++;
      d += `M${i + quiet} 0h${j - i}v1h-${j - i}z`;
      i = j;
    } else i++;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg"${attrs} viewBox="0 0 ${total} 1" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${total}" height="1" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** يعيد SVG يملأ الحاوية (preserveAspectRatio=none) أو null إن تعذّر الترميز */
export function barcodeSvg(value: string, quiet = 10): string | null {
  const enc = encodeBarcode(value);
  if (!enc) return null;
  return bitsToSvg(enc.bits, quiet);
}

/**
 * باركود رقم المستند (Code128) للفواتير والإيصالات وعروض الأسعار والمرتجعات — HTML جاهز.
 * data-bc-modules: عند الطباعة الحرارية المباشرة يُضبط العرض ليكون كل خط عدداً صحيحاً من نقاط الطابعة (قراءة أدق).
 * يعيد '' إن تعذّر الترميز (مثل رقم بحروف عربية).
 */
export function docBarcodeHtml(value: string, o: { heightMm?: number; moduleMm?: number; text?: boolean; maxWidthMm?: number } = {}): string {
  const v = String(value || '').trim();
  const bits = code128Bits(v);
  if (!bits) return '';
  const quiet = 10;
  const modules = bits.length + quiet * 2;
  // maxWidthMm: يُضيَّق عرض الخط (لا يُقص) حتى لا يخرج الرقم الطويل عن عرض الإيصال
  const mod = Math.min(o.moduleMm ?? 0.33, o.maxWidthMm ? o.maxWidthMm / modules : Infinity);
  const w = modules * mod;
  const h = o.heightMm ?? 15;
  const svg = bitsToSvg(bits, quiet, ' width="100%" height="100%" style="display:block"');
  return `<div class="doc-barcode" data-testid="doc-barcode" style="display:inline-block;max-width:100%;text-align:center;line-height:1;vertical-align:top">`
    + `<div data-bc-modules="${modules}" style="width:${w.toFixed(2)}mm;max-width:100%;height:${h}mm;margin:0 auto">${svg}</div>`
    + (o.text !== false ? `<div style="font:700 10px/1.35 Consolas,'Courier New',monospace;direction:ltr;letter-spacing:1px;margin-top:1px;color:#000">${esc(v)}</div>` : '')
    + `</div>`;
}

/** باركود داخلي جديد (EAN-13 بالبادئة 200) لا يتكرر مع الموجود */
export function generateInternalEan13(existing: Iterable<string>): string {
  let max = 0;
  for (const c of existing) {
    if (/^200\d{10}$/.test(c || '')) max = Math.max(max, parseInt(c.slice(3, 12), 10));
  }
  const body = `200${String(max + 1).padStart(9, '0')}`;
  return body + ean13Check(body);
}

/* ------------------------- ملصقات الطباعة ------------------------- */
export interface LabelItem { name: string; barcode: string; price?: number }
export interface LabelOptions {
  /** معاينة على الشاشة فقط: خطوط بعدد صحيح من البكسلات (تكبير الإطار × كثافة الشاشة) */
  screenSnap?: { scale: number; dpr: number };
  widthMm: number;
  heightMm: number;
  showName: boolean;
  showPrice: boolean;
  showCompany: boolean;
  company?: string;
  /** رمز العملة: الرمز الرسمي للريال / نص (ر.س، SAR) / بدون */
  currencyMode?: 'riyal' | 'text' | 'none';
  currency?: string;
  /** عبارة تحت السعر مثل «شامل الضريبة» (فارغة = لا تظهر) */
  taxNote?: string;
  showBarcodeText?: boolean;
  /** ارتفاع خطوط الباركود بالمم (0 = تلقائي: يملأ المساحة المتبقية) */
  barHeightMm?: number;
  /** سماكة أنحف خط في الباركود بالمم (0 = تلقائي: يملأ عرض الملصق) */
  moduleMm?: number;
  /** أحجام الخطوط بالنقطة (0 = تلقائي حسب المقاس) */
  nameFontPt?: number;
  priceFontPt?: number;
  codeFontPt?: number;
  companyFontPt?: number;
  boldName?: boolean;
  /** rotate: تدوير المحتوى 90° على صفحة بالأبعاد المعكوسة (لطابعات تطبع الملصق طولياً) */
  orientation?: 'normal' | 'landscape' | 'rotate' | 'rotate270';
}

/** الرمز الرسمي للريال السعودي (SVG) — يأخذ لون وحجم النص */
export const RIYAL_SVG =
  '<svg class="sar" viewBox="0 0 1124.14 1256.39" fill="currentColor" aria-label="ر.س"><path d="M699.62,1113.02h0c-20.06,44.48-33.32,92.75-38.4,143.37l424.51-90.24c20.06-44.47,33.31-92.75,38.4-143.37l-424.51,90.24Z"/><path d="M1085.73,895.8c20.06-44.47,33.32-92.75,38.4-143.37l-330.68,70.33v-135.2l292.27-62.11c20.06-44.47,33.32-92.75,38.4-143.37l-330.68,70.27V66.13c-50.67,28.45-95.67,66.32-132.25,110.99v403.35l-132.25,28.11V0c-50.67,28.44-95.67,66.32-132.25,110.99v525.69l-295.91,62.88c-20.06,44.47-33.33,92.75-38.42,143.37l334.33-71.05v170.26l-358.3,76.14c-20.06,44.47-33.32,92.75-38.4,143.37l375.04-79.7c30.53-6.35,56.77-24.4,73.83-49.24l68.78-101.97v-.02c7.14-10.55,11.3-23.27,11.3-36.97v-149.98l132.25-28.11v270.4l424.53-90.28Z"/></svg>';

const QUIET = 10;
/** عدد الوحدات (الخطوط والفراغات) في الباركود مع الهامش — لحساب العرض عند تحديد سماكة الخط */
export function barcodeModules(value: string): number {
  const enc = encodeBarcode(value);
  return enc ? enc.bits.length + QUIET * 2 : 0;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function labelsHtml(labels: LabelItem[], o: LabelOptions): string {
  const auto = Math.max(6.5, Math.min(11, o.heightMm * 0.26));
  const pick = (v: number | undefined, fallback: number) => (v && v > 0 ? v : fallback);
  const fsName = pick(o.nameFontPt, auto);
  const fsPrice = pick(o.priceFontPt, auto * 1.35);
  const fsCode = pick(o.codeFontPt, auto * 0.9);
  const fsCo = pick(o.companyFontPt, auto * 0.8);
  const barH = o.barHeightMm && o.barHeightMm > 0 ? o.barHeightMm : 0;
  const mod = o.moduleMm && o.moduleMm > 0 ? o.moduleMm : 0;
  const mode = o.currencyMode || 'text';
  const cur = mode === 'riyal' ? RIYAL_SVG : mode === 'text' && o.currency ? `<span class="cur">${esc(o.currency)}</span>` : '';
  const body = labels
    .map((l) => {
      const svg = barcodeSvg(l.barcode, QUIET);
      if (!svg) return '';
      let w = mod ? `style="width:${(barcodeModules(l.barcode) * mod).toFixed(2)}mm"` : '';
      if (o.screenSnap) {
        const m = barcodeModules(l.barcode);
        const naturalPx = (mod ? m * mod : Math.max(1, o.widthMm - 3)) * (96 / 25.4);
        const f = Math.max(0.1, o.screenSnap.scale * o.screenSnap.dpr);
        const k = Math.max(1, Math.floor((naturalPx * f) / m));
        w = `style="width:${((k * m) / f).toFixed(3)}px;max-width:none"`;
      }
      return `<div class="l">
  ${o.showCompany && o.company ? `<div class="co">${esc(o.company)}</div>` : ''}
  ${o.showName ? `<div class="nm">${esc(l.name)}</div>` : ''}
  <div class="bc"><div class="bw" ${w}>${svg}</div></div>
  ${o.showBarcodeText !== false ? `<div class="tx">${esc(l.barcode)}</div>` : ''}
  ${o.showPrice && l.price !== undefined ? `<div class="pr"><span dir="ltr">${esc(l.price.toFixed(2))}</span>${cur}</div>` : ''}
  ${o.showPrice && o.taxNote ? `<div class="tn">${esc(o.taxNote)}</div>` : ''}
</div>`;
    })
    .filter(Boolean);
  const rot = o.orientation === 'rotate' || o.orientation === 'rotate270';
  const rotTf = o.orientation === 'rotate270' ? `translateY(${o.widthMm}mm) rotate(-90deg)` : `translateX(${o.heightMm}mm) rotate(90deg)`;
  const pages = rot ? body.map((l) => `<div class="pg">${l}</div>`).join('') : body.join('');
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>ملصقات الباركود</title>
<style>
  @page { size: ${rot ? `${o.heightMm}mm ${o.widthMm}mm` : `${o.widthMm}mm ${o.heightMm}mm`}; margin: 0; }
  .pg { position: relative; width: ${o.heightMm}mm; height: ${o.widthMm}mm; overflow: hidden; page-break-after: always; break-after: page; }
  .pg:last-child { page-break-after: auto; break-after: auto; }
  .pg .l { position: absolute; top: 0; left: 0; transform-origin: top left; transform: ${rotTf}; page-break-after: auto; break-after: auto; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .l { width: ${o.widthMm}mm; height: ${o.heightMm}mm; padding: 1mm 1.5mm; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; page-break-after: always; break-after: page; font-family: Tajawal, Tahoma, Arial, sans-serif; text-align: center; color: #000; -webkit-font-smoothing: none; }
  .l:last-child { page-break-after: auto; break-after: auto; }
  .co { font-size: ${fsCo.toFixed(1)}pt; font-weight: 700; line-height: 1; }
  .nm { font-size: ${fsName.toFixed(1)}pt; font-weight: ${o.boldName === false ? 500 : 800}; line-height: 1.1; max-height: 2.3em; overflow: hidden; width: 100%; }
  .bc { ${barH ? `flex: none; height: ${barH}mm;` : 'flex: 1; min-height: 0;'} width: 100%; margin: 0.6mm 0; display: flex; justify-content: center; }
  .bw { width: 100%; max-width: 100%; height: 100%; }
  .bc svg { width: 100%; height: 100%; display: block; }
  /* رقم الباركود: بخط البرنامج وعريض وأسود صريح (الخط الرفيع كان يطبع باهتاً) */
  .tx { font-family: Tajawal, Tahoma, Arial, sans-serif; font-size: ${fsCode.toFixed(1)}pt; font-weight: 800; color: #000; letter-spacing: 1px; line-height: 1; direction: ltr; font-variant-numeric: tabular-nums; }
  .pr { font-size: ${fsPrice.toFixed(1)}pt; font-weight: 900; line-height: 1.1; display: inline-flex; align-items: center; gap: 0.25em; }
  .pr .sar { height: 0.8em; width: auto; display: inline-block; }
  .pr .cur { font-size: 0.7em; }
  .tn { font-size: ${Math.max(5.5, fsPrice * 0.45).toFixed(1)}pt; font-weight: 700; line-height: 1; }
</style></head><body>${pages}</body></html>`;
}
