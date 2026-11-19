import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Building2, Store, Laptop, Copy, RefreshCw, Plus, Trash2, Pencil, KeyRound, PauseCircle, PlayCircle, Wifi, WifiOff, Loader2,
  CheckCircle2, AlertTriangle, Link2, Unlink, Eye, X, Globe, ShieldCheck, BarChart3,
} from 'lucide-react';
import type { BranchesInfo, BranchMode, BranchRow } from '../storage/persistence';
import { flushNow } from '../storage/persistence';
import type { Invoice, Product } from '../types';
import { round2 } from '../utils/invoiceMath';

/**
 * نسخة Pro — ربط الفروع عن بعد عبر الإنترنت.
 *  المركز: يُنشئ رمز ربط لكل فرع ويستقبل مستنداته ويرسل له الأصناف والأسعار
 *  الفرع : يعمل على قاعدته المحلية (حتى بلا إنترنت) ويزامن تلقائياً عند توفر الاتصال
 */
const card = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4';
const input = 'w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-teal-500 text-slate-700 dark:text-slate-200';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary = `${btn} bg-teal-600 hover:bg-teal-700 text-white`;
const btnGhost = `${btn} border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800`;
const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00');

function ago(iso: string | null | undefined): { text: string; online: boolean } {
  if (!iso) return { text: 'لم يتصل بعد', online: false };
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  const text = s < 60 ? 'الآن' : s < 3600 ? `قبل ${Math.round(s / 60)} دقيقة` : s < 86400 ? `قبل ${Math.round(s / 3600)} ساعة` : `قبل ${Math.round(s / 86400)} يوم`;
  return { text, online: s < 180 };
}

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** ملخص مبيعات ومخزون فرع من بياناته المرفوعة */
function summarize(invoices: Invoice[], products: Product[]) {
  const t = today(), m = t.slice(0, 7);
  let dayTotal = 0, monthTotal = 0, dayCount = 0, monthCount = 0, returns = 0, vat = 0;
  for (const inv of invoices) {
    const d = String(inv.date || '');
    const total = Number(inv.total) || 0;
    if (d.startsWith(m)) { monthTotal += total; vat += Number(inv.tax) || 0; if (inv.docType !== 'return') monthCount++; else returns += -total; }
    if (d.startsWith(t)) { dayTotal += total; if (inv.docType !== 'return') dayCount++; }
  }
  let stockValue = 0, low = 0, out = 0;
  for (const p of products) {
    if (p.isService || p.isBundle) continue;
    const q = Number(p.stock) || 0;
    if (q > 0) stockValue += q * (Number(p.cost) || 0);
    if (q <= 0) out++; else if (p.minStock != null && q <= p.minStock) low++;
  }
  const last = invoices.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15);
  return { dayTotal: round2(dayTotal), monthTotal: round2(monthTotal), dayCount, monthCount, returns: round2(returns), vat: round2(vat), stockValue: round2(stockValue), low, out, last, products: products.length, invoices: invoices.length };
}

export default function BranchesManager({ notify, onOpenAccounting }: { notify: (msg: string, ms?: number) => void; onOpenAccounting?: () => void }) {
  const api = typeof window !== 'undefined' ? window.ledger?.branches : undefined;
  const [info, setInfo] = useState<BranchesInfo | null>(null);
  const [mode, setMode] = useState<BranchMode>('none');
  const [hqName, setHqName] = useState('');
  const [publicHost, setPublicHost] = useState('');
  const [relayUrl, setRelayUrl] = useState('');
  const [port, setPort] = useState('47830');
  const [interval, setIntervalSec] = useState('60');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [shownCode, setShownCode] = useState<{ name: string; code: string } | null>(null);
  const [view, setView] = useState<BranchRow | null>(null);
  const [overview, setOverview] = useState<Record<string, ReturnType<typeof summarize>> | null>(null);

  const load = async (first = false) => {
    if (!api) return;
    const i = await api.info();
    setInfo(i);
    if (first) {
      setMode(i.mode); setHqName(i.hq?.name || ''); setPublicHost(i.hq?.publicHost || ''); setRelayUrl(i.hq?.relay?.url || ''); setPort(String(i.hq?.port || i.defaultPort)); setIntervalSec(String(i.intervalSec));
    }
  };
  useEffect(() => {
    if (!api) return undefined;
    void load(true);
    const t = setInterval(() => { void load(); }, 5000);
    const u1 = api.onStatus(() => { void load(); });
    const u2 = api.onChanged(() => { void load(); });
    return () => { clearInterval(t); u1(); u2(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!api) return <div className="p-6 text-sm text-slate-500" dir="rtl">ربط الفروع متاح في نسخة سطح المكتب فقط.</div>;

  const restartAsk = async (text: string) => {
    if (window.confirm(`${text}\nيلزم إعادة تشغيل البرنامج لتطبيق الإعدادات. إعادة التشغيل الآن؟`)) { await flushNow(); await window.ledger?.network?.relaunch(); }
    else setMsg({ ok: true, text: `${text} — تُطبَّق بعد إعادة تشغيل البرنامج` });
  };
  const act = async (fn: () => Promise<void>) => { setBusy(true); setMsg(null); try { await fn(); } catch (e) { setMsg({ ok: false, text: String((e as Error)?.message || e) }); } finally { setBusy(false); } };
  const copy = (t: string) => { void navigator.clipboard?.writeText(t); notify('تم النسخ'); };

  const saveHq = () => act(async () => {
    if (info?.mode === 'branch' && mode === 'hq') { setMsg({ ok: false, text: 'هذا الجهاز مرتبط كفرع — ألغِ الربط أولاً' }); return; }
    if (mode === 'hq' && info?.mode !== 'hq' && !window.confirm('سيصبح هذا الجهاز «المركز الرئيسي»: يستقبل بيانات الفروع ويرسل لها الأصناف والأسعار والعملاء والموردين ودليل الحسابات.\nيجب أن يبقى يعمل ومتصلاً بالإنترنت أثناء المزامنة. متابعة؟')) return;
    const r = await api.configure({ mode, hqName, publicHost, port: Number(port), intervalSec: Number(interval), relayUrl });
    if (!r.ok) { setMsg({ ok: false, text: r.error || 'تعذّر الحفظ' }); return; }
    await load();
    if (r.needsRestart) await restartAsk('تم الحفظ'); else setMsg({ ok: true, text: 'تم الحفظ' });
  });

  const joinBranch = () => act(async () => {
    const t = await api.testLink(link);
    if (!t.ok) { setMsg({ ok: false, text: t.error || 'تعذّر الاتصال بالمركز' }); return; }
    if (!window.confirm(`تم الاتصال بالمركز «${t.hqName}».\nسيُربط هذا الجهاز كفرع «${t.branch?.name || ''}» (${t.branch?.code || ''}):\n• يرفع فواتيره ومشترياته وحركات صندوقه للمركز\n• يستلم من المركز الأصناف والأسعار والمجموعات والعملاء والموردين والعروض ودليل الحسابات\n• مخزون هذا الفرع وتكلفته وطابعات المطبخ تبقى خاصة به\nمتابعة؟`)) return;
    const r = await api.join(link);
    if (!r.ok) { setMsg({ ok: false, text: r.error || 'تعذّر الربط' }); return; }
    setLink('');
    await load();
    await restartAsk(`تم ربط هذا الجهاز بالمركز «${r.hqName || ''}»`);
  });

  const leave = () => act(async () => {
    if (!window.confirm('إلغاء ربط هذا الفرع بالمركز؟\nبيانات هذا الجهاز تبقى كما هي، وتتوقف المزامنة. يمكنك الربط من جديد برمز جديد.')) return;
    const r = await api.configure({ mode: 'none' });
    if (!r.ok) { setMsg({ ok: false, text: r.error || 'تعذّر' }); return; }
    await load(true);
    await restartAsk('تم إلغاء الربط');
  });

  const syncNow = () => act(async () => {
    const r = await api.syncNow();
    if (r.ok) setMsg({ ok: true, text: `تمت المزامنة — أُرسل ${r.up || 0} واستُلم ${r.down || 0}` });
    else setMsg({ ok: false, text: r.error || 'تعذّرت المزامنة' });
    await load();
  });

  const addBranch = () => act(async () => {
    const r = await api.add({ name: newName, code: newCode });
    if (!r.ok) { setMsg({ ok: false, text: r.error || 'تعذّر' }); return; }
    setNewName(''); setNewCode('');
    setShownCode({ name: r.branch.name, code: r.linkCode });
    await load();
  });
  const showLink = (b: BranchRow) => act(async () => { const r = await api.linkCode(b.id); if (r.ok) setShownCode({ name: b.name, code: r.linkCode }); else setMsg({ ok: false, text: r.error || '' }); });
  const rekey = (b: BranchRow) => act(async () => {
    if (!window.confirm(`إصدار مفتاح جديد لفرع «${b.name}»؟\nيتوقف الرمز القديم فوراً (مفيد عند فقد جهاز أو تغيير موظف)، ويلزم لصق الرمز الجديد في جهاز الفرع.`)) return;
    const r = await api.rekey(b.id); if (r.ok) setShownCode({ name: b.name, code: r.linkCode }); else setMsg({ ok: false, text: r.error || '' });
    await load();
  });
  const toggle = (b: BranchRow) => act(async () => { await api.setActive(b.id, b.status !== 'active'); await load(); });
  const rename = (b: BranchRow) => act(async () => {
    const name = window.prompt('اسم الفرع', b.name); if (name == null) return;
    const code = window.prompt('رمز الفرع (يظهر في التقارير)', b.code); if (code == null) return;
    const r = await api.update(b.id, { name, code }); if (!r.ok) setMsg({ ok: false, text: r.error || '' });
    await load();
  });
  const remove = (b: BranchRow) => act(async () => {
    if (!window.confirm(`حذف فرع «${b.name}» من المركز؟ يتوقف ربطه فوراً.`)) return;
    const purge = window.confirm('حذف نسخة بيانات هذا الفرع المحفوظة في المركز أيضاً؟\n(موافق = حذفها، إلغاء = الاحتفاظ بها للتقارير)');
    const r = await api.remove(b.id, purge); if (!r.ok) setMsg({ ok: false, text: r.error || '' });
    await load();
  });
  const loadOverview = () => act(async () => {
    const out: Record<string, ReturnType<typeof summarize>> = {};
    for (const b of info?.branches || []) {
      const d = await api.data(b.id, ['invoices', 'products']);
      out[b.id] = summarize((d.invoices || []) as Invoice[], (d.products || []) as Product[]);
    }
    setOverview(out);
  });

  const modes: { id: BranchMode; title: string; desc: string; icon: ReactNode }[] = [
    { id: 'none', title: 'بدون فروع', desc: 'منشأة بموقع واحد (الوضع الافتراضي)', icon: <Laptop className="w-5 h-5" /> },
    { id: 'hq', title: 'المركز الرئيسي', desc: 'يدير الأصناف والأسعار ويستقبل بيانات الفروع', icon: <Building2 className="w-5 h-5" /> },
    { id: 'branch', title: 'فرع', desc: 'يرتبط بالمركز برمز ربط ويعمل حتى بلا إنترنت', icon: <Store className="w-5 h-5" /> },
  ];
  const sync = info?.branch?.sync;
  const srv = info?.hq?.server;
  const linkHost = info?.hq?.publicHost || info?.localIps?.[0] || '—';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5 text-right" dir="rtl" data-testid="branches-view">
      <div className="flex items-center gap-3">
        <Globe className="w-7 h-7 text-teal-600" />
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white">ربط الفروع عن بعد <span className="text-xs align-middle bg-amber-400 text-black font-black rounded-md px-1.5 py-0.5 mr-1">PRO</span></h1>
          <p className="text-xs text-slate-500">فروع في مدن مختلفة مرتبطة بمركز واحد عبر الإنترنت. كل فرع يبيع على قاعدته حتى لو انقطع الإنترنت، وتتم المزامنة تلقائياً عند عودة الاتصال — والبيانات مشفّرة بالكامل (AES-256).</p>
        </div>
      </div>

      {info?.blocked && <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 p-3 text-sm flex gap-2"><AlertTriangle className="w-5 h-5 shrink-0" />{info.blocked}</div>}
      {msg && <div className={`rounded-xl p-3 text-sm flex gap-2 ${msg.ok ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'}`}>{msg.ok ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}{msg.text}</div>}

      {/* ---------------- الفرع: الحالة ---------------- */}
      {info?.mode === 'branch' && info.branch && (
        <div className={`${card} ${sync && !sync.connected && sync.lastError ? 'border-rose-300' : 'border-emerald-300'}`}>
          <div className="flex items-center gap-2 font-black">
            {sync?.syncing ? <Loader2 className="w-5 h-5 animate-spin text-teal-600" /> : sync?.connected ? <Wifi className="w-5 h-5 text-emerald-600" /> : <WifiOff className="w-5 h-5 text-rose-600" />}
            فرع «{info.branch.name}» <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 rounded px-1.5">{info.branch.code}</span> مرتبط بالمركز «{info.branch.hqName || info.branch.host}»
          </div>
          <div className="grid sm:grid-cols-4 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3"><div className="text-xs text-slate-500">آخر مزامنة ناجحة</div><div className="font-black">{ago(sync?.lastSyncAt).text}</div></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3"><div className="text-xs text-slate-500">بانتظار الإرسال</div><div className="font-black font-mono">{sync?.pendingUp ?? '—'}</div></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3"><div className="text-xs text-slate-500">المركز</div><div className="font-mono font-black text-xs" dir="ltr">{info.branch.host}:{info.branch.port}</div></div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3"><div className="text-xs text-slate-500">الأصناف من المركز</div><div className="font-black">{sync?.initialized ? 'مستلمة ✓' : 'بانتظار أول مزامنة'}</div></div>
          </div>
          {sync?.lastError && <div className="text-sm text-rose-600 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{sync.lastError}<span className="text-xs text-slate-500">(البيع مستمر — تُرسل البيانات عند عودة الاتصال)</span></div>}
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} disabled={busy || !!sync?.syncing} onClick={syncNow}><RefreshCw className={`w-4 h-4 ${sync?.syncing ? 'animate-spin' : ''}`} />مزامنة الآن</button>
            <button className={`${btnGhost} text-rose-600 mr-auto`} disabled={busy} onClick={leave}><Unlink className="w-4 h-4" />إلغاء الربط</button>
          </div>
          <p className="text-[11px] text-slate-500">تتم المزامنة تلقائياً كل {info.intervalSec} ثانية، وبعد ثوانٍ من كل بيع. الأسعار والأصناف الجديدة من المركز تظهر هنا تلقائياً، ومخزون الفرع وتكلفته لا يتأثران بالمركز.</p>
        </div>
      )}

      {/* ---------------- المركز: الحالة والفروع ---------------- */}
      {info?.mode === 'hq' && (
        <div className={`${card} ${srv?.error ? 'border-rose-300' : 'border-emerald-300'}`}>
          <div className="flex items-center gap-2 font-black">
            {srv?.listening && !srv.error ? <Wifi className="w-5 h-5 text-emerald-600" /> : <WifiOff className="w-5 h-5 text-rose-600" />}
            {srv?.error ? `خدمة المزامنة متوقفة: ${srv.error}` : srv?.listening ? 'المركز يعمل وينتظر الفروع' : 'جارٍ التشغيل...'}
            <span className="text-xs font-normal text-slate-500 mr-auto font-mono" dir="ltr">{linkHost}:{info.hq?.port}</span>
          </div>
          {!info.hq?.publicHost && <div className="text-xs rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 p-2.5">لم تحدد «العنوان العام» للمركز — رموز الربط تستعمل عنوان الشبكة المحلية ({info.localIps[0] || '—'}) فتعمل فقط للفروع على نفس الشبكة أو عبر VPN. للفروع البعيدة اكتب IP الثابت أو اسم DDNS في الإعدادات أدناه.</div>}

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-bold text-slate-500 space-y-1 flex-1 min-w-[180px]"><span>اسم الفرع الجديد</span><input className={input} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="فرع جدة — التحلية" /></label>
            <label className="text-xs font-bold text-slate-500 space-y-1 w-32"><span>الرمز (اختياري)</span><input className={`${input} font-mono`} value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="JED" maxLength={12} /></label>
            <button className={btnPrimary} disabled={busy || !newName.trim()} onClick={addBranch}><Plus className="w-4 h-4" />إضافة فرع</button>
          </div>

          <div className="space-y-2">
            {(info.branches || []).length === 0 && <div className="text-sm text-slate-500">لا توجد فروع بعد — أضف فرعاً وانسخ رمز الربط إلى جهاز الفرع.</div>}
            {(info.branches || []).map((b) => {
              const a = ago(b.lastSeenAt);
              const o = overview?.[b.id];
              return (
                <div key={b.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`w-2.5 h-2.5 rounded-full ${b.status !== 'active' ? 'bg-amber-500' : a.online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <span className="font-black">{b.name}</span>
                    <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 rounded px-1.5">{b.code}</span>
                    {b.status !== 'active' && <span className="text-xs font-bold text-amber-600">موقوف</span>}
                    <span className="text-xs text-slate-500">{a.text}{b.lastIp ? ` — ${b.lastIp}` : ''}{b.appVersion ? ` — v${b.appVersion}` : ''}{b.info?.device ? ` — ${b.info.device}` : ''}</span>
                    <span className="text-xs text-slate-400 mr-auto">{b.counts.invoices || 0} فاتورة · {b.counts.products || 0} صنف</span>
                  </div>
                  {o && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-2"><div className="text-slate-500">مبيعات اليوم</div><div className="font-black font-mono">{fmt(o.dayTotal)} <span className="text-slate-400">({o.dayCount})</span></div></div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-2"><div className="text-slate-500">مبيعات الشهر</div><div className="font-black font-mono">{fmt(o.monthTotal)} <span className="text-slate-400">({o.monthCount})</span></div></div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-2"><div className="text-slate-500">مرتجعات الشهر</div><div className="font-black font-mono">{fmt(o.returns)}</div></div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-2"><div className="text-slate-500">قيمة المخزون</div><div className="font-black font-mono">{fmt(o.stockValue)}</div></div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-950 p-2"><div className="text-slate-500">نافد / تحت الحد</div><div className="font-black font-mono">{o.out} / {o.low}</div></div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    <button className={btnGhost} onClick={() => setView(b)}><Eye className="w-4 h-4" />بيانات الفرع</button>
                    <button className={btnGhost} disabled={busy} onClick={() => showLink(b)}><Link2 className="w-4 h-4" />رمز الربط</button>
                    <button className={btnGhost} disabled={busy} onClick={() => rename(b)}><Pencil className="w-4 h-4" />تعديل</button>
                    <button className={btnGhost} disabled={busy} onClick={() => toggle(b)}>{b.status === 'active' ? <><PauseCircle className="w-4 h-4" />إيقاف</> : <><PlayCircle className="w-4 h-4" />تفعيل</>}</button>
                    <button className={btnGhost} disabled={busy} onClick={() => rekey(b)}><KeyRound className="w-4 h-4" />مفتاح جديد</button>
                    <button className={`${btnGhost} text-rose-600`} disabled={busy} onClick={() => remove(b)}><Trash2 className="w-4 h-4" />حذف</button>
                  </div>
                </div>
              );
            })}
          </div>
          {(info.branches || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button className={btnGhost} disabled={busy} onClick={loadOverview}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}ملخص مبيعات ومخزون الفروع</button>
              {onOpenAccounting && <button className={btnGhost} onClick={onOpenAccounting}>القوائم المالية لكل فرع والموحّدة ←</button>}
            </div>
          )}
        </div>
      )}

      {/* ---------------- الدور والإعدادات ---------------- */}
      <div className={card}>
        <div className="font-black">دور هذا الجهاز</div>
        <div className="grid sm:grid-cols-3 gap-2">
          {modes.map((m) => (
            <button key={m.id} type="button" disabled={(m.id === 'branch' && info?.mode === 'hq') || (m.id === 'hq' && info?.mode === 'branch')}
              onClick={() => setMode(m.id)}
              className={`text-right rounded-xl border-2 p-3 transition-colors disabled:opacity-40 ${mode === m.id ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'}`}>
              <div className="flex items-center gap-2 font-black">{m.icon}{m.title}{info?.mode === m.id && <span className="text-[10px] bg-emerald-600 text-white rounded px-1">الحالي</span>}</div>
              <div className="text-xs text-slate-500 mt-1">{m.desc}</div>
            </button>
          ))}
        </div>

        {mode === 'hq' && (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="text-xs font-bold text-slate-500 space-y-1"><span>اسم المركز (يظهر في الفروع)</span><input className={input} value={hqName} onChange={(e) => setHqName(e.target.value)} placeholder="الإدارة — الرياض" /></label>
              <label className="text-xs font-bold text-slate-500 space-y-1"><span>العنوان العام (IP ثابت أو DDNS)</span><input className={`${input} font-mono`} dir="ltr" value={publicHost} onChange={(e) => setPublicHost(e.target.value.trim())} placeholder="myshop.ddns.net" /></label>
              <label className="text-xs font-bold text-slate-500 space-y-1"><span>المنفذ</span><input className={`${input} font-mono`} dir="ltr" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} /></label>
            </div>
            <label className="text-xs font-bold text-slate-500 space-y-1 block">
              <span>عنوان الممر (للفروع البعيدة بلا فتح منافذ)</span>
              <input className={`${input} font-mono`} dir="ltr" value={relayUrl} onChange={(e) => setRelayUrl(e.target.value.trim())} placeholder="https://xxx.workers.dev" />
            </label>
            {info?.hq?.relay?.url && (
              <div className={`text-xs rounded-xl p-2.5 ${info.hq.relayStatus?.connected ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'}`}>
                {info.hq.relayStatus?.connected
                  ? <>المركز متصل بالممر — الفروع البعيدة تعمل بلا فتح منافذ. رموز الربط الجديدة تستعمل الممر تلقائياً.</>
                  : <>المركز غير متصل بالممر الآن{info.hq.relayStatus?.lastError ? ` (${info.hq.relayStatus.lastError})` : ''} — تجري إعادة المحاولة تلقائياً. مبيعات الفروع محفوظة عندها وسترفع عند عودة الاتصال.</>}
              </div>
            )}
            <div className="text-xs text-slate-500 leading-6 rounded-xl bg-slate-50 dark:bg-slate-950 p-3">
              <b className="flex items-center gap-1"><ShieldCheck className="w-4 h-4 text-teal-600" />الأسهل — الممر: الصق عنوانه أعلاه واحفظ. المركز يتصل به من الداخل للخارج، فلا تحتاج فتح منفذ ولا IP ثابت ولا DDNS، والفرع لا يحتاج أي إعداد. بياناتك تمرّ مشفّرة والممر لا يستطيع قراءتها.</b>
              <b className="flex items-center gap-1 mt-2"><ShieldCheck className="w-4 h-4 text-slate-400" />أو يدوياً بفتح منفذ (مرة واحدة):</b>
              ١) من إعدادات الراوتر: «Port Forwarding» للمنفذ <b className="font-mono">{port || 47830}</b> (TCP) إلى عنوان هذا الجهاز <b className="font-mono">{info?.localIps?.[0] || '—'}</b>.
              ٢) إن لم يكن لديك IP ثابت: فعّل خدمة DDNS (مثل No-IP أو DynDNS من الراوتر) واكتب اسمها في «العنوان العام».
              ٣) عند أول تشغيل اسمح للبرنامج في جدار حماية ويندوز.
              بديل ثالث: شبكة VPN خاصة (مثل Tailscale أو ZeroTier) واكتب عنوان المركز فيها.
            </div>
          </div>
        )}

        {mode === 'branch' && info?.mode !== 'branch' && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 space-y-1 block"><span>رمز الربط (من شاشة «ربط الفروع» في جهاز المركز)</span>
              <textarea className={`${input} font-mono text-xs h-24`} dir="ltr" value={link} onChange={(e) => setLink(e.target.value)} placeholder="SLB1-..." />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className={btnPrimary} disabled={busy || !link.trim()} onClick={joinBranch}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}اختبار وربط بالمركز</button>
              <button className={btnGhost} onClick={async () => { const t = await window.ledger?.clipboard?.readText(); if (t) setLink(t.trim()); }}>لصق</button>
            </div>
            <p className="text-[11px] text-slate-500">عند أول مزامنة: تُرفع فواتير هذا الجهاز السابقة للمركز، وتصل الأصناف والأسعار من المركز (مخزون هذا الفرع لا يتغير). إن كان في هذا الموقع عدة أجهزة كاشير مربوطة محلياً، اربط «الجهاز الرئيسي» للموقع فقط.</p>
          </div>
        )}

        {(mode === 'hq' || info?.mode === 'branch') && (
          <label className="text-xs font-bold text-slate-500 space-y-1 block max-w-xs"><span>فترة المزامنة التلقائية (ثانية)</span><input className={`${input} font-mono`} dir="ltr" value={interval} onChange={(e) => setIntervalSec(e.target.value.replace(/\D/g, ''))} /></label>
        )}

        {(mode !== 'branch' || info?.mode === 'branch') && (
          <div className="flex justify-end">
            <button className={btnPrimary} disabled={busy || (mode === 'branch' && info?.mode !== 'branch')} onClick={saveHq}><CheckCircle2 className="w-4 h-4" />حفظ</button>
          </div>
        )}
      </div>

      <div className="text-[11px] text-slate-500 leading-6">
        <b>ما الذي يُزامن؟</b> من الفرع إلى المركز: الفواتير والمرتجعات، المشتريات ومرتجعها، عروض الأسعار، حركات الصندوق، الإقفالات، القيود والسندات، العملاء والموردين، والمخزون.
        من المركز إلى الفروع: الأصناف والأسعار والباركود، المجموعات والفئات، العملاء والموردين، العروض والتخفيضات، ودليل الحسابات.
        يبقى خاصاً بكل فرع: الكميات، التكلفة، التالف، رصيد العميل لدى الفرع، الطابعات، الفوترة الإلكترونية (كل فرع وحدة مستقلة لدى الهيئة).
      </div>

      {shownCode && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setShownCode(null); }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl p-5 space-y-3" dir="rtl">
            <div className="flex items-center justify-between"><div className="font-black">رمز ربط «{shownCode.name}»</div><button onClick={() => setShownCode(null)}><X className="w-5 h-5" /></button></div>
            <textarea readOnly className={`${input} font-mono text-xs h-28`} dir="ltr" value={shownCode.code} onFocus={(e) => e.currentTarget.select()} />
            <div className="flex gap-2"><button className={btnPrimary} onClick={() => copy(shownCode.code)}><Copy className="w-4 h-4" />نسخ</button></div>
            <p className="text-xs text-slate-500">في جهاز الفرع: «ربط الفروع» ← اختر «فرع» ← الصق الرمز ← «اختبار وربط». الرمز سري: يحتوي مفتاح التشفير الخاص بهذا الفرع — أرسله للفرع فقط. يمكنك إلغاؤه بزر «مفتاح جديد».</p>
          </div>
        </div>
      )}
      {view && <BranchDataView branch={view} onClose={() => setView(null)} />}
    </div>
  );
}

/** نافذة بيانات فرع كما وصلت للمركز */
function BranchDataView({ branch, onClose }: { branch: BranchRow; onClose: () => void }) {
  const api = window.ledger?.branches;
  const [data, setData] = useState<{ invoices: Invoice[]; products: Product[] } | null>(null);
  const [tab, setTab] = useState<'sales' | 'stock'>('sales');
  const [q, setQ] = useState('');
  useEffect(() => { void api?.data(branch.id, ['invoices', 'products']).then((d) => setData({ invoices: (d.invoices || []) as Invoice[], products: (d.products || []) as Product[] })); }, [branch.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = useMemo(() => (data ? summarize(data.invoices, data.products) : null), [data]);
  const stock = useMemo(() => {
    if (!data) return [];
    const t = q.trim();
    return data.products.filter((p) => !p.isService && (!t || p.nameAr?.includes(t) || p.barcode?.includes(t))).slice(0, 400);
  }, [data, q]);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" dir="rtl">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="font-black">بيانات فرع «{branch.name}» <span className="text-xs font-normal text-slate-500">(حتى آخر مزامنة: {ago(branch.lastSeenAt).text})</span></div>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        {!s ? <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-teal-600" /></div> : (
          <div className="p-4 space-y-3 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3"><div className="text-xs text-slate-500">مبيعات اليوم</div><div className="font-black font-mono">{fmt(s.dayTotal)}</div></div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3"><div className="text-xs text-slate-500">مبيعات الشهر</div><div className="font-black font-mono">{fmt(s.monthTotal)}</div></div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3"><div className="text-xs text-slate-500">ضريبة الشهر</div><div className="font-black font-mono">{fmt(s.vat)}</div></div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3"><div className="text-xs text-slate-500">قيمة المخزون</div><div className="font-black font-mono">{fmt(s.stockValue)}</div></div>
            </div>
            <div className="flex gap-2">
              <button className={`${btn} ${tab === 'sales' ? 'bg-teal-600 text-white' : 'border border-slate-200 dark:border-slate-700'}`} onClick={() => setTab('sales')}>آخر الفواتير ({s.invoices})</button>
              <button className={`${btn} ${tab === 'stock' ? 'bg-teal-600 text-white' : 'border border-slate-200 dark:border-slate-700'}`} onClick={() => setTab('stock')}>مخزون الفرع ({s.products})</button>
            </div>
            {tab === 'sales' ? (
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500"><tr><th className="text-right p-1">الرقم</th><th className="text-right p-1">التاريخ</th><th className="text-right p-1">العميل</th><th className="p-1">الإجمالي</th></tr></thead>
                <tbody>{s.last.map((i) => <tr key={i.id} className="border-t border-slate-100 dark:border-slate-800"><td className="p-1 font-mono">{i.number}</td><td className="p-1 font-mono text-xs">{String(i.date).slice(0, 16)}</td><td className="p-1">{i.customerName}</td><td className={`p-1 text-center font-mono ${i.total < 0 ? 'text-rose-600' : ''}`}>{fmt(i.total)}</td></tr>)}</tbody>
              </table>
            ) : (
              <>
                <input className={input} placeholder="بحث بالاسم أو الباركود" value={q} onChange={(e) => setQ(e.target.value)} />
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500"><tr><th className="text-right p-1">الصنف</th><th className="p-1">الباركود</th><th className="p-1">الكمية</th><th className="p-1">السعر</th></tr></thead>
                  <tbody>{stock.map((p) => <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800"><td className="p-1">{p.nameAr}</td><td className="p-1 text-center font-mono text-xs">{p.barcode}</td><td className={`p-1 text-center font-mono ${(p.stock || 0) <= 0 ? 'text-rose-600' : ''}`}>{round2(p.stock || 0)}</td><td className="p-1 text-center font-mono">{fmt(p.price)}</td></tr>)}</tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
