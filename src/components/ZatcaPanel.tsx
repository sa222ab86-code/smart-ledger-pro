import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Link2, Unlink, RefreshCw, AlertTriangle, CheckCircle2, Loader2, Send, Info, Lock } from 'lucide-react';
import type { CompanySettings } from '../types';
import type { ZatcaStatus } from '../storage/persistence';
import { isValidVat } from '../utils/zatcaDoc';
import ZatcaDocDetail from './ZatcaDocDetail';
import FeatureLocked from './FeatureLocked';
import { getLanguage } from '../i18n';

/** تاريخ/وقت بلغة الواجهة: عربي بأرقام لاتينية، أو إنجليزي عند اختيار English */
const dtLocale = () => (getLanguage() === 'en' ? 'en-GB' : 'ar-SA-u-ca-gregory-nu-latn');

type Env = 'sandbox' | 'simulation' | 'production';

const ENV_INFO: Record<Env, { label: string; hint: string }> = {
  sandbox: { label: 'بيئة المطورين (تجربة تقنية)', hint: 'للتجربة فقط — رمز OTP الثابت 123345، ولا حاجة لحساب في فاتورة.' },
  simulation: { label: 'بيئة المحاكاة', hint: 'تجربة واقعية بحسابك: من بوابة المحاكاة fatoora.zatca.gov.sa ← «المحاكاة» ← تسجيل جهاز جديد ← إنشاء رمز OTP.' },
  production: { label: 'البيئة الرسمية (التشغيل الفعلي)', hint: 'من بوابة فاتورة fatoora.zatca.gov.sa ← تسجيل وحدة حلول/جهاز جديد ← إنشاء رمز OTP (صالح لساعة).' },
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'بانتظار الإرسال', reported: 'مُبلّغة', cleared: 'معتمدة', warning: 'مقبولة مع تحذيرات', rejected: 'مرفوضة', error: 'خطأ',
};

interface Props {
  settings: CompanySettings;
  onActiveChange: (active: boolean) => void;
  notify: (msg: string, ms?: number) => void;
  /** الربط بمنصة فاتورة يحتاج ترخيص الفاتورة الإلكترونية — وإعادة الربط بعد الفصل كذلك */
  canOnboard?: boolean;
  /** نص يظهر مكان نموذج الربط عند عدم وجود ترخيص */
  onboardLockedNote?: string;
  /** فتح شاشة «الترخيص والتفعيل» (زر في واجهة القفل) */
  onOpenLicense?: () => void;
  /** اشتراك الميزة إن كانت باشتراك مستقل: تاريخ الانتهاء والأيام المتبقية */
  subscription?: { expires: string | null; daysLeft: number | null; graceDays: number } | null;
}

const inputCls = 'w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-slate-700 dark:text-slate-200';

export default function ZatcaPanel({ settings, onActiveChange, notify, canOnboard = true, onboardLockedNote, subscription, onOpenLicense }: Props) {
  const api = typeof window !== 'undefined' ? window.ledger?.zatca : undefined;
  const [st, setSt] = useState<ZatcaStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [log, setLog] = useState<{ step: string; detail: string }[]>([]);
  const [failure, setFailure] = useState<{ error: string; results?: { label: string; httpStatus: number; errors: string[]; warnings: string[] }[] } | null>(null);

  const [env, setEnv] = useState<Env>('simulation');
  const [f, setF] = useState({
    name: settings.companyName || '', vatNumber: settings.vatNumber || '', crn: settings.grNumber || '',
    street: '', building: '', plot: '', district: '', city: '', postalCode: '',
    branch: 'الفرع الرئيسي', industry: 'Retail', otp: '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(p => ({ ...p, [k]: e.target.value }));

  const refresh = async () => {
    if (!api) return;
    try {
      const s = await api.status();
      setSt(s);
      onActiveChange(!!s.active);
    } catch { /* تجاهل */ }
  };

  useEffect(() => {
    if (!api) return;
    void refresh();
    const offP = api.onProgress(d => setLog(l => [...l, { step: d.step, detail: d.detail }]));
    const offS = api.onStatus(() => { void refresh(); });
    const t = setInterval(() => { void refresh(); }, 30000);
    return () => { offP(); offS(); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (env === 'sandbox' && !f.otp) setF(p => ({ ...p, otp: '123345' })); }, [env]); // eslint-disable-line react-hooks/exhaustive-deps

  const errors = useMemo(() => {
    const e: string[] = [];
    if (!f.name.trim()) e.push('اسم المنشأة');
    if (!isValidVat(f.vatNumber)) e.push('الرقم الضريبي (15 رقماً يبدأ وينتهي بـ 3)');
    if (!/^\d{10}$/.test(f.crn.trim())) e.push('السجل التجاري (10 أرقام)');
    if (!f.street.trim()) e.push('الشارع');
    if (!/^\d{4}$/.test(f.building.trim())) e.push('رقم المبنى (4 أرقام)');
    if (f.plot.trim() && !/^\d{4}$/.test(f.plot.trim())) e.push('الرقم الإضافي (4 أرقام)');
    if (!f.district.trim()) e.push('الحي');
    if (!f.city.trim()) e.push('المدينة');
    if (!/^\d{5}$/.test(f.postalCode.trim())) e.push('الرمز البريدي (5 أرقام)');
    if (!/^\d{6}$/.test(f.otp.trim())) e.push('رمز OTP (6 أرقام)');
    return e;
  }, [f]);

  const onboard = async () => {
    if (!api || busy) return;
    setTried(true);
    if (errors.length) return;
    if (env === 'production' && !window.confirm('سيتم ربط هذا الجهاز بمنصة فاتورة في البيئة الرسمية، وكل فاتورة بعدها تُرسل للهيئة. متابعة؟')) return;
    setBusy(true); setLog([]); setFailure(null);
    try {
      const t = (s: string) => s.trim();
      const res = await api.onboard({
        env, otp: t(f.otp),
        seller: { name: t(f.name), vatNumber: t(f.vatNumber), crn: t(f.crn), street: t(f.street), building: t(f.building), plot: t(f.plot) || undefined, district: t(f.district), city: t(f.city), postalCode: t(f.postalCode) },
        egs: { branch: t(f.branch) || 'الفرع الرئيسي', industry: t(f.industry) || 'Retail', location: t(f.city) },
      });
      if (res.ok) {
        notify('تم ربط الجهاز بمنصة فاتورة بنجاح ✓', 5000);
        setF(p => ({ ...p, otp: '' }));
      } else {
        setFailure({ error: res.error || 'فشل الربط', results: res.results });
      }
    } catch (e) {
      setFailure({ error: String((e as Error)?.message || e) });
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const runNow = async () => {
    if (!api) return;
    setBusy(true);
    try { setSt(await api.runQueue()); } finally { setBusy(false); }
  };

  const retry = async (id: string) => {
    if (!api) return;
    await api.retryDoc(id);
    void refresh();
  };

  const disconnect = async () => {
    if (!api) return;
    const warn = canOnboard
      ? 'فصل الجهاز عن منصة فاتورة؟ لن تُختم الفواتير الجديدة حتى تعيد الربط برمز OTP جديد. (الفواتير المعلّقة تبقى محفوظة)'
      : '⚠️ تنبيه مهم: الربط عندك يعمل بميزة مكتسبة من ترخيصك القديم، وإعادة الربط بعد الفصل تحتاج ترخيص «الفاتورة الإلكترونية».\n\nإن فصلت الآن فلن تستطيع إعادة الربط حتى تحصل على مفتاح يشمل الميزة. متأكد من الفصل؟';
    if (!window.confirm(warn)) return;
    const s = await api.disconnect();
    setSt(s); onActiveChange(!!s.active);
  };

  // غير مربوط ولا يملك ترخيص الميزة (ترخيص قديم بلا ربط سابق): نفس واجهة القفل الموحّدة بزر شاشة الترخيص
  if (api && st && !st.active && !canOnboard) {
    return (
      <FeatureLocked
        title="الفاتورة الإلكترونية (الربط مع منصة فاتورة)"
        note={onboardLockedNote || 'هذه الميزة بترخيص منفصل: ختم الفواتير إلكترونياً وإرسالها لهيئة الزكاة والضريبة والجمارك في المرحلة الثانية.'}
        onOpenLicense={() => onOpenLicense?.()}
      />
    );
  }

  return (
    <div className="p-6 min-h-full bg-slate-50 dark:bg-slate-950 text-right text-slate-800 dark:text-slate-100" dir="rtl" data-testid="zatca-panel">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-5">
        {subscription?.expires && subscription.daysLeft != null && (
          <div className={`rounded-xl px-4 py-2.5 text-sm font-bold flex items-center gap-2 flex-wrap ${
            subscription.daysLeft < 0 ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
              : subscription.daysLeft <= 30 ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
              : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'}`} data-testid="zatca-subscription">
            <ShieldCheck className="w-4 h-4" />
            {/* جملة واحدة في عقدة نصية واحدة ليترجمها القاموس كاملة */}
            <span>{subscription.daysLeft >= 0
              ? `اشتراك الفاتورة الإلكترونية ساري حتى ${subscription.expires} (بقي ${subscription.daysLeft} يوماً) — وهو مستقل عن ترخيص البرنامج.`
              : `انتهى اشتراك الفاتورة الإلكترونية في ${subscription.expires} — بقي من المهلة ${Math.max(0, (subscription.graceDays || 30) + subscription.daysLeft)} يوماً يتوقّف بعدها الختم والإرسال. جدّد الاشتراك ليستمر الإبلاغ.`}</span>
          </div>
        )}

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"><ShieldCheck className="w-6 h-6" /></div>
            <div>
              <h2 className="text-lg font-black">الربط مع منصة فاتورة — المرحلة الثانية</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">ختم كل فاتورة إلكترونياً وإرسالها للهيئة: المبسطة تُبلَّغ خلال 24 ساعة، والضريبية (لعميل له رقم ضريبي) تُعتمد من الهيئة.</p>
            </div>
          </div>
          {st?.active && (
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${st.env === 'production' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
              {st.active ? 'مرتبط' : ''} — {st.envLabel}
            </span>
          )}
        </div>

        {!api && (
          <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm flex gap-2"><Info className="w-5 h-5 shrink-0" />الربط متاح في النسخة المثبتة على الجهاز فقط.</div>
        )}

        {api && st?.active && (
          <div className="space-y-4" data-testid="zatca-active">
            {st.env !== 'production' && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm flex gap-2">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                الجهاز مربوط ببيئة تجريبية — الفواتير لا تُعتبر مُبلّغة رسمياً. بعد نجاح التجربة افصل الجهاز وأعد ربطه بالبيئة الرسمية.
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Info2 label="المنشأة" value={st.seller?.name || '—'} />
              <Info2 label="الرقم الضريبي" value={st.seller?.vatNumber || '—'} mono />
              <Info2 label="الفرع" value={st.egs?.branch || '—'} />
              <Info2 label="تاريخ الربط" value={st.onboardedAt ? new Date(st.onboardedAt).toLocaleString(dtLocale()) : '—'} />
              <Info2 label="عدّاد الفواتير (ICV)" value={String(st.icv)} mono />
              <Info2 label="آخر إرسال" value={st.queue.lastRunAt ? new Date(st.queue.lastRunAt).toLocaleTimeString(getLanguage() === 'en' ? 'en-GB' : 'ar-SA-u-nu-latn') : '—'} />
              <Info2 label="مُصدر الشهادة" value={st.certInfo?.issuer?.split(',')[0] || '—'} />
              <Info2 label="معرّف الجهاز" value={st.egs?.uuid?.slice(0, 8) || '—'} mono />
            </div>
            <div className="flex flex-wrap gap-2">
              {(['pending', 'reported', 'cleared', 'warning', 'rejected', 'error'] as const).map(k => (
                <span key={k} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${k === 'rejected' || k === 'error' ? 'border-rose-200 text-rose-700 dark:border-rose-800 dark:text-rose-300' : k === 'pending' || k === 'warning' ? 'border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-300' : 'border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300'}`}>
                  {STATUS_LABEL[k]}: {st.counts[k] || 0}
                </span>
              ))}
            </div>
            {st.queue.lastError && <p className="text-xs text-rose-600 dark:text-rose-400">آخر خطأ اتصال: {st.queue.lastError}</p>}

            {st.problems.length > 0 && (
              <div className="rounded-xl border border-rose-200 dark:border-rose-900 overflow-hidden">
                <div className="px-3 py-2 bg-rose-50 dark:bg-rose-950/40 text-sm font-bold text-rose-700 dark:text-rose-300">فواتير تحتاج مراجعة — مرفوضة، متأخرة، أو مقبولة مع تحذيرات</div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                  {st.problems.map(p => (
                    <div key={p.invoice_id} className="p-3 text-xs flex items-start justify-between gap-3" data-testid="zatca-problem">
                      <div className="min-w-0">
                        <div className="font-bold">
                          {p.number} — <span className={p.status === 'warning' || p.status === 'pending' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}>{STATUS_LABEL[p.status] || p.status}</span>
                          <span className="font-normal text-slate-400"> ({p.attempts} محاولة)</span>
                        </div>
                        {p.last_error && <div className="text-slate-500 dark:text-slate-400 break-words mt-0.5 line-clamp-2">{p.last_error}</div>}
                      </div>
                      <div className="shrink-0 flex gap-1.5">
                        <button onClick={() => setDetailId(p.invoice_id)} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold">عرض رد الهيئة</button>
                        {(p.status === 'rejected' || p.status === 'error') && (
                          <button onClick={() => retry(p.invoice_id)} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold">إعادة المحاولة</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button onClick={runNow} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-60">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} إرسال المعلّق الآن
              </button>
              <button onClick={() => void refresh()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold"><RefreshCw className="w-4 h-4" /> تحديث</button>
              <button onClick={disconnect} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-sm font-bold mr-auto"><Unlink className="w-4 h-4" /> فصل الجهاز</button>
            </div>
          </div>
        )}

        {api && st && !st.active && !canOnboard && (
          <div className="rounded-2xl border-2 border-dashed border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5 text-center space-y-2" data-testid="zatca-onboard-locked">
            <div className="flex items-center justify-center gap-2 text-amber-700 dark:text-amber-300 font-black"><Lock className="w-5 h-5" /> الربط يحتاج ترخيص الفاتورة الإلكترونية</div>
            <p className="text-sm text-slate-600 dark:text-slate-300">{onboardLockedNote || 'هذه الميزة تُباع بترخيص منفصل. تواصل مع المطوّر ليصدر لك مفتاحاً يشملها، ثم فعّله من شاشة «الترخيص والتفعيل» وعُد إلى هنا.'}</p>
            <p className="text-xs text-slate-500">الفواتير تُحفظ وتُطبع كالمعتاد بدون الربط — الربط خاص بالإبلاغ للهيئة.</p>
          </div>
        )}

        {api && st && !st.active && canOnboard && (
          <div className="space-y-4" data-testid="zatca-onboard">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {(Object.keys(ENV_INFO) as Env[]).map(k => (
                <button key={k} onClick={() => setEnv(k)} className={`p-3 rounded-xl border-2 text-sm font-bold text-right ${env === k ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                  {ENV_INFO[k].label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 flex gap-1.5"><Info className="w-4 h-4 shrink-0" />{ENV_INFO[env].hint}</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="اسم المنشأة (كما في السجل)"><input className={inputCls} value={f.name} onChange={set('name')} /></Field>
              <Field label="الرقم الضريبي"><input className={inputCls} dir="ltr" inputMode="numeric" maxLength={15} value={f.vatNumber} onChange={set('vatNumber')} /></Field>
              <Field label="السجل التجاري"><input className={inputCls} dir="ltr" inputMode="numeric" maxLength={10} value={f.crn} onChange={set('crn')} /></Field>
              <Field label="الشارع"><input className={inputCls} value={f.street} onChange={set('street')} /></Field>
              <Field label="رقم المبنى"><input className={inputCls} dir="ltr" inputMode="numeric" maxLength={4} value={f.building} onChange={set('building')} /></Field>
              <Field label="الرقم الإضافي (اختياري)"><input className={inputCls} dir="ltr" inputMode="numeric" maxLength={4} value={f.plot} onChange={set('plot')} /></Field>
              <Field label="الحي"><input className={inputCls} value={f.district} onChange={set('district')} /></Field>
              <Field label="المدينة"><input className={inputCls} value={f.city} onChange={set('city')} /></Field>
              <Field label="الرمز البريدي"><input className={inputCls} dir="ltr" inputMode="numeric" maxLength={5} value={f.postalCode} onChange={set('postalCode')} /></Field>
              <Field label="اسم الفرع"><input className={inputCls} value={f.branch} onChange={set('branch')} /></Field>
              <Field label="النشاط">
                <select className={inputCls} value={f.industry} onChange={set('industry')}>
                  <option value="Retail">تجزئة / بقالة</option>
                  <option value="Food">مطاعم وأغذية</option>
                  <option value="Wholesale">جملة</option>
                  <option value="Pharmacy">صيدلية</option>
                  <option value="Services">خدمات</option>
                  <option value="Other">أخرى</option>
                </select>
              </Field>
              <Field label="رمز OTP من بوابة فاتورة"><input className={inputCls + ' font-mono tracking-widest text-center'} dir="ltr" inputMode="numeric" maxLength={6} value={f.otp} onChange={set('otp')} data-testid="zatca-otp" /></Field>
            </div>

            <button onClick={onboard} disabled={busy} data-testid="zatca-onboard-btn" className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} ربط الجهاز بالمنصة
            </button>
            {tried && errors.length > 0 && (
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400" data-testid="zatca-form-errors">أكمل: {errors.join('، ')}</p>
            )}
          </div>
        )}

        {detailId && <ZatcaDocDetail invoiceId={detailId} onClose={() => { setDetailId(null); void refresh(); }} />}

        {(log.length > 0 || failure) && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 text-xs space-y-1.5" data-testid="zatca-log">
            {log.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                {l.step === 'done' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mx-1" />}
                <span>{l.detail}</span>
              </div>
            ))}
            {failure && (
              <div className="pt-2 text-rose-700 dark:text-rose-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />{failure.error}</div>
                {failure.results?.map((r, i) => (
                  <div key={i}>
                    <span className="font-bold">{r.label} ({r.httpStatus})</span>
                    {r.errors.map((m, j) => <div key={j} className="pr-3 break-words">• {m}</div>)}
                    {r.warnings.map((m, j) => <div key={'w' + j} className="pr-3 break-words text-amber-600">• {m}</div>)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</span>{children}</label>;
}

function Info2({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 min-w-0">
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`font-bold truncate ${mono ? 'font-mono' : ''}`} title={value}>{value}</div>
    </div>
  );
}
