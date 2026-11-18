import React, { useState } from 'react';
import type { Customer } from '../types';
import { isValidVat, normVat, latinDigits, missingBuyerFields } from '../utils/zatcaDoc';

/** بيانات بطاقة العميل (بدون المعرّف والرصيد) */
export type CustomerDraft = Omit<Customer, 'id' | 'balance'>;

const input = 'w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-amber-500 focus:bg-white dark:focus:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold placeholder:font-semibold placeholder:text-slate-400 dark:placeholder:text-slate-500 transition';
const label = 'block text-slate-600 dark:text-slate-300 text-[13px] font-bold mb-1';
const hint = 'text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1';
/** نجمة إرشادية: حقل مطلوب لإصدار فاتورة ضريبية (B2B) */
const B2B = () => <span className="text-amber-500 font-black" title="مطلوب للفاتورة الضريبية">*</span>;

/**
 * بطاقة العميل الموحّدة — نفسها في شاشة العملاء (إضافة/تعديل) وفي شاشة البيع (عميل جديد)
 */
export default function CustomerForm({
  initial, title, submitLabel, onSubmit, onCancel, zIndex = 'z-50',
}: {
  initial?: Partial<Customer>;
  title: string;
  submitLabel: string;
  onSubmit: (d: CustomerDraft) => void;
  onCancel: () => void;
  zIndex?: string;
}) {
  const [f, setF] = useState({
    name: initial?.name || '', phone: initial?.phone || '', email: initial?.email || '', address: initial?.address || '',
    vatNumber: initial?.vatNumber || '', street: initial?.street || '', buildingNumber: initial?.buildingNumber || '',
    district: initial?.district || '', city: initial?.city || '', postalCode: initial?.postalCode || '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(p => ({ ...p, [k]: e.target.value }));
  const t = (s: string) => s.trim();
  const missing = isValidVat(f.vatNumber) ? missingBuyerFields({ street: f.street, buildingNumber: f.buildingNumber, district: f.district, city: f.city, postalCode: f.postalCode } as Customer) : [];
  const opt = (s: string) => t(s) || undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!t(f.name)) return;
    onSubmit({
      name: t(f.name), phone: t(f.phone), email: t(f.email), address: t(f.address),
      vatNumber: opt(normVat(f.vatNumber)), street: opt(f.street), buildingNumber: opt(latinDigits(f.buildingNumber)),
      district: opt(f.district), city: opt(f.city), postalCode: opt(latinDigits(f.postalCode)),
    });
  };

  return (
    <div className={`fixed inset-0 bg-black/60 ${zIndex} flex items-center justify-center p-4 backdrop-blur-sm`} dir="rtl" data-testid="customer-form">
      <form onSubmit={submit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[94vh] flex flex-col text-right">
        <div className="bg-slate-50 dark:bg-slate-950 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center gap-4">
          <div>
            <div className="font-black text-lg text-amber-600 dark:text-amber-400">{title}</div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">الاسم وحده يكفي للعميل العادي — بيانات المنشأة تلزم فقط لإصدار فاتورة ضريبية</div>
          </div>
          <button type="button" onClick={onCancel} className="text-slate-500 dark:text-slate-400 hover:text-rose-600 transition cursor-pointer text-lg">✕</button>
        </div>

        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* بيانات العميل */}
          <section className="space-y-4">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 pb-2 border-b border-slate-200 dark:border-slate-800">بيانات العميل</h3>
            <div>
              <label className={label}>اسم العميل <span className="text-rose-500 font-black">*</span> <B2B /></label>
              <input autoFocus required placeholder="الاسم كما سيظهر في الفاتورة" value={f.name} onChange={set('name')} className={input} />
            </div>
            <div>
              <label className={label}>رقم الجوال</label>
              <input placeholder="05XXXXXXXX" inputMode="tel" value={f.phone} onChange={set('phone')} className={`${input} font-mono placeholder:font-sans`} />
              <p className={hint}>يُستخدم للبحث عن العميل في شاشة البيع</p>
            </div>
            <div>
              <label className={label}>البريد الإلكتروني</label>
              <input type="email" placeholder="اختياري" value={f.email} onChange={set('email')} className={input} />
            </div>
            <div>
              <label className={label}>العنوان</label>
              <input placeholder="المدينة والحي — اختياري" value={f.address} onChange={set('address')} className={input} />
            </div>
          </section>

          {/* بيانات المنشأة للفاتورة الضريبية */}
          <section className="space-y-4">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 pb-2 border-b border-slate-200 dark:border-slate-800">بيانات المنشأة <span className="text-xs font-bold text-slate-500 dark:text-slate-400">— للفاتورة الضريبية</span></h3>
            <div>
              <label className={label}>الرقم الضريبي (VAT) <B2B /></label>
              <input placeholder="15 رقماً يبدأ وينتهي بـ 3" inputMode="numeric" value={f.vatNumber} onChange={(e) => setF(p => ({ ...p, vatNumber: normVat(e.target.value).slice(0, 15) }))} className={`${input} font-mono placeholder:font-sans`} data-testid="cust-vat" />
              {f.vatNumber ? (isValidVat(f.vatNumber) ? (
                <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 mt-1" data-testid="vat-hint">✓ رقم ضريبي صحيح — فواتير هذا العميل تصدر «فاتورة ضريبية»{missing.length ? ` (أكمل العنوان الوطني: ${missing.join('، ')})` : ''}</p>
              ) : (
                <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 mt-1" data-testid="vat-hint">الرقم غير مكتمل ({f.vatNumber.length}/15، يبدأ وينتهي بـ 3) — حتى يكتمل تصدر الفاتورة «مبسطة»</p>
              )) : (
                <p className={hint}>اتركه فارغاً للعميل الفرد — تصدر فاتورته «مبسطة»</p>
              )}
            </div>
            <div className="p-3.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/40">
              <p className="text-xs text-slate-600 dark:text-slate-300 font-bold mb-2">العنوان الوطني</p>
              <div className="grid grid-cols-2 gap-2.5">
                <label><span className={label}>الشارع <B2B /></span><input placeholder="اسم الشارع" value={f.street} onChange={set('street')} className={input} /></label>
                <label><span className={label}>رقم المبنى <B2B /></span><input placeholder="4 أرقام" inputMode="numeric" maxLength={4} value={f.buildingNumber} onChange={set('buildingNumber')} className={`${input} font-mono placeholder:font-sans`} /></label>
                <label><span className={label}>الحي <B2B /></span><input placeholder="اسم الحي" value={f.district} onChange={set('district')} className={input} /></label>
                <label><span className={label}>المدينة <B2B /></span><input placeholder="اسم المدينة" value={f.city} onChange={set('city')} className={input} /></label>
                <label className="col-span-2"><span className={label}>الرمز البريدي <B2B /></span><input placeholder="5 أرقام" inputMode="numeric" maxLength={5} value={f.postalCode} onChange={set('postalCode')} className={`${input} font-mono placeholder:font-sans`} /></label>
              </div>
            </div>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-wrap items-center gap-3">
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 leading-relaxed flex-1 min-w-[220px]" data-testid="b2b-legend">
            <span className="text-rose-500 font-black">*</span> مطلوب دائماً &nbsp;·&nbsp; <B2B /> مطلوب لإصدار <b className="text-slate-700 dark:text-slate-200">فاتورة ضريبية</b> لعميل منشأة له رقم ضريبي
          </p>
          <button type="button" onClick={onCancel} className="px-6 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-sm transition border border-slate-300 dark:border-slate-700 cursor-pointer">إلغاء</button>
          <button type="submit" className="px-8 py-2.5 bg-amber-500 text-slate-950 hover:bg-amber-400 rounded-xl font-black text-sm transition shadow-lg shadow-amber-500/10 cursor-pointer">{submitLabel}</button>
        </div>
      </form>
    </div>
  );
}
