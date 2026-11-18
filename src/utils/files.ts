import { decodeText } from './csv';

/** يحفظ نصاً كملف: نافذة "حفظ باسم" في Electron، أو تنزيل عادي في المتصفح. */
export async function saveTextFile(
  defaultName: string,
  content: string,
  type: 'csv' | 'json' = 'csv'
): Promise<boolean> {
  // BOM كي يفتح Excel الملف بالعربية صحيحاً
  const body = type === 'csv' ? `\uFEFF${content}` : content;
  const api = window.ledger;
  if (api) {
    const res = await api.files.saveText({
      defaultName,
      content: body,
      filters: [type === 'csv' ? { name: 'CSV', extensions: ['csv'] } : { name: 'JSON', extensions: ['json'] }],
    });
    return !!res.ok;
  }
  const blob = new Blob([body], { type: type === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export async function readFileAsText(file: File): Promise<string> {
  return decodeText(await file.arrayBuffer());
}

export function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** توقيت محلي بصيغة YYYY-MM-DD HH:mm:ss (بدل UTC الذي يخطئ في اليوم قرب منتصف الليل) */
export function localTimestamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
