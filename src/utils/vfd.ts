/**
 * شاشة العميل التسلسلية (VFD / Pole Display): سطران × 20 حرفاً على منفذ COM.
 * هذه الشاشات شرائح محارف لا تعرض العربية غالباً، فنكتب عليها بالأرقام
 * وبكلمات لاتينية قصيرة — وهي ما يهمّ العميل: السعر والإجمالي والباقي.
 */
export interface VfdSettings {
  enabled: boolean;
  port: string;
  baud: number;
  dataBits: 7 | 8;
  parity: 'None' | 'Even' | 'Odd';
  /** بروتوكول الكتابة: CD5220 هو الأشيع، وESC/POS لشاشات Epson، وraw للبسيطة */
  protocol: 'cd5220' | 'escpos' | 'raw';
  /** عدد أعمدة السطر (غالباً 20) */
  columns: number;
  /** رسالة السكون (لاتينية) */
  idleText: string;
}

export const DEFAULT_VFD_SETTINGS: VfdSettings = {
  enabled: false,
  port: 'COM2',
  baud: 9600,
  dataBits: 8,
  parity: 'None',
  protocol: 'cd5220',
  columns: 20,
  idleText: 'WELCOME',
};

const CLR = 0x0c; // مسح الشاشة
const CR = 0x0d;
const LF = 0x0a;

/** حروف لاتينية وأرقام فقط — ما عداها يُستبدل بمسافة حتى لا تظهر رموز غريبة */
const ascii = (s: string) => String(s || '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();

const pad = (s: string, n: number) => ascii(s).slice(0, n).padEnd(n, ' ');
/** قصّ/تمديد سطر جاهز دون المساس بمسافاته (حتى لا تنهار المحاذاة) */
const fit = (s: string, n: number) => String(s).slice(0, n).padEnd(n, ' ');

/** سطر: نص يساراً ومبلغ يميناً داخل عدد الأعمدة */
export function vfdLine(left: string, right: string, columns: number): string {
  const r = ascii(right);
  const l = pad(left, Math.max(0, columns - r.length - (r ? 1 : 0)));
  return (l + (r ? ' ' + r : '')).slice(0, columns);
}

const bytes = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** يبني البايتات المرسلة للشاشة حسب بروتوكولها */
export function vfdFrame(line1: string, line2: string, s: VfdSettings): number[] {
  const a = fit(line1, s.columns);
  const b = fit(line2, s.columns);
  if (s.protocol === 'cd5220') {
    // ESC Q A <text> CR = السطر الأعلى، ESC Q B = السطر الأسفل
    return [0x1b, 0x51, 0x41, ...bytes(a), CR, 0x1b, 0x51, 0x42, ...bytes(b), CR];
  }
  if (s.protocol === 'escpos') {
    // US $ col row لتحديد موضع المؤشر ثم الكتابة
    return [CLR, 0x1f, 0x24, 0x01, 0x01, ...bytes(a), 0x1f, 0x24, 0x01, 0x02, ...bytes(b)];
  }
  return [CLR, ...bytes(a), CR, LF, ...bytes(b)];
}

export interface VfdState {
  /** آخر صنف أُضيف (الاسم اللاتيني إن وُجد) وسعره */
  lastItem?: { name: string; total: number } | null;
  total: number;
  count: number;
  /** عند الدفع: المدفوع والباقي */
  paid?: { total: number; paid: number; change: number } | null;
}

const money = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2);

/** السطران المعروضان حسب حالة البيع */
export function vfdLines(st: VfdState, s: VfdSettings): [string, string] {
  if (st.paid) {
    return [
      vfdLine('PAID', money(st.paid.paid), s.columns),
      vfdLine('CHANGE', money(st.paid.change), s.columns),
    ];
  }
  if (!st.count) return [pad(s.idleText || 'WELCOME', s.columns), vfdLine('TOTAL', money(0), s.columns)];
  const it = st.lastItem;
  // اسم بلا حروف لاتينية (عربي فقط) يصير ITEM حتى لا يظهر السطر فارغاً
  const nm = it ? (ascii(it.name) || 'ITEM') : '';
  return [
    it ? vfdLine(nm, money(it.total), s.columns) : vfdLine(`ITEMS ${st.count}`, '', s.columns),
    vfdLine('TOTAL', money(st.total), s.columns),
  ];
}
