import { useEffect, useState, type JSX } from 'react';
import { Network, Server, MonitorSmartphone, Laptop, Search, Copy, RefreshCw, CheckCircle2, AlertTriangle, Loader2, Wifi, WifiOff } from 'lucide-react';
import type { NetInfo } from '../storage/persistence';
import { flushNow } from '../storage/persistence';

/**
 * نسخة Pro — ربط عدة أجهزة على الشبكة المحلية.
 *  مستقل: الجهاز وحده | رئيسي: يحمل البيانات المشتركة | فرعي: يعمل على بيانات الرئيسي
 */
type Role = NetInfo['role'];

const card = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4';
const input = 'w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-slate-700 dark:text-slate-200';

export default function NetworkSettings({ notify }: { notify: (msg: string, ms?: number) => void }) {
  const api = typeof window !== 'undefined' ? window.ledger?.network : undefined;
  const [info, setInfo] = useState<NetInfo | null>(null);
  const [role, setRole] = useState<Role>('standalone');
  const [tag, setTag] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('47820');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [found, setFound] = useState<{ host: string; port: number; name: string }[] | null>(null);

  const load = async () => {
    if (!api) return;
    const i = await api.info();
    setInfo(i);
    setRole(i.role); setTag(i.tag || (i.role === 'client' ? 'B' : 'A')); setDeviceName(i.deviceName);
    setHost(i.host); setPort(String(i.port || 47820));
  };
  useEffect(() => { void load(); const t = setInterval(() => { void api?.info().then(setInfo).catch(() => {}); }, 5000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!api) {
    return <div className="p-6 text-sm text-slate-500" dir="rtl">ربط الأجهزة متاح في نسخة سطح المكتب فقط.</div>;
  }

  const restart = async () => {
    await flushNow();
    await api.relaunch();
  };

  const save = async (regenerateToken = false) => {
    setBusy(true); setMsg(null);
    try {
      const keepToken = role === 'client' && !token.trim() && info?.role === 'client' && info.hasToken;
      if (role === 'client' && !regenerateToken && !keepToken) {
        const t = await api.test({ host: host.trim(), port: Number(port), token });
        if (!t.ok) { setMsg({ ok: false, text: t.error || 'تعذّر الاتصال' }); return; }
        if (t.tag && t.tag.toUpperCase() === tag.trim().toUpperCase()) { setMsg({ ok: false, text: `الرمز ${tag} مستخدم للجهاز الرئيسي — اختر رمزاً آخر` }); return; }
      }
      if (info && info.role !== role && role === 'client') {
        if (!window.confirm('بعد الربط كجهاز فرعي سيعمل هذا الجهاز على بيانات الجهاز الرئيسي.\nبيانات هذا الجهاز الحالية لا تُحذف، لكنها لن تظهر ما دام مربوطاً.\nمتابعة؟')) return;
      }
      if (info && info.role !== role && role === 'server') {
        if (!window.confirm('سيصبح هذا الجهاز «رئيسياً»: بياناته الحالية تصبح مشتركة مع الأجهزة الفرعية.\nيجب أن يبقى يعمل أثناء عمل الأجهزة الأخرى.\nمتابعة؟')) return;
      }
      const r = await api.configure({ role, tag: tag.trim(), deviceName: deviceName.trim(), host: host.trim(), port: Number(port), token: role === 'client' && token.trim() ? token : undefined, regenerateToken });
      if (!r.ok) { setMsg({ ok: false, text: r.error || 'تعذّر الحفظ' }); return; }
      await load();
      if (r.needsRestart) {
        if (window.confirm('تم الحفظ. يلزم إعادة تشغيل البرنامج لتطبيق الإعدادات. إعادة التشغيل الآن؟')) await restart();
        else setMsg({ ok: true, text: 'تم الحفظ — تُطبَّق بعد إعادة تشغيل البرنامج' });
      } else {
        setMsg({ ok: true, text: 'تم الحفظ' });
      }
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    setBusy(true); setFound(null);
    try { setFound(await api.discover()); } finally { setBusy(false); }
  };

  const copy = (t: string) => { void navigator.clipboard?.writeText(t); notify('تم النسخ'); };
  const roles: { id: Role; title: string; desc: string; icon: JSX.Element }[] = [
    { id: 'standalone', title: 'جهاز مستقل', desc: 'يعمل وحده ببياناته (الوضع الافتراضي)', icon: <Laptop className="w-5 h-5" /> },
    { id: 'server', title: 'جهاز رئيسي', desc: 'يحمل البيانات المشتركة وتتصل به الأجهزة الأخرى', icon: <Server className="w-5 h-5" /> },
    { id: 'client', title: 'جهاز فرعي', desc: 'كاشير إضافي يعمل على بيانات الجهاز الرئيسي', icon: <MonitorSmartphone className="w-5 h-5" /> },
  ];
  const active = info?.role === 'server' ? info.server : null;
  const conn = info?.role === 'client' ? info.connection : null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5 text-right" dir="rtl">
      <div className="flex items-center gap-3">
        <Network className="w-7 h-7 text-indigo-600" />
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">ربط الأجهزة <span className="text-xs align-middle bg-amber-400 text-black font-black rounded-md px-1.5 py-0.5 mr-1">PRO</span></h1>
          <p className="text-xs text-slate-500">عدة أجهزة كاشير على نفس الشبكة المحلية (نفس الراوتر) تعمل على نفس الأصناف والمخزون والعملاء والفواتير — بدون إنترنت.</p>
        </div>
      </div>

      {/* الحالة الحالية */}
      {info && info.role !== 'standalone' && (
        <div className={`${card} ${active?.error || (conn && !conn.connected) ? 'border-rose-300' : 'border-emerald-300'}`}>
          {info.role === 'server' && active && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-black">
                {active.listening && !active.error ? <Wifi className="w-5 h-5 text-emerald-600" /> : <WifiOff className="w-5 h-5 text-rose-600" />}
                {active.error ? `الخدمة متوقفة: ${active.error}` : active.listening ? 'الجهاز الرئيسي يعمل وينتظر الأجهزة الفرعية' : 'جارٍ التشغيل...'}
              </div>
              <div className="grid sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3"><div className="text-xs text-slate-500">عنوان هذا الجهاز</div><div className="font-mono font-black" dir="ltr">{(active.ips[0] || '—')}:{active.port}</div>{active.ips.length > 1 && <div className="text-[11px] text-slate-400" dir="ltr">{active.ips.slice(1).join(' · ')}</div>}</div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3"><div className="text-xs text-slate-500">رمز الربط</div><div className="flex items-center gap-2"><span className="font-mono font-black tracking-widest" dir="ltr">{info.token}</span><button onClick={() => copy(info.token)} title="نسخ"><Copy className="w-4 h-4" /></button></div></div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3"><div className="text-xs text-slate-500">رمز هذا الجهاز في الفواتير</div><div className="font-mono font-black">{info.tag}</div></div>
              </div>
              <div>
                <div className="text-sm font-black mb-2">الأجهزة الفرعية ({info.clients.length})</div>
                {info.clients.length === 0 ? <div className="text-xs text-slate-500">لم يتصل أي جهاز بعد.</div> : (
                  <div className="space-y-1">
                    {info.clients.map((c) => {
                      const ago = c.lastSeen ? Math.round((Date.now() - Date.parse(c.lastSeen)) / 1000) : null;
                      const online = ago !== null && ago < 60;
                      return (
                        <div key={c.deviceId} className="flex items-center gap-3 text-sm rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2">
                          <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          <span className="font-black">{c.name || 'جهاز'}</span>
                          <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 rounded px-1.5">{c.tag || '?'}</span>
                          <span className="text-xs text-slate-500 font-mono" dir="ltr">{c.ip}</span>
                          <span className="text-xs text-slate-400 mr-auto">{online ? 'متصل' : 'غير متصل'}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-[11px] text-slate-500">عند أول تشغيل قد يسأل جدار حماية ويندوز: اختر «السماح» للشبكات الخاصة. يجب أن يبقى هذا الجهاز يعمل أثناء عمل الأجهزة الفرعية.</p>
            </div>
          )}
          {info.role === 'client' && conn && (
            <div className="flex items-center gap-2 font-black">
              {conn.connected ? <Wifi className="w-5 h-5 text-emerald-600" /> : <WifiOff className="w-5 h-5 text-rose-600" />}
              {conn.connected ? `متصل بالجهاز الرئيسي (${conn.host})` : (conn.error || `غير متصل بالجهاز الرئيسي (${conn.host})`)}
              <span className="text-xs font-normal text-slate-500 mr-auto">رمز هذا الجهاز في الفواتير: <b className="font-mono">{info.tag}</b></span>
            </div>
          )}
        </div>
      )}

      {/* اختيار الدور */}
      <div className={card}>
        <div className="text-sm font-black">دور هذا الجهاز</div>
        <div className="grid sm:grid-cols-3 gap-3">
          {roles.map((r) => (
            <button key={r.id} type="button" onClick={() => { setRole(r.id); setMsg(null); if (r.id !== 'standalone' && !tag) setTag(r.id === 'server' ? 'A' : 'B'); }}
              className={`text-right p-4 rounded-xl border transition ${role === r.id ? 'border-indigo-500 bg-indigo-500/10 ring-2 ring-indigo-500/30' : 'border-slate-200 dark:border-slate-800 hover:border-indigo-400'}`}>
              <div className="flex items-center gap-2 font-black text-slate-800 dark:text-slate-100">{r.icon}{r.title}</div>
              <div className="text-xs text-slate-500 mt-1">{r.desc}</div>
            </button>
          ))}
        </div>

        {role !== 'standalone' && (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-bold text-slate-500">اسم الجهاز (اختياري)<input className={input} value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="مثل: كاشير 2 — أو اتركه فارغاً" data-testid="net-device-name" /><span className="block text-[11px] font-semibold text-slate-400">يظهر في التقارير والفواتير: «جهاز {tag || 'B'}{deviceName.trim() ? ` — ${deviceName.trim()}` : ''}»</span></label>
            <label className="space-y-1 text-xs font-bold text-slate-500">رمز الجهاز في أرقام الفواتير (حرف أو رقم)
              <input className={`${input} font-mono uppercase`} maxLength={2} value={tag} onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="A" />
            </label>
          </div>
        )}

        {role === 'client' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button type="button" disabled={busy} onClick={search} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} بحث عن الجهاز الرئيسي
              </button>
              {found && found.length === 0 && <span className="text-xs text-slate-500">لم يُعثر على جهاز — أدخل العنوان يدوياً</span>}
            </div>
            {found && found.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {found.map((f) => (
                  <button key={`${f.host}:${f.port}`} type="button" onClick={() => { setHost(f.host); setPort(String(f.port)); }} className={`px-3 py-2 rounded-xl border text-sm ${host === f.host ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-200 dark:border-slate-700'}`}>
                    <b>{f.name}</b> <span className="font-mono text-xs" dir="ltr">{f.host}:{f.port}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2">عنوان الجهاز الرئيسي (IP)<input className={`${input} font-mono`} dir="ltr" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.10" /></label>
              <label className="space-y-1 text-xs font-bold text-slate-500">المنفذ<input className={`${input} font-mono`} dir="ltr" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} /></label>
            </div>
            <label className="space-y-1 text-xs font-bold text-slate-500 block">رمز الربط (يظهر في الجهاز الرئيسي)
              <input className={`${input} font-mono uppercase tracking-widest`} dir="ltr" value={token} onChange={(e) => setToken(e.target.value)} placeholder={info?.hasToken && info.role === 'client' ? '•••• (محفوظ — اتركه فارغاً للإبقاء)' : 'XXXX-XXXX-XXXX'} />
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button type="button" disabled={busy || (role === 'client' && !token && !(info?.role === 'client' && info.hasToken))} onClick={() => save(false)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} حفظ
          </button>
          {info?.role === 'server' && role === 'server' && (
            <button type="button" disabled={busy} onClick={() => { if (window.confirm('توليد رمز ربط جديد يفصل كل الأجهزة الفرعية حتى تُدخل الرمز الجديد. متابعة؟')) void save(true); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-bold"><RefreshCw className="w-4 h-4" /> رمز ربط جديد</button>
          )}
          {msg && <span className={`text-sm font-bold flex items-center gap-1 ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}{msg.text}</span>}
        </div>
      </div>

      <div className={`${card} text-xs text-slate-600 dark:text-slate-400 space-y-2`}>
        <div className="font-black text-sm text-slate-800 dark:text-slate-200">كيف يعمل الربط</div>
        <ul className="list-disc pr-5 space-y-1">
          <li>كل الأجهزة تشترك في الأصناف والمخزون والعملاء والموردين والفواتير والمشتريات وعروض الأسعار والطلبات المعلقة والمستخدمين وإعدادات المنشأة.</li>
          <li>البيع من جهازين في نفس اللحظة لا يضيع شيئاً: المخزون ورصيد العميل يُخصمان من الجهازين معاً.</li>
          <li>الطابعات والميزان وشاشة العميل والمظهر إعدادات خاصة بكل جهاز.</li>
          <li>لكل جهاز رمز في أرقام فواتيره (INV-A-…، INV-B-…) فلا يتكرر رقم بين جهازين.</li>
          <li>الفوترة الإلكترونية: كل جهاز يُسجَّل في منصة فاتورة بشهادة خاصة به (كما تشترط الهيئة).</li>
          <li>كل جهاز يحتاج تفعيل الترخيص الخاص به. النسخ الاحتياطية تؤخذ على الجهاز الرئيسي (حيث البيانات).</li>
          <li>إن انقطع الاتصال بالرئيسي يظهر تنبيه، وتُحفظ التغييرات تلقائياً فور عودة الاتصال (لا تغلق البرنامج قبلها).</li>
        </ul>
      </div>
    </div>
  );
}
