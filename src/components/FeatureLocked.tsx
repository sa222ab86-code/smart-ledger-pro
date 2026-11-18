import React from 'react';
import { Lock, KeyRound } from 'lucide-react';

interface Props {
  title: string;
  note: string;
  onOpenLicense: () => void;
  /** اشتراك انتهى (بدل ميزة لم تُشترَ) — نبرة تجديد لا نبرة عرض */
  expired?: boolean;
}

/** شاشة ميزة تُباع بترخيص منفصل — تظهر مكان الميزة بدل إخفائها */
export default function FeatureLocked({ title, note, onOpenLicense, expired }: Props) {
  return (
    <div className="p-6 min-h-full bg-slate-50 dark:bg-slate-950 text-right" dir="rtl" data-testid="feature-locked">
      <div className="max-w-2xl mx-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 text-center space-y-4">
        <div className={`inline-flex p-4 rounded-2xl ${expired ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300'}`}><Lock className="w-8 h-8" /></div>
        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100">{title}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-7">{note}</p>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{expired
          ? 'تواصل مع المطوّر لتجديد اشتراك الميزة، ثم فعّل المفتاح الجديد من شاشة «الترخيص والتفعيل».'
          : 'تواصل مع المطوّر ليصدر لك مفتاحاً يشمل هذه الميزة، ثم فعّله من شاشة «الترخيص والتفعيل».'}</p>
        <button onClick={onOpenLicense} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black cursor-pointer">
          <KeyRound className="w-4 h-4" /> شاشة الترخيص والتفعيل
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400">بقية البرنامج يعمل كالمعتاد — هذه الميزة خاصة بالإبلاغ لهيئة الزكاة والضريبة والجمارك.</p>
      </div>
    </div>
  );
}
