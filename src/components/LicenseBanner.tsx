import { useEffect, useState } from 'react';
import type { LicenseStatus } from '../storage/persistence';
import { featureNotice } from '../utils/license';

/** إخفاء شريط التجربة/التجديد مؤقتاً: يعود عند تشغيل البرنامج من جديد أو بعد 4 ساعات */
const HIDE_KEY = 'sl:licenseBannerHiddenAt';
const HIDE_MS = 4 * 60 * 60 * 1000;
const hiddenNow = () => { try { const t = Number(sessionStorage.getItem(HIDE_KEY)); return !!t && Date.now() - t < HIDE_MS; } catch { return false; } };

/** شريط الترخيص أعلى الشاشة: التجربة / قرب انتهاء الاشتراك / وضع القراءة فقط */
export default function LicenseBanner({ status, onOpen }: { status: LicenseStatus | null; onOpen: () => void }) {
  const [hidden, setHidden] = useState(hiddenNow);
  // بعد انتهاء مدة الإخفاء يعود الشريط تلقائياً
  useEffect(() => {
    if (!hidden) return;
    const id = setInterval(() => { if (!hiddenNow()) setHidden(false); }, 60 * 1000);
    return () => clearInterval(id);
  }, [hidden]);
  if (!status) return null;
  const s = status;
  let tone = '', text = '', cta = 'تفعيل';
  if (s.state === 'trial') { tone = 'bg-sky-600'; text = `نسخة تجريبية — باقي ${s.daysLeft} ${s.daysLeft === 1 ? 'يوم' : 'أيام'}`; }
  else if (s.state === 'active' && s.type === 'year' && s.daysLeft != null && s.daysLeft <= 14) { tone = 'bg-amber-500 text-amber-950'; text = `ينتهي الاشتراك السنوي خلال ${s.daysLeft} يوم (${s.expires})`; cta = 'تجديد'; }
  else if (s.state === 'expired') { tone = 'bg-rose-600'; text = `انتهى الاشتراك في ${s.expires} — وضع القراءة فقط`; cta = 'تجديد الآن'; }
  else if (s.state === 'trial_expired') { tone = 'bg-rose-600'; text = 'انتهت الفترة التجريبية — وضع القراءة فقط (البيع والفواتير متوقفة)'; cta = 'تفعيل الآن'; }
  else if (s.state === 'wrong_device') { tone = 'bg-rose-600'; text = s.cloned ? 'نظام ويندوز في هذا الجهاز منسوخ من جهاز آخر — يحتاج ترخيصاً خاصاً به (وضع القراءة فقط)' : 'مفتاح الترخيص لجهاز آخر — وضع القراءة فقط'; cta = 'تفعيل'; }
  else if (s.state === 'needs_update') { tone = 'bg-rose-600'; text = `مفتاحك يحتاج النسخة ${s.minVersion} أو أحدث (نسختك ${s.appVersion}) — حدّث البرنامج`; cta = 'تحديث'; }
  // اشتراك ميزة مستقل (الفاتورة الإلكترونية) — يظهر حين لا يكون للترخيص نفسه ما يقوله
  const feat = featureNotice(s, 'zatca', 'الفاتورة الإلكترونية');
  if (!text && feat) { tone = feat.tone === 'bad' ? 'bg-rose-600' : 'bg-amber-500 text-amber-950'; text = feat.text; cta = feat.cta; }
  if (!text) return null;
  // التجربة وقرب التجديد يمكن إخفاؤهما مؤقتاً؛ وضع القراءة فقط يبقى ظاهراً
  const dismissible = (s.state === 'trial' || s.state === 'active') && !(feat && feat.tone === 'bad');
  if (dismissible && hidden) return null;
  return (
    <div className={`${tone} text-white text-sm font-black px-4 py-1.5 flex items-center justify-center gap-3 shrink-0 print:hidden`} dir="rtl" data-testid="license-banner">
      <span>🔑 {text}</span>
      <button type="button" onClick={onOpen} className="px-3 py-0.5 rounded-lg bg-white/90 text-slate-900 text-xs font-black hover:bg-white">{cta}</button>
      {dismissible && (
        <button type="button" data-testid="license-banner-hide" title="إخفاء (يظهر عند تشغيل البرنامج من جديد أو بعد 4 ساعات)"
          onClick={() => { try { sessionStorage.setItem(HIDE_KEY, String(Date.now())); } catch { /* */ } setHidden(true); }}
          className="w-6 h-6 rounded-md bg-black/15 hover:bg-black/30 text-white text-base leading-none font-black flex items-center justify-center">×</button>
      )}
    </div>
  );
}
