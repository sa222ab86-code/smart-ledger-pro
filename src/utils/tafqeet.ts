/**
 * التفقيط: كتابة المبلغ بالحروف العربية
 *   tafqeet(1250.5) → "فقط ألف ومائتان وخمسون ريالاً وخمسون هللة لا غير"
 */

const ONES_M = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة'];
const ONES_F = ['', 'واحدة', 'اثنتان', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثمان', 'تسع', 'عشر'];
const TENS = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

/** 0..99 — fem: المعدود مؤنث (هللة) */
function under100(n: number, fem: boolean): string {
  if (n === 0) return '';
  if (n <= 10) {
    if (n === 10) return fem ? 'عشر' : 'عشرة';
    return (fem ? ONES_F : ONES_M)[n];
  }
  if (n < 20) {
    const u = n - 10;
    if (u === 1) return fem ? 'إحدى عشرة' : 'أحد عشر';
    if (u === 2) return fem ? 'اثنتا عشرة' : 'اثنا عشر';
    return `${(fem ? ONES_F : ONES_M)[u]} ${fem ? 'عشرة' : 'عشر'}`;
  }
  const t = Math.floor(n / 10), u = n % 10;
  if (!u) return TENS[t];
  return `${(fem ? ONES_F : ONES_M)[u]} و${TENS[t]}`;
}

/** 0..999 */
function under1000(n: number, fem: boolean): string {
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (r) parts.push(under100(r, fem));
  return parts.join(' و');
}

/** وحدة المرتبة (ألف/مليون/مليار) حسب العدد */
function scaleWord(n: number, one: string, two: string, plural: string, acc: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  const r = n % 100;
  if (n < 100 && n >= 3 && n <= 10) return `${under1000(n, false)} ${plural}`;
  if (r >= 3 && r <= 10) return `${under1000(n, false)} ${plural}`;
  if (r >= 11) return `${under1000(n, false)} ${acc}`;
  return `${under1000(n, false).replace(/مائتان$/, 'مائتا')} ${one}`; // مائة ألف، مائتا ألف، مائة واثنان ألف
}

/** العدد الصحيح بالحروف (حتى 999 مليار) */
export function numberToArabicWords(n: number, fem = false): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'صفر';
  const billions = Math.floor(n / 1e9), millions = Math.floor((n % 1e9) / 1e6), thousands = Math.floor((n % 1e6) / 1e3), rest = n % 1000;
  const parts: string[] = [];
  if (billions) parts.push(scaleWord(billions, 'مليار', 'ملياران', 'مليارات', 'ملياراً'));
  if (millions) parts.push(scaleWord(millions, 'مليون', 'مليونان', 'ملايين', 'مليوناً'));
  if (thousands) parts.push(scaleWord(thousands, 'ألف', 'ألفان', 'آلاف', 'ألفاً'));
  if (rest) parts.push(under1000(rest, fem));
  return parts.join(' و');
}

/** صيغة المعدود بعد العدد (ريال/ريالان/ريالات/ريالاً) */
function countedNoun(n: number, f: { one: string; two: string; plural: string; acc: string }, numberWords: string): string {
  if (n === 1) return `${f.one} ${numberWords}`;     // ريال واحد
  if (n === 2) return f.two;                          // ريالان
  const r = n % 100;
  if (r >= 3 && r <= 10) return `${numberWords} ${f.plural}`;
  if (r >= 11 && r <= 99) return `${numberWords} ${f.acc}`;
  // المعدود مضاف مباشرة إلى المرتبة: مائتا ريال، ألفا ريال، أحد عشر ألف ريال
  const w = numberWords
    .replace(/(مائت|ألف|مليون|مليار)ان$/, '$1ا')
    .replace(/(ألف|مليون|مليار)اً$/, '$1');
  return `${w} ${f.one}`;                             // مائة ريال، ألف ريال
}

const CURRENCIES: Record<string, { main: { one: string; two: string; plural: string; acc: string }; sub: { one: string; two: string; plural: string; acc: string }; subFem: boolean }> = {
  SAR: { main: { one: 'ريال', two: 'ريالان', plural: 'ريالات', acc: 'ريالاً' }, sub: { one: 'هللة', two: 'هللتان', plural: 'هللات', acc: 'هللة' }, subFem: true },
};

/** التفقيط الكامل للمبلغ: "فقط ... ريالاً و... هللة لا غير" */
export function tafqeet(amount: number, currency = 'SAR'): string {
  // عملة بلا صيغ تفقيط معرّفة (أساسية غير الريال): لا تفقيط بدل كتابة «ريال» خطأً
  const cur = CURRENCIES[currency];
  if (!cur) return '';
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(cents / 100), frac = cents % 100;
  const parts: string[] = [];
  if (whole > 0) parts.push(countedNoun(whole, cur.main, numberToArabicWords(whole)));
  if (frac > 0) parts.push(countedNoun(frac, cur.sub, numberToArabicWords(frac, cur.subFem)));
  if (!parts.length) return `فقط صفر ${cur.main.one} لا غير`;
  return `فقط ${parts.join(' و')} لا غير`;
}

/* ---------------- المبلغ كتابةً بالإنجليزية (للفواتير ثنائية اللغة) ---------------- */
const EN_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function enBelow1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${EN_ONES[h]} Hundred`);
  if (r) parts.push(r < 20 ? EN_ONES[r] : `${EN_TENS[Math.floor(r / 10)]}${r % 10 ? `-${EN_ONES[r % 10]}` : ''}`);
  return parts.join(' ');
}
export function numberToEnglishWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'Zero';
  const scales: [number, string][] = [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
  const parts: string[] = [];
  for (const [v, name] of scales) {
    if (n >= v) { parts.push(`${enBelow1000(Math.floor(n / v))} ${name}`); n %= v; }
  }
  if (n) parts.push(enBelow1000(n));
  return parts.join(' ');
}
const EN_CURRENCIES: Record<string, { one: string; many: string; subOne: string; subMany: string }> = {
  SAR: { one: 'Saudi Riyal', many: 'Saudi Riyals', subOne: 'Halala', subMany: 'Halalas' },
};
/** «Only Five Hundred Forty-Five Saudi Riyals and Fifty Halalas» — عملة غير معرّفة: نص فارغ */
export function amountInWordsEn(amount: number, currency = 'SAR'): string {
  const cur = EN_CURRENCIES[currency];
  if (!cur) return '';
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(cents / 100), frac = cents % 100;
  const parts: string[] = [];
  if (whole > 0 || frac === 0) parts.push(`${numberToEnglishWords(whole)} ${whole === 1 ? cur.one : cur.many}`);
  if (frac > 0) parts.push(`${numberToEnglishWords(frac)} ${frac === 1 ? cur.subOne : cur.subMany}`);
  return `Only ${parts.join(' and ')}`;
}
