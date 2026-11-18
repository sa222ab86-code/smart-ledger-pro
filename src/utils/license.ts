import { useCallback, useEffect, useState } from 'react';
import type { LicenseStatus } from '../storage/persistence';

/** بيانات المطوّر للتواصل وأسعار الخطط — عدّلها هنا قبل البناء */
export const VENDOR = {
  name: 'الدفتر الذكي',
  /** رقم واتساب بالصيغة الدولية بدون + (مثال 9665XXXXXXXX) — فارغ = يخفى زر واتساب */
  whatsapp: '',
  email: '',
  /** نص السعر كما يظهر للعميل (فارغ = لا يظهر) */
  priceYear: '',
  priceLife: '',
};

export const isUsable = (s: LicenseStatus | null) => !s || s.state === 'trial' || s.state === 'active';

/** ميزة متاحة للتشغيل: مرخّصة صراحةً أو مكتسبة من مفتاح قديم. بلا Electron (المتصفح) الكل متاح. */
export const hasFeature = (s: LicenseStatus | null, name: string) => !s || (isUsable(s) && (s.features || []).includes(name));
/** ميزة مرخّصة صراحةً — تلزم لبدء عملية جديدة مثل الربط بمنصة فاتورة أو إعادته بعد الفصل */
export const hasLicensedFeature = (s: LicenseStatus | null, name: string) => !s || (isUsable(s) && (s.licensedFeatures || []).includes(name));

/** أيام التنبيه قبل انتهاء اشتراك ميزة */
export const FEATURE_WARN_DAYS = 7;
export type FeatureNotice = { tone: 'warn' | 'bad'; text: string; cta: string } | null;
/**
 * تنبيه اشتراك الميزة: أصفر قبل الانتهاء بأسبوع وفي أول نصف من المهلة،
 * ثم أحمر في نصفها الثاني، ثم أحمر دائم بعد توقّفها.
 */
export function featureNotice(s: LicenseStatus | null, name: string, label: string): FeatureNotice {
  if (!s || !isUsable(s)) return null;
  const st = s.featureStates?.[name];
  if (!st || st.daysLeft == null || !st.expires) return null;
  const d = st.daysLeft;
  const grace = st.graceDays || 30;
  if (d > FEATURE_WARN_DAYS) return null;
  const dayWord = (n: number) => (n === 1 ? 'يوماً واحداً' : n === 2 ? 'يومين' : n <= 10 ? `${n} أيام` : `${n} يوماً`);
  if (d >= 0) return { tone: 'warn', text: `ينتهي اشتراك ${label} ${d === 0 ? 'اليوم' : (d === 1 ? 'غداً' : `خلال ${dayWord(d)}`)} (${st.expires})`, cta: 'تجديد' };
  const past = -d;
  if (past <= grace) {
    const left = grace - past;
    const tone = past <= grace / 2 ? 'warn' : 'bad';
    return { tone, text: `انتهى اشتراك ${label} في ${st.expires} — يستمر ${dayWord(left)} ثم يتوقف`, cta: 'تجديد الآن' };
  }
  return { tone: 'bad', text: `توقّفت ${label} — انتهى الاشتراك في ${st.expires} ولم يُجدَّد`, cta: 'تجديد' };
}

/** حالة الترخيص من العملية الرئيسية — في المتصفح (بدون Electron) يعتبر مفعّلاً */
export function useLicense() {
  const api = typeof window !== 'undefined' ? window.ledger?.license : undefined;
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const refresh = useCallback(async () => {
    if (!api) return null;
    try { const s = await api.status(); setStatus(s); return s; } catch { return null; }
  }, [api]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 30 * 60 * 1000);
    return () => clearInterval(t);
  }, [refresh]);
  return { status, setStatus, refresh, licensed: isUsable(status), available: !!api };
}

export const LICENSE_STATE_LABEL: Record<LicenseStatus['state'], string> = {
  trial: 'نسخة تجريبية',
  trial_expired: 'انتهت الفترة التجريبية',
  active: 'مفعّل',
  expired: 'انتهى الاشتراك',
  wrong_device: 'المفتاح لجهاز آخر',
  needs_update: 'يلزم تحديث البرنامج',
};
