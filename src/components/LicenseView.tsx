import { useEffect, useState } from 'react';
import { generateQrDataUrl } from '../utils/zatca';
import { KeyRound, Copy, CheckCircle2, ShieldAlert, Clock, Infinity as InfinityIcon, CalendarDays, MessageCircle, Trash2, ClipboardPaste, X, Download } from 'lucide-react';
import type { LicenseStatus, UpdateState } from '../storage/persistence';
import { flushNow } from '../storage/persistence';
import { LICENSE_STATE_LABEL, VENDOR } from '../utils/license';

interface Props {
  status: LicenseStatus | null;
  onStatus: (s: LicenseStatus) => void;
  notify: (m: string) => void;
  canManage: boolean;
  /** اسم المنشأة وجوالها — يُضمَّنان في رمز QR لطلب التفعيل */
  companyName?: string;
  companyPhone?: string;
}

/**
 * رمز QR لطلب التفعيل: يقرؤه تطبيق «تراخيص الدفتر الذكي» على جوال المطوّر (أو أي قارئ QR يُظهر النص).
 * السطر الأول بصيغة ثابتة يتعرف عليها التطبيق، ثم اسم المنشأة والجوال.
 */
export const licenseRequestText = (code: string, name?: string, phone?: string) =>
  ['SL-DEVICE:' + code, (name || '').trim(), (phone || '').trim()].join('\n').trim();

export default function LicenseView({ status, onStatus, notify, canManage, companyName, companyPhone }: Props) {
  const api = window.ledger?.license;
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [qr, setQr] = useState('');
  const code = status?.machineCode || '';
  useEffect(() => {
    if (!code) return;
    let alive = true;
    void generateQrDataUrl(licenseRequestText(code, companyName, companyPhone), { width: 360, errorCorrectionLevel: 'M', margin: 2 }).then((u) => { if (alive) setQr(u); });
    return () => { alive = false; };
  }, [code, companyName, companyPhone]);

  if (!api || !status) {
    return <div className="p-10 text-center text-slate-500 font-bold">الترخيص متاح في النسخة المكتبية فقط</div>;
  }
  const s = status;
  const ok = s.state === 'active' || s.state === 'trial';
  const tone = s.state === 'active' ? 'emerald' : s.state === 'trial' ? 'sky' : 'rose';
  const toneCls = { emerald: 'from-emerald-600 to-teal-700', sky: 'from-sky-600 to-cyan-700', rose: 'from-rose-600 to-red-700' }[tone];

  const clip = window.ledger?.clipboard;
  const copy = async () => {
    try {
      if (clip) await clip.writeText(s.machineCode); else await navigator.clipboard.writeText(s.machineCode);
      notify('تم نسخ رمز الجهاز');
    } catch { notify(s.machineCode); }
  };
  /** لصق المفتاح من الحافظة مباشرة (بدون عرضه) */
  const paste = async () => {
    try {
      const t = clip ? await clip.readText() : await navigator.clipboard.readText();
      if (!t.trim()) { setError('الحافظة فارغة — انسخ المفتاح أولاً'); return; }
      setKey(t.trim()); setError('');
    } catch { setError('تعذر القراءة من الحافظة — استخدم Ctrl+V داخل الحقل'); }
  };
  const keyLooksOk = /^SL1-[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key.replace(/\s+/g, ''));
  const whatsapp = (plan: string) => {
    if (!VENDOR.whatsapp) return;
    const text = `السلام عليكم، أرغب في تفعيل برنامج ${VENDOR.name} — ${plan}\nرمز الجهاز: ${s.machineCode}`;
    window.open(`https://wa.me/${VENDOR.whatsapp}?text=${encodeURIComponent(text)}`, '_blank');
  };
  const activate = async () => {
    setError('');
    if (!key.trim()) return setError('الصق مفتاح التفعيل');
    setBusy(true);
    try {
      const r = await api.activate(key.trim());
      if (!r.ok) setError(r.error || 'تعذر التفعيل');
      else { onStatus(r.status!); setKey(''); notify('✅ تم تفعيل البرنامج بنجاح'); }
    } finally { setBusy(false); }
  };

  return (
    <div className="p-6 h-full overflow-y-auto max-w-5xl mx-auto space-y-5 text-right dark:text-white" dir="rtl" data-testid="license-view">
      {/* الحالة */}
      <div className={`rounded-3xl p-6 text-white bg-gradient-to-l ${toneCls} shadow-lg`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center">{ok ? <CheckCircle2 className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />}</div>
            <div>
              <div className="text-sm opacity-80 font-bold">حالة الترخيص</div>
              <div className="text-3xl font-black" data-testid="license-state">{LICENSE_STATE_LABEL[s.state]}</div>
              {s.customer && <div className="text-sm font-bold mt-1 opacity-90">مرخّص لـ: {s.customer}</div>}
            </div>
          </div>
          <div className="text-left space-y-1 text-sm font-bold">
            {s.state === 'trial' && <div className="text-2xl font-black">باقي {s.daysLeft} {s.daysLeft === 1 ? 'يوم' : 'أيام'}</div>}
            {s.state === 'trial' && <div className="opacity-85">تنتهي التجربة في {s.trialEnds}</div>}
            {s.state === 'active' && s.type === 'life' && <div className="text-xl font-black flex items-center gap-2"><InfinityIcon className="w-5 h-5" /> شراء كامل — بدون انتهاء</div>}
            {s.state === 'active' && s.type === 'year' && <><div className="text-xl font-black">اشتراك سنوي</div><div className="opacity-90">ينتهي في {s.expires} — باقي {s.daysLeft} يوم</div></>}
            {s.state === 'expired' && <div className="opacity-90">انتهى في {s.expires} — جدّد الاشتراك لمتابعة البيع</div>}
            {s.state === 'trial_expired' && <div className="opacity-90">انتهت التجربة في {s.trialEnds}</div>}
            {s.state === 'wrong_device' && <div className="opacity-90">{s.reason}</div>}
            {s.devices ? <div className="opacity-80">عدد الأجهزة في الترخيص: {s.devices}</div> : null}
          </div>
        </div>
        {!ok && (
          <div className="mt-4 rounded-2xl bg-black/20 px-4 py-3 text-sm font-bold">
            البرنامج الآن في <b>وضع القراءة فقط</b>: يمكنك عرض البيانات والتقارير وأخذ نسخة احتياطية، أما البيع وإصدار الفواتير والمشتريات وعروض الأسعار فتحتاج تفعيلاً.
          </div>
        )}
        {s.clockWarning && <div className="mt-3 rounded-2xl bg-amber-400/90 text-amber-950 px-4 py-2 text-sm font-black">⚠️ تاريخ الجهاز أقدم من آخر تاريخ استُخدم فيه البرنامج — صحّح تاريخ ووقت ويندوز.</div>}
      </div>

      {/* رمز الجهاز */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 shadow-sm">
        <div className="text-sm font-black text-slate-600 dark:text-slate-300 mb-2">١. رمز هذا الجهاز — أرسله للمطوّر للحصول على مفتاح التفعيل</div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="font-mono text-2xl font-black tracking-wider bg-slate-50 dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl px-5 py-3 select-all" dir="ltr" data-testid="machine-code">{s.machineCode}</div>
          <button type="button" onClick={() => void copy()} data-testid="copy-code" className="px-4 py-3 rounded-xl bg-slate-800 text-white font-black flex items-center gap-2"><Copy className="w-4 h-4" /> نسخ</button>
        </div>
        {/* رمز QR: يصوّره العميل ويرسله للمطوّر للحصول على الترخيص */}
        {qr && (
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3" data-testid="license-qr">
            <img src={qr} alt="رمز QR لطلب التفعيل" className="w-40 h-40 rounded-xl bg-white p-1.5 border border-slate-200" />
            <div className="flex-1 min-w-[12rem] space-y-1.5 text-sm font-bold text-slate-600 dark:text-slate-300">
              <div className="font-black text-slate-800 dark:text-white">أو أرسل رمز QR</div>
              <p>{companyName ? 'صوّر هذا الرمز وأرسله للمطوّر عبر واتساب للحصول على الترخيص — يحمل رمز الجهاز واسم المنشأة.' : 'صوّر هذا الرمز وأرسله للمطوّر عبر واتساب للحصول على الترخيص — يحمل رمز الجهاز.'}</p>
            </div>
          </div>
        )}
      </div>

      {/* الخطط */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {([
          { id: 'year', title: 'اشتراك سنوي', icon: <CalendarDays className="w-6 h-6" />, price: VENDOR.priceYear, desc: 'تفعيل لمدة سنة مع التحديثات، ويُجدَّد بمفتاح جديد كل سنة.' },
          { id: 'life', title: 'شراء كامل', icon: <InfinityIcon className="w-6 h-6" />, price: VENDOR.priceLife, desc: 'دفعة واحدة وتفعيل دائم بدون تاريخ انتهاء.' },
        ] as const).map((p) => (
          <div key={p.id} className={`rounded-2xl p-5 border-2 bg-white dark:bg-slate-800 ${s.state === 'active' && s.type === p.id ? 'border-emerald-500' : 'border-slate-100 dark:border-slate-700'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg font-black text-slate-800 dark:text-white"><span className="text-teal-600">{p.icon}</span>{p.title}</div>
              {s.state === 'active' && s.type === p.id && <span className="text-xs font-black px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700">خطتك الحالية</span>}
            </div>
            {p.price && <div className="text-2xl font-black mt-2 text-teal-700 dark:text-teal-300">{p.price}</div>}
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 font-semibold">{p.desc}</p>
            {VENDOR.whatsapp && (
              <button type="button" onClick={() => whatsapp(p.title)} className="mt-3 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black flex items-center justify-center gap-2">
                <MessageCircle className="w-4 h-4" /> اطلب عبر واتساب
              </button>
            )}
          </div>
        ))}
      </div>

      {/* إدخال المفتاح */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700 shadow-sm space-y-3">
        <div className="text-sm font-black text-slate-600 dark:text-slate-300 flex items-center gap-2"><KeyRound className="w-4 h-4" /> ٢. الصق مفتاح التفعيل الذي وصلك</div>
        {/* حقل مُشوَّش: المفتاح لا يظهر ولا يمكن نسخه من الحقل — لصق فقط */}
        <div className="flex flex-wrap items-stretch gap-2">
          <input type="password" value={key} onChange={(e) => { setKey(e.target.value); setError(''); }} disabled={!canManage}
            onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()}
            onKeyDown={(e) => { if (e.key === 'Enter') void activate(); }}
            autoComplete="off" spellCheck={false} dir="ltr" placeholder="الصق مفتاح التفعيل هنا (Ctrl+V)"
            className="flex-1 min-w-[16rem] font-mono text-lg tracking-[0.2em] bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:border-teal-500 placeholder:tracking-normal placeholder:text-sm placeholder:font-sans"
            data-testid="license-key" />
          <button type="button" onClick={() => void paste()} disabled={!canManage} className="px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-black flex items-center gap-2 disabled:opacity-50" data-testid="license-paste">
            <ClipboardPaste className="w-4 h-4" /> لصق
          </button>
          {key && <button type="button" onClick={() => { setKey(''); setError(''); }} title="مسح" className="px-3 rounded-xl bg-slate-100 dark:bg-slate-700"><X className="w-4 h-4" /></button>}
        </div>
        {key && (
          <div className={`text-xs font-black ${keyLooksOk ? 'text-emerald-600' : 'text-amber-600'}`} data-testid="license-key-hint">
            {keyLooksOk ? `✓ تم إدخال مفتاح (${key.replace(/\s+/g, '').length} حرفاً) — اضغط «تفعيل»` : '⚠️ النص الملصوق لا يبدو مفتاح تفعيل صحيحاً — تأكد من نسخه كاملاً'}
          </div>
        )}
        {error && (
          <div className="text-rose-600 text-sm font-black space-y-1" data-testid="license-error">
            <div>{error}</div>
            {status?.keyId && <div className="text-[11px] font-mono font-bold text-slate-500" dir="ltr">build key: {status.keyId}</div>}
          </div>
        )}
        {!canManage && <div className="text-xs text-amber-700 font-bold">التفعيل من صلاحية المدير.</div>}
        <div className="flex flex-wrap gap-2">
          <UpdateNow notify={notify} />
          <button type="button" onClick={() => void activate()} disabled={busy || !canManage} className="px-6 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-black" data-testid="license-activate">{busy ? 'جارٍ التحقق...' : 'تفعيل'}</button>
          {s.state !== 'trial' && s.state !== 'trial_expired' && canManage && (
            confirmRemove
              ? <button type="button" onClick={async () => { onStatus(await api.remove()); setConfirmRemove(false); notify('تمت إزالة الترخيص من هذا الجهاز'); }} className="px-4 py-3 rounded-xl bg-rose-600 text-white font-black">تأكيد إزالة الترخيص</button>
              : <button type="button" onClick={() => setConfirmRemove(true)} className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 font-bold flex items-center gap-2"><Trash2 className="w-4 h-4" /> إزالة الترخيص من الجهاز</button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> التفعيل يتم بدون إنترنت. عند تغيير الجهاز أو ويندوز يتغير رمز الجهاز ويلزم مفتاح جديد.</p>
    </div>
  );
}

/**
 * زر تحديث داخل شاشة التفعيل: من علقت تجربته أو مفتاحه يحتاج نسخة أحدث
 * لا بد أن يجد طريقاً للتحديث من هنا، لا بتحميل المثبّت يدوياً.
 */
function UpdateNow({ notify }: { notify: (m: string, ms?: number) => void }) {
  const api = typeof window !== 'undefined' ? window.ledger?.update : undefined;
  const [st, setSt] = useState<UpdateState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!api) return;
    api.getState().then(setSt).catch(() => {});
    return api.onStatus(setSt);
  }, [api]);
  if (!api) return null;

  const ready = st?.status === 'downloaded';
  const working = busy || st?.status === 'checking' || st?.status === 'downloading';
  const label = ready ? 'إعادة التشغيل والتثبيت'
    : st?.status === 'downloading' ? `جارٍ التنزيل ${st.percent ? Math.round(st.percent) + '%' : ''}`
    : st?.status === 'checking' ? 'جارٍ البحث…'
    : 'تحديث البرنامج';

  const go = async () => {
    setBusy(true);
    try {
      if (ready) { await flushNow(); await api.install(); return; }
      await api.check(); // النتيجة تصل عبر onStatus
    } catch (e) { notify(`تعذّر التحديث: ${(e as Error)?.message || ''}`, 6000); }
    finally { setBusy(false); }
  };

  const note = st?.status === 'not-available' ? `نسختك ${st.version} هي الأحدث`
    : st?.status === 'error' ? `تعذّر التحديث: ${st.error || 'تحقّق من الإنترنت'}`
    : st?.status === 'available' ? `يوجد تحديث ${st.newVersion || ''} — جارٍ التنزيل`
    : '';

  return (
    <span className="flex flex-col gap-1">
      <button type="button" onClick={() => void go()} disabled={working} data-testid="license-update"
        className={`px-4 py-3 rounded-xl font-black flex items-center gap-2 disabled:opacity-60 ${ready ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600'}`}>
        <Download className="w-4 h-4" /> {label}
      </button>
      {note && <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{note}</span>}
    </span>
  );
}
