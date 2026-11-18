import { applyA4Theme, withAppFont } from './printing';
export type ShareTarget = 'whatsapp' | 'email' | 'folder';

export const SHARE_TARGETS: { id: ShareTarget; label: string; icon: string }[] = [
  { id: 'whatsapp', label: 'واتساب', icon: '💬' },
  { id: 'email', label: 'البريد الإلكتروني', icon: '✉️' },
  { id: 'folder', label: 'نسخ الملف وفتح مجلده', icon: '📁' },
];

/**
 * يجهّز ملف PDF للمستند، ينسخه للحافظة كملف، ثم يفتح التطبيق المطلوب.
 * التطبيقات لا تسمح بإرفاق ملف تلقائياً — يكفي الضغط على Ctrl+V داخل المحادثة/الرسالة.
 */
export async function shareDocument(opts: {
  fileName: string; html?: string; pageSize?: 'A4' | 'A5' | 'thermal'; heightMm?: number;
  target: ShareTarget; phone?: string; email?: string; text?: string; subject?: string;
}): Promise<{ ok: boolean; message: string }> {
  const api = window.ledger?.share;
  if (!api) return { ok: false, message: 'المشاركة متاحة في النسخة المثبتة على الجهاز فقط' };
  const res = await api.file(opts.html ? { ...opts, html: await withAppFont(applyA4Theme(opts.html)) } : opts);
  if (!res.ok) return { ok: false, message: `تعذّرت المشاركة${res.error ? ': ' + res.error : ''}` };
  const where = opts.target === 'whatsapp' ? 'واتساب' : opts.target === 'email' ? 'البريد' : 'المجلد';
  if (res.copied) {
    return { ok: true, message: opts.target === 'folder' ? `تم نسخ الملف — الصقه بـ Ctrl+V في أي مكان` : `تم فتح ${where} ونسخ الملف — اضغط Ctrl+V داخل ${opts.target === 'whatsapp' ? 'المحادثة' : 'الرسالة'} لإرفاقه` };
  }
  return { ok: true, message: `تعذّر نسخ الملف تلقائياً — فُتح مجلده، اسحبه إلى ${where}` };
}
