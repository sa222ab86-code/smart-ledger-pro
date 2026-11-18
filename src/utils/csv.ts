/** أدوات CSV صغيرة بلا أي مكتبة خارجية (تدعم العربية، والفاصلة/الفاصلة المنقوطة/التبويب) */

export type Cell = string | number | boolean | null | undefined;

function escapeCell(v: Cell, delimiter: string): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? String(v) : String(v);
  // حماية من حقن الصيغ عند فتح الملف في Excel (=، +، @ في بداية نص)
  if (typeof v === 'string' && /^[=+@\t\r]/.test(s)) s = `'${s}`;
  if (s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes(delimiter)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: Cell[][], delimiter = ','): string {
  return rows.map((r) => r.map((c) => escapeCell(c, delimiter)).join(delimiter)).join('\r\n');
}

/** يقرأ نصاً بصيغة CSV ويعيد مصفوفة صفوف. يكتشف الفاصل تلقائياً من السطر الأول. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  const delimiter = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ',') as string;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  // تجاهل الأسطر الفارغة تماماً
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** يفك ترميز ملف: UTF-8 أولاً، وإن لم يصلح فـ windows-1256 (ملفات Excel العربية القديمة) */
export function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1256').decode(buf);
  }
}

/** تحويل أرقام عربية/فارسية ورموز عشرية عربية إلى رقم عادي */
export function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = String(raw).trim();
  if (s === '') return null;
  s = s
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/[٬\s]/g, '')
    .replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null; // لا أرقام إطلاقاً (مثل "abc") ← غير صالح وليس صفراً
  // 1.234,56 أو 1,234.56 أو 12,5
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
