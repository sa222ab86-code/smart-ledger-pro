import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, UserCircle, ShieldCheck, Keyboard, Minus, Power, Minimize2, KeyRound, Copy, X } from 'lucide-react';
import QRCode from 'qrcode';
import OnScreenKeyboard from './OnScreenKeyboard';
import type { AppUser } from '../types';
import { hasPassword, isActiveAdmin, ROLE_LABELS, verifyPassword, withPassword } from '../utils/auth';

/**
 * شاشة الدخول:
 *  - اختيار المستخدم من بطاقات (أسرع للكاشير) ثم كلمة المرور
 *  - أول تشغيل بعد التحديث (لا يوجد مدير له كلمة مرور): إنشاء كلمة مرور المدير
 *  - لوحة مفاتيح على الشاشة لأجهزة اللمس
 */
export default function LoginScreen({
  users, iconSrc, companyName, lastUserId, onLogin, onSetupAdmin, onResetPassword, fullscreen, onExitFullscreen, language, onToggleLanguage,
}: {
  /** لغة الواجهة الحالية وزر التبديل (يظهر أعلى الشاشة) */
  language?: 'ar' | 'en';
  onToggleLanguage?: () => void;
  users: AppUser[];
  iconSrc: string;
  companyName?: string;
  lastUserId?: string;
  onLogin: (u: AppUser) => void;
  /** إعداد أول مدير: يُرجع المستخدم بعد حفظ كلمة المرور */
  onSetupAdmin: (u: AppUser) => void;
  /** نسيت كلمة المرور: يُرجع المستخدم بكلمة المرور الجديدة بعد التحقق برمز مصدر المفاتيح */
  onResetPassword?: (u: AppUser) => void;
  /** وضع ملء الشاشة مفعّل (لا يظهر شريط عنوان النافذة) */
  fullscreen?: boolean;
  onExitFullscreen?: () => void;
}) {
  const active = useMemo(() => users.filter((u) => u.status === 'active'), [users]);
  const needsSetup = !users.some((u) => isActiveAdmin(u) && hasPassword(u));
  const setupTarget = users.find(isActiveAdmin) || users.find((u) => u.role === 'admin');

  const [selectedId, setSelectedId] = useState<string>(() =>
    (lastUserId && active.some((u) => u.id === lastUserId) ? lastUserId : active[0]?.id) || ''
  );
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [forgot, setForgot] = useState(false);
  const canReset = !!(onResetPassword && window.ledger?.license?.pwResetChallenge);
  const pwRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // لوحة المفاتيح على الشاشة: تكتب في الحقل النشط (كلمة المرور / التأكيد)
  const [activeField, setActiveField] = useState<'password' | 'confirm'>('password');
  const [showKeyboard, setShowKeyboard] = useState<boolean>(() => {
    try { return localStorage.getItem('login.osk') !== '0'; } catch { return true; }
  });
  const toggleKeyboard = () => setShowKeyboard((v) => { try { localStorage.setItem('login.osk', v ? '0' : '1'); } catch { /* تجاهل */ } return !v; });
  const setActive = (fn: (v: string) => string) => (activeField === 'confirm' ? setConfirm(fn) : setPassword(fn));

  useEffect(() => { pwRef.current?.focus(); setActiveField('password'); }, [selectedId, needsSetup]);

  const selected = active.find((u) => u.id === selectedId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (needsSetup) {
      if (password.length < 4) return setError('كلمة المرور يجب أن تكون 4 أحرف أو أرقام على الأقل');
      if (password !== confirm) return setError('كلمتا المرور غير متطابقتين');
      const base: AppUser = setupTarget
        ? { ...setupTarget, role: 'admin', status: 'active' }
        : { id: 'u1', username: 'admin', fullName: 'المدير العام', role: 'admin', status: 'active' };
      onSetupAdmin(withPassword(base, password));
      return;
    }
    if (!selected) return;
    if (!hasPassword(selected)) return setError('لم تُعيَّن كلمة مرور لهذا المستخدم — اطلب من المدير تعيينها من شاشة المستخدمين');
    if (!verifyPassword(selected, password)) {
      setPassword('');
      return setError('كلمة المرور غير صحيحة');
    }
    onLogin(selected);
  };

  const field = 'w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:border-cyan-400 font-mono tracking-widest text-center';

  return (
    // الشاشة تتمرر إن طال المحتوى (لوحة المفاتيح في وضع اللمس) بدل أن تُقص من الأسفل
    <div className="h-screen overflow-y-auto bg-slate-950 relative" dir="rtl">
      <div className="min-h-full flex items-center justify-center p-4 pt-16">
      {/* أزرار النافذة: ضرورية في ملء الشاشة (لا شريط عنوان ولا شريط مهام) — تصغير، إنهاء ملء الشاشة، إغلاق البرنامج */}
      {window.ledger?.app.quit && (
        <div className="fixed top-3 left-3 z-10 flex items-center gap-2" data-testid="login-window-controls">
          <button type="button" onClick={() => void window.ledger?.app.minimize?.()} title="تصغير البرنامج" className="h-10 px-3 rounded-full border-2 border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-1.5 text-xs font-bold cursor-pointer"><Minus className="w-4 h-4" /> تصغير</button>
          {fullscreen && onExitFullscreen && (
            <button type="button" onClick={onExitFullscreen} title="إظهار شريط المهام" data-testid="login-exit-fullscreen" className="h-10 px-3 rounded-full border-2 border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-1.5 text-xs font-bold cursor-pointer"><Minimize2 className="w-4 h-4" /> إنهاء ملء الشاشة</button>
          )}
          <button type="button" onClick={() => { if (window.confirm('إغلاق البرنامج؟')) void window.ledger?.app.quit?.(); else window.ledger?.app.refocus?.(); }} title="إغلاق البرنامج" data-testid="login-quit" className="h-10 px-3 rounded-full border-2 border-rose-500/60 text-rose-300 hover:bg-rose-500/15 flex items-center gap-1.5 text-xs font-bold cursor-pointer"><Power className="w-4 h-4" /> إغلاق البرنامج</button>
        </div>
      )}
      {onToggleLanguage && (
        <button type="button" onClick={onToggleLanguage} data-testid="login-lang" translate="no"
          className="fixed top-3 right-3 z-10 h-10 px-4 rounded-full border-2 border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-black cursor-pointer">
          {language === 'en' ? 'العربية' : 'English'}
        </button>
      )}
      <form ref={formRef} onSubmit={submit} className={`login-card bg-slate-900 border border-slate-800 w-full ${showKeyboard ? 'max-w-lg osk-on' : 'max-w-lg'} rounded-3xl p-8 shadow-2xl text-white text-right`}>
        {/* مع لوحة المفاتيح على شاشة عريضة: عمودان (الحقول | اللوحة) فلا تُدفع اللوحة خارج الشاشة */}
        <div className="login-cols">
        <div className="login-main space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={iconSrc} alt="" className="w-16 h-16 rounded-2xl object-contain" />
          <div className="text-center">
            <h1 className="text-2xl font-black">الدفتر الذكي <span className="text-xs align-middle bg-amber-400 text-black font-black rounded-md px-1.5 py-0.5">PRO</span></h1>
            {companyName && <p className="text-sm font-bold text-brass-400 mt-0.5">{companyName}</p>}
          </div>
        </div>

        {needsSetup ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-cyan-900/40 border border-cyan-700/50 rounded-2xl p-4">
              <ShieldCheck className="w-6 h-6 text-cyan-300 shrink-0 mt-0.5" />
              <div>
                <p className="font-black">إنشاء كلمة مرور المدير</p>
                <p className="text-xs text-slate-300 mt-1 font-bold">
                  أول مرة بعد التحديث: اختر كلمة مرور لحساب «{setupTarget?.fullName || 'المدير العام'}». ستحتاجها للدخول ولإدارة المستخدمين والموافقة على العمليات.
                </p>
              </div>
            </div>
            <input ref={pwRef} type="password" value={password} onFocus={() => setActiveField('password')} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة المرور الجديدة" className={`${field} ${activeField === 'password' ? 'border-cyan-400' : ''}`} autoComplete="new-password" />
            <input type="password" value={confirm} onFocus={() => setActiveField('confirm')} onChange={(e) => setConfirm(e.target.value)} placeholder="تأكيد كلمة المرور" className={`${field} ${activeField === 'confirm' ? 'border-cyan-400' : ''}`} autoComplete="new-password" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
              {active.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { setSelectedId(u.id); setPassword(''); setError(''); }}
                  className={`p-3 rounded-2xl border-2 text-right transition cursor-pointer ${
                    u.id === selectedId ? 'border-cyan-400 bg-cyan-900/40' : 'border-slate-700 hover:border-slate-500 bg-slate-800/60'
                  }`}
                >
                  <UserCircle className={`w-6 h-6 mb-1 ${u.id === selectedId ? 'text-cyan-300' : 'text-slate-400'}`} />
                  <div className="font-black text-sm truncate">{u.fullName}</div>
                  <div className="text-[11px] text-slate-400 font-bold">{ROLE_LABELS[u.role]}</div>
                </button>
              ))}
            </div>
            <div className="relative">
              <input
                ref={pwRef}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setActiveField('password')}
                placeholder="كلمة المرور"
                className={field}
                autoComplete="current-password"
              />
              <Lock className="w-5 h-5 text-slate-500 absolute right-4 top-1/2 -translate-y-1/2" />
            </div>
            {canReset && selected && (
              <button type="button" onClick={() => { setError(''); setForgot(true); }} data-testid="login-forgot"
                className="w-full text-center text-xs font-bold text-cyan-300 hover:text-cyan-200 underline underline-offset-4 cursor-pointer">
                نسيت كلمة المرور؟
              </button>
            )}
          </div>
        )}

        {error && <p className="text-sm font-bold text-rose-300 text-center">{error}</p>}
        </div>
        <div className="login-kbd space-y-4 mt-6">

        {showKeyboard ? (
          <OnScreenKeyboard
            onKey={(ch) => { setError(''); setActive((v) => v + ch); }}
            onBackspace={() => setActive((v) => v.slice(0, -1))}
            onClear={() => setActive(() => '')}
            onEnter={() => formRef.current?.requestSubmit()}
          />
        ) : (
          <button type="submit" disabled={!needsSetup && !selected} className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-black rounded-xl text-lg disabled:opacity-40 cursor-pointer">
            {needsSetup ? 'حفظ والدخول' : 'دخول'}
          </button>
        )}
        <button type="button" onClick={toggleKeyboard} className="w-full flex items-center justify-center gap-2 text-xs font-bold text-slate-400 hover:text-white" data-testid="osk-toggle">
          <Keyboard className="w-4 h-4" /> {showKeyboard ? 'إخفاء لوحة المفاتيح' : 'إظهار لوحة المفاتيح على الشاشة'}
        </button>
        </div>
        </div>
      </form>
      </div>
      {forgot && selected && onResetPassword && (
        <ForgotPassword user={selected} onClose={() => setForgot(false)} onDone={(u) => { setForgot(false); onResetPassword(u); }} />
      )}
    </div>
  );
}

/**
 * نسيت كلمة المرور: باركود طلب يقرؤه مصدر المفاتيح ← رمز من 8 خانات ← كلمة مرور جديدة.
 * الرمز لا يولّده إلا صاحب المفتاح الخاص للترخيص، والطلب لمرة واحدة وصالح 30 دقيقة.
 */
function ForgotPassword({ user, onClose, onDone }: { user: AppUser; onClose: () => void; onDone: (u: AppUser) => void }) {
  const [req, setReq] = useState('');
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const newRequest = async () => {
    setErr(''); setCode(''); setQr(''); setReq('');
    const r = await window.ledger?.license?.pwResetChallenge?.({ user: user.id, name: user.fullName || user.username });
    if (!r?.ok || !r.request) return setErr(r?.error || 'تعذّر إنشاء الطلب');
    setReq(r.request);
    try { setQr(await QRCode.toDataURL(r.request, { margin: 2, width: 420, errorCorrectionLevel: 'L' })); } catch { /* يبقى النص */ }
  };
  useEffect(() => { void newRequest(); }, [user.id]);

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr(''); setBusy(true);
    try {
      const r = await window.ledger?.license?.pwResetVerify?.({ user: user.id, code });
      if (r?.ok) setVerified(true); else setErr(r?.error || 'الرمز غير صحيح');
    } finally { setBusy(false); }
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 4) return setErr('كلمة المرور يجب أن تكون 4 أحرف أو أرقام على الأقل');
    if (pw !== pw2) return setErr('كلمتا المرور غير متطابقتين');
    onDone(withPassword(user, pw));
  };
  const copy = async () => {
    try { await (window.ledger?.clipboard?.writeText(req) ?? navigator.clipboard.writeText(req)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* تجاهل */ }
  };
  const field = 'w-full bg-slate-950 border border-slate-600 rounded-xl px-4 py-3 text-white text-lg focus:outline-none focus:border-cyan-400 font-mono tracking-widest text-center';

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" data-testid="pwreset-modal">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 text-white shadow-2xl max-h-[96vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-cyan-300" /><h2 className="font-black text-lg">استرجاع كلمة المرور</h2></div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer" aria-label="إغلاق"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-xs text-slate-400 font-bold mb-4">المستخدم: <span className="text-white">{user.fullName || user.username}</span></p>

        {!verified ? (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm font-bold text-slate-300 leading-relaxed">أرسل الباركود (أو النص أسفله) للدعم الفني لإعادة تعيين كلمة المرور، ثم أدخل الرمز الذي يصلك منهم.</p>
            <div className="flex justify-center">
              {qr ? <img src={qr} alt="" className="w-64 h-64 rounded-xl bg-white p-2" data-testid="pwreset-qr" />
                : <div className="w-64 h-64 rounded-xl bg-slate-800 animate-pulse" />}
            </div>
            {req && (
              <div className="flex items-center gap-2">
                <code dir="ltr" className="flex-1 text-[10px] text-slate-400 bg-slate-950 rounded-lg p-2 break-all max-h-14 overflow-y-auto" data-testid="pwreset-request">{req}</code>
                <button type="button" onClick={copy} className="shrink-0 px-3 py-2 rounded-lg border border-slate-600 text-xs font-bold hover:bg-slate-800 flex items-center gap-1 cursor-pointer"><Copy className="w-3.5 h-3.5" />{copied ? 'نُسخ' : 'نسخ'}</button>
              </div>
            )}
            <input autoFocus dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" maxLength={12} className={field} data-testid="pwreset-code" />
            {err && <p className="text-sm font-bold text-rose-300 text-center">{err}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={busy || code.replace(/[^0-9A-Za-z]/g, '').length < 8} className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-black disabled:opacity-40 cursor-pointer" data-testid="pwreset-verify">تحقق</button>
              <button type="button" onClick={() => void newRequest()} className="px-4 py-3 rounded-xl border border-slate-600 text-sm font-bold hover:bg-slate-800 cursor-pointer">طلب جديد</button>
            </div>
            <p className="text-[11px] text-slate-500 font-bold text-center">الطلب صالح 30 دقيقة ولمرة واحدة</p>
          </form>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <p className="text-sm font-bold text-emerald-300 text-center">✓ تم التحقق — اختر كلمة مرور جديدة</p>
            <input autoFocus type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="كلمة المرور الجديدة" className={field} autoComplete="new-password" data-testid="pwreset-new" />
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="تأكيد كلمة المرور" className={field} autoComplete="new-password" data-testid="pwreset-confirm" />
            {err && <p className="text-sm font-bold text-rose-300 text-center">{err}</p>}
            <button type="submit" className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-black cursor-pointer" data-testid="pwreset-save">حفظ والدخول</button>
          </form>
        )}
      </div>
    </div>
  );
}
