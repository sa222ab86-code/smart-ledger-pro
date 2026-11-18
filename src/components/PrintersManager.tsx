import { useEffect, useState, type ReactNode } from 'react';
import { Printer, PlusCircle, Server, Trash2, RefreshCw, Zap, TestTube2, X, AlertTriangle, Wrench } from 'lucide-react';
import type { OsPrinter, SpoolerStatus } from '../storage/persistence';
import {
  isElectron, printKitchenTicket, DEFAULT_KITCHEN_MAIN, TICKET_PAD_DEFAULT, PAD_MAX_MM, clampPad, clampFont, clampCopies, AFTER_SALE_OPTIONS, escposCompatible, previewPaperOn, type PreviewPaperKey, listOsPrinters, printHtmlDocument, A4_THEMES, RECEIPT_LOGO_SIZES, type ReceiptLogoSize, setThermal, thermalDims,
  RECEIPT_MODES, THERMAL_VIA_LABEL, receiptModeOf, resolveThermalMode, printThermalTest, printBilingual, type ThermalVia,
  type PrintSettings, type A4Theme,
} from '../utils/printing';

export interface PrinterRow {
  id: string;
  name: string;
  osPrinterName: string;
  type: 'cashier' | 'kitchen' | 'section';
  template: 'thermal80' | 'A4' | 'kitchenTicket';
  status: 'online' | 'offline';
  /** طباعة مباشرة بدون نافذة (افتراضي: نعم) */
  silent?: boolean;
  /** إزاحة أفقية لهذه الطابعة بالمم */
  offsetMm?: number;
  /** ورقة الطلب: بدون سعر (افتراضي) أو بالأسعار */
  ticketTemplate?: 'ticket' | 'priced';
  /** طابعة حرارية مباشرة (ESC/POS) — افتراضي: نعم */
  raw?: boolean;
  /** هامش يمين/يسار (مم) وحجم الخط (%) */
  padRightMm?: number;
  padLeftMm?: number;
  fontPct?: number;
  /** عدد نسخ ورقة الطلب (1–5) */
  copies?: number;
}

/** ضبط الورقة: هامش من اليمين، هامش من اليسار، حجم الخط */
function Stepper({ label, value, unit, step, min, max, onChange, testId }: { label: string; value: number; unit: string; step: number; min: number; max: number; onChange: (v: number) => void; testId?: string }) {
  return (
    <div className="flex items-center justify-between gap-2" data-testid={testId}>
      <span>{label}</span>
      <div className="flex items-center gap-1">
        <button type="button" data-act="dec" onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))} className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 font-black">−</button>
        <span className="w-14 text-center font-mono font-black text-sm" data-role="val">{value}{unit}</span>
        <button type="button" data-act="inc" onClick={() => onChange(Math.min(max, +(value + step).toFixed(1)))} className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-700 font-black">+</button>
      </div>
    </div>
  );
}
function LayoutCtl({ right, left, font, onChange, padDefault = TICKET_PAD_DEFAULT }: { right?: number; left?: number; font?: number; padDefault?: number; onChange: (p: { padRightMm?: number; padLeftMm?: number; fontPct?: number }) => void }) {
  return (
    <div className="space-y-1.5" data-testid="layout-ctl">
      <Stepper testId="pad-right" label="هامش من اليمين" value={clampPad(right, padDefault)} unit=" مم" step={0.5} min={0} max={PAD_MAX_MM} onChange={(v) => onChange({ padRightMm: v })} />
      <Stepper testId="pad-left" label="هامش من اليسار" value={clampPad(left, padDefault)} unit=" مم" step={0.5} min={0} max={PAD_MAX_MM} onChange={(v) => onChange({ padLeftMm: v })} />
      <Stepper testId="font-pct" label="حجم الخط" value={clampFont(font)} unit="%" step={5} min={60} max={160} onChange={(v) => onChange({ fontPct: v })} />
    </div>
  );
}

/** مفتاح تشغيل/إيقاف صغير */
function Switch({ on, onClick, testId, color = 'bg-cyan-500' }: { on: boolean; onClick: () => void; testId?: string; color?: string }) {
  return (
    <button type="button" data-testid={testId} aria-pressed={on} onClick={onClick} className={`w-11 h-6 rounded-full relative shrink-0 transition ${on ? color : 'bg-slate-300 dark:bg-slate-600'}`}>
      <span className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${on ? 'left-1' : 'left-6'}`} />
    </button>
  );
}

interface Props {
  printers: PrinterRow[];
  setPrinters: (updater: (prev: PrinterRow[]) => PrinterRow[]) => void;
  printSettings: PrintSettings;
  setPrintSettings: (updater: (prev: PrintSettings) => PrintSettings) => void;
  notify: (msg: string, ms?: number) => void;
  /** أقسام إضافية تُعرض أسفل الصفحة (إعدادات الأجهزة) */
  extra?: ReactNode;
  /** نشاط مطعم: تظهر طابعات المطبخ والأقسام وتذاكر التحضير */
  restaurant?: boolean;
  /** اسم المتجر (يظهر أعلى ورقة الاختبار كما في ورقة الطلب) */
  storeName?: string;
}


const card = 'bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700';
const sel = 'w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold outline-none';

function OsSelect({ os, electron, value, onChange, emptyLabel }: { os: OsPrinter[]; electron: boolean; value: string; onChange: (v: string) => void; emptyLabel: string }) {
  return os.length > 0 ? (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={sel} dir="ltr">
      <option value="">{emptyLabel}</option>
      {os.map((p) => <option key={p.name} value={p.name}>{p.displayName}{p.isDefault ? '  ★' : ''}</option>)}
      {value && !os.some((p) => p.name === value) && <option value={value}>{value} (غير موجودة حالياً)</option>}
    </select>
  ) : (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={electron ? 'لم يتم العثور على طابعات — اكتب الاسم يدوياً' : 'اسم الطابعة في ويندوز'} className={sel} dir="ltr" />
  );
}

export default function PrintersManager({ printers, setPrinters, printSettings, setPrintSettings, notify, extra, restaurant = false, storeName }: Props) {
  // في التجزئة: طابعات كاشير فقط — في المطعم: طابعات أقسام (ورقة بسعر / بدون سعر)
  const newType: PrinterRow['type'] = restaurant ? 'section' : 'cashier';
  const shown = restaurant ? printers : printers.filter((p) => p.type === 'cashier');
  const [os, setOs] = useState<OsPrinter[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ name: string; osPrinterName: string }>({ name: '', osPrinterName: '' });

  // تشخيص عند فراغ القائمة: كم طابعة وجد كل مصدر (وسبب الفشل) — لتحديد المشكلة على جهاز العميل
  const [diag, setDiag] = useState<string>('');
  // خدمة الطباعة في ويندوز: متوقفة/معطّلة، أو «لا تستجيب» (الطابعات لم تظهر إلا من سجل ويندوز)
  const [spooler, setSpooler] = useState<SpoolerStatus | null>(null);
  const [spoolerStuck, setSpoolerStuck] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const refresh = async () => {
    setLoading(true);
    const list = await listOsPrinters();
    setOs(list);
    const api = window.ledger?.print;
    let text = '';
    let sp: SpoolerStatus | null = null;
    let stuck = false;
    if (api?.listDiag) {
      try {
        const d = await api.listDiag();
        // Chromium وجد الطابعات = الخدمة تعمل؛ وإلا نفحص حالتها
        if (d.chromium === 0) {
          sp = d.spooler ?? (api.spoolerStatus ? await api.spoolerStatus().catch(() => null) : null);
          stuck = d.powershell === 0 && list.length > 0;
          text = `Chromium: ${d.chromium}${d.chromiumError ? ` (${d.chromiumError})` : ''} · PowerShell: ${d.powershell}${d.powershellError ? ` (${d.powershellError})` : ''} · السجل: ${d.registry}${d.registryError ? ` (${d.registryError})` : ''} · Spooler: ${sp ? `${sp.state}${sp.startType ? '/' + sp.startType : ''}` : '?'}`;
        }
      } catch (e) { text = String((e as Error)?.message || e); }
    }
    setDiag(text);
    setSpooler(sp);
    setSpoolerStuck(stuck);
    setLoading(false);
  };
  const spoolerDown = !!spooler && (spooler.startType === 'disabled' || (spooler.state !== 'running' && spooler.state !== 'unknown'));
  const spoolerProblem = spoolerDown || spoolerStuck;
  const spoolerTitle = spooler?.startType === 'disabled' ? 'خدمة الطباعة في ويندوز (Print Spooler) معطّلة'
    : spoolerDown ? 'خدمة الطباعة في ويندوز (Print Spooler) متوقفة'
    : 'خدمة الطباعة في ويندوز (Print Spooler) لا تستجيب';
  const repairSpooler = async () => {
    const api = window.ledger?.print;
    if (!api?.repairSpooler || repairing) return;
    setRepairing(true);
    notify('اضغط «نعم» في رسالة ويندوز (صلاحية المسؤول) لإصلاح خدمة الطباعة…');
    try {
      const r = await api.repairSpooler();
      notify(r.ok ? '✓ عادت خدمة الطباعة للعمل — جرّب الطباعة الآن' : `تعذّر إصلاح خدمة الطباعة: ${r.reason || ''}`);
    } catch (e) {
      notify(`تعذّر إصلاح خدمة الطباعة: ${String((e as Error)?.message || e)}`);
    }
    setRepairing(false);
    await refresh();
  };
  useEffect(() => { void refresh(); }, []);

  const electron = isElectron();
  const defaultName = os.find((p) => p.isDefault)?.name;

  const testPrint = async (deviceName: string, title: string, o: { offsetMm?: number; silent?: boolean; priced?: boolean; raw?: boolean; padRightMm?: number; padLeftMm?: number; fontPct?: number; copies?: number } = {}) => {
    const ticket = {
      title: `اختبار — ${title}`,
      storeName: storeName || undefined,
      invoiceNumber: 'TEST-0001',
      orderNumber: 12,
      orderType: 'takeaway',
      date: new Date().toISOString(),
      items: [{ name: 'سطر تجريبي للتأكد من الطباعة', qty: 1, price: 15, total: 15 }, { name: 'صنف ثانٍ', qty: 2, price: 5, total: 10 }],
      total: 25,
    };
    const res = await printKitchenTicket(ticket, { offsetMm: o.offsetMm, padRightMm: o.padRightMm, padLeftMm: o.padLeftMm, fontPct: o.fontPct, copies: o.copies, priced: o.priced, raw: o.raw, silent: o.silent ?? printSettings.silent, deviceName: deviceName || undefined });
    notify(res.ok ? 'تم إرسال ورقة الاختبار' : `فشل الاختبار${res.reason ? ': ' + res.reason : ''}`);
  };
  // أزرار ورقة الاختبار ظاهرة دائماً
  const showTests = true;
  // طابعة الإيصالات: طريقة الطباعة المختارة والفعلية + ورقة اختبار بنفس هندسة الإيصال (إطار ومسطرة بالمم)
  const receiptMode = receiptModeOf(printSettings);
  const receiptTarget = printSettings.receiptPrinter || defaultName || '';
  const receiptVia: ThermalVia = resolveThermalMode(receiptMode, receiptTarget, printSettings.silent && electron);
  const [testing, setTesting] = useState(false);
  const receiptTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const r = await printThermalTest({ title: 'طابعة الإيصالات', storeName: storeName || undefined, printer: receiptTarget }, { deviceName: printSettings.receiptPrinter || undefined, silent: printSettings.silent, mode: receiptMode });
      notify(r.ok
        ? `✓ أُرسلت ورقة الاختبار — ${THERMAL_VIA_LABEL[r.via || receiptVia]}${r.fellBack ? ' (بديلاً بعد فشل الطريقة المختارة)' : ''}`
        : `فشل الاختبار${r.reason ? ': ' + r.reason : ''}`, r.ok ? 5000 : 9000);
    } finally { setTesting(false); }
  };
  /** ورقة مرقّمة لكل طريقة — يختار المستخدم الطريقة التي خرجت ورقتها سليمة (طابعة لا تفهم ESC/POS: بلا الطريقة المباشرة حتى لا تُهدر الورق برموز) */
  const receiptTestAll = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const vias: ThermalVia[] = escposCompatible(receiptTarget) || receiptMode === 'escpos' ? ['escpos', 'driver', 'driverPaper'] : ['driver', 'driverPaper'];
      const out: string[] = [];
      for (let i = 0; i < vias.length; i++) {
        const r = await printThermalTest({ title: 'طابعة الإيصالات', storeName: storeName || undefined, printer: receiptTarget, index: i + 1, total: vias.length }, { deviceName: printSettings.receiptPrinter || undefined, silent: true, exact: vias[i] });
        out.push(`${i + 1}) ${THERMAL_VIA_LABEL[vias[i]]} ${r.ok ? '✓' : `✗${r.reason ? ` (${r.reason})` : ''}`}`);
      }
      notify(`أُرسلت أوراق الاختبار: ${out.join(' · ')} — اختر الطريقة التي خرجت ورقتها سليمة كاملة`, 15000);
    } finally { setTesting(false); }
  };
  const km = { ...DEFAULT_KITCHEN_MAIN, ...(printSettings.kitchenMain || {}) };
  const setKm = (patch: Partial<typeof km>) => setPrintSettings((p) => ({ ...p, kitchenMain: { ...DEFAULT_KITCHEN_MAIN, ...(p.kitchenMain || {}), ...patch } }));

  const addPrinter = () => {
    const name = form.name.trim() || form.osPrinterName.trim();
    if (!name) { notify('اكتب اسماً للطابعة أو اختر طابعة'); return; }
    setPrinters((prev) => [
      ...prev,
      {
        id: `p-${Date.now()}`,
        name,
        osPrinterName: form.osPrinterName.trim(),
        type: newType,
        template: newType === 'cashier' ? 'thermal80' : 'kitchenTicket',
        status: 'online',
        ticketTemplate: 'ticket',
      },
    ]);
    setAdding(false);
    setForm({ name: '', osPrinterName: '' });
    notify('تم ربط الطابعة');
  };

  const update = (id: string, patch: Partial<PrinterRow>) =>
    setPrinters((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <div className="p-6 h-full overflow-y-auto flex flex-col gap-5 animate-in fade-in zoom-in-95 max-w-7xl mx-auto dark:text-white text-right">
      <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-xl"><Printer className="w-8 h-8" /></div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white">الطابعات والطباعة الصامتة</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold mt-1">
              {electron ? `طابعات ويندوز المكتشفة: ${os.length}` : 'اكتشاف الطابعات والطباعة الصامتة متاحان في النسخة المكتبية فقط'}
            </p>
            {electron && !loading && (os.length === 0 || spoolerProblem) && diag && (
              <p className="text-[11px] font-mono text-rose-600 dark:text-rose-400 mt-1 select-all" dir="ltr" data-testid="printers-diag" title="أرسل صورة هذا السطر للدعم">{diag}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} disabled={loading} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 font-bold text-sm flex items-center gap-2 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث القائمة
          </button>
          <button onClick={() => setAdding(true)} className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2"><PlusCircle className="w-5 h-5" /> ربط طابعة</button>
        </div>
      </div>

      {electron && spoolerProblem && (
        <div role="alert" data-testid="spooler-banner" className="flex flex-col sm:flex-row sm:items-center gap-3 bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-800 rounded-2xl p-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <AlertTriangle className="w-7 h-7 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-black text-rose-700 dark:text-rose-300">{spoolerTitle}</p>
              <p className="text-sm font-bold text-rose-700/80 dark:text-rose-300/80 mt-1 leading-relaxed">
                لن تخرج أي ورقة (إيصال، مطبخ، درج نقود) حتى تعمل الخدمة. اضغط «إصلاح خدمة الطباعة» ثم «نعم» في رسالة ويندوز — تُعاد تشغيل الخدمة وتُلغى الطباعات العالقة. إن لم تنجح: أعد تشغيل الجهاز.
              </p>
            </div>
          </div>
          <button type="button" onClick={repairSpooler} disabled={repairing} data-testid="spooler-repair"
            className="shrink-0 self-end sm:self-auto bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 disabled:opacity-60">
            {repairing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            {repairing ? 'جارٍ الإصلاح…' : 'إصلاح خدمة الطباعة'}
          </button>
        </div>
      )}

      {/* إعدادات الطباعة الصامتة */}
      <div className={card}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-lg flex items-center gap-2"><Zap className="w-5 h-5 text-amber-500" /> إعدادات الطباعة الصامتة</h3>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <span className="text-sm font-bold">{printSettings.silent ? 'مفعّلة' : 'متوقفة'}</span>
            <span
              onClick={() => setPrintSettings((p) => ({ ...p, silent: !p.silent }))}
              className={`w-12 h-6 rounded-full relative transition ${printSettings.silent ? 'bg-emerald-500' : 'bg-slate-400'}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${printSettings.silent ? 'right-0.5' : 'right-6'}`} />
            </span>
          </label>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-4">
          عند التفعيل تُطبع المستندات مباشرة على الطابعة المحددة دون ظهور نافذة اختيار الطابعة. عند الإيقاف تظهر نافذة الطباعة المعتادة.
        </p>
        {/* ماذا يحدث بعد كل عملية بيع */}
        <div className="mb-5 rounded-2xl border-2 border-cyan-500/40 bg-cyan-50/50 dark:bg-cyan-950/20 p-3" data-testid="after-sale">
          <div className="text-sm font-black text-cyan-800 dark:text-cyan-200 mb-2">بعد البيع <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">— ينطبق أيضاً على عروض الأسعار بعد حفظها</span></div>
          <div className="grid grid-cols-1 sm:grid-cols-4 2xl:grid-cols-7 gap-2">
            {AFTER_SALE_OPTIONS.map((o) => {
              const cur = printSettings.afterSale || (printSettings.silent ? 'print80' : 'ask');
              const on = cur === o.v;
              return (
                <button key={o.v} type="button" data-v={o.v} onClick={() => setPrintSettings((p) => ({ ...p, afterSale: o.v }))}
                  className={`text-right rounded-xl border-2 p-2.5 transition ${on ? 'border-cyan-500 bg-white dark:bg-slate-900 shadow' : 'border-transparent bg-white/60 dark:bg-slate-900/40 hover:border-slate-300'}`}>
                  <div className="text-sm font-black">{o.label}{on ? ' ✓' : ''}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5 leading-snug">{o.hint}</div>
                </button>
              );
            })}
          </div>
          {/* المقاسات الظاهرة في نافذة المعاينة — إلغاء التأشير يخفي المقاس من النافذة */}
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-white/70 dark:bg-slate-900/50 border border-cyan-500/20 px-3 py-2" data-testid="preview-papers">
            <span className="text-xs font-black text-slate-700 dark:text-slate-200">المقاسات الظاهرة في نافذة المعاينة:</span>
            {([['thermal', 'إيصال حراري'], ['A4', 'A4'], ['A5', 'A5']] as [PreviewPaperKey, string][]).map(([k, label]) => {
              const on = previewPaperOn(printSettings, k);
              const onlyOne = on && (['thermal', 'A4', 'A5'] as PreviewPaperKey[]).filter((x) => previewPaperOn(printSettings, x)).length === 1;
              return (
                <label key={k} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-black cursor-pointer select-none ${on ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-200' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`} title={onlyOne ? 'يجب أن يبقى مقاس واحد على الأقل' : undefined}>
                  <input type="checkbox" checked={on} disabled={onlyOne} data-testid={`preview-paper-${k}`} className="w-4 h-4 accent-cyan-600"
                    onChange={(e) => setPrintSettings((p) => ({ ...p, previewPapers: { ...(p.previewPapers || {}), [k]: e.target.checked } }))} />
                  {label}
                </label>
              );
            })}
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">— للفواتير وعروض الأسعار</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">طابعة الإيصالات الافتراضية</label>
            <OsSelect os={os} electron={electron} value={printSettings.receiptPrinter} onChange={(v) => setPrintSettings((p) => ({ ...p, receiptPrinter: v }))} emptyLabel={defaultName ? `طابعة النظام الافتراضية (${defaultName})` : 'طابعة النظام الافتراضية'} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">طابعة A4 (فواتير كبيرة وتقارير)</label>
            <OsSelect os={os} electron={electron} value={printSettings.a4Printer} onChange={(v) => setPrintSettings((p) => ({ ...p, a4Printer: v }))} emptyLabel="نفس طابعة الإيصالات" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">طابعة ملصقات الباركود</label>
            <OsSelect os={os} electron={electron} value={printSettings.labelPrinter} onChange={(v) => setPrintSettings((p) => ({ ...p, labelPrinter: v }))} emptyLabel="طابعة النظام الافتراضية" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">عدد نسخ الإيصال</label>
            <input
              type="number" min={1} max={10} value={printSettings.copies}
              onChange={(e) => setPrintSettings((p) => ({ ...p, copies: Math.max(1, Math.min(10, Number(e.target.value) || 1)) }))}
              className={sel}
            />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="thermal-settings">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2">عرض ورق الطابعة الحرارية</label>
            <div className="flex gap-2">
              {(['80', '58'] as const).map((w) => (
                <button key={w} type="button" onClick={() => setPrintSettings((p) => { const n = { ...p, thermalPaper: w }; setThermal(n); return n; })}
                  className={`px-5 py-2 rounded-xl border-2 text-sm font-black ${(printSettings.thermalPaper || '80') === w ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-200' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  {w} مم <span className="text-[11px] font-bold opacity-70">(طباعة {w === '80' ? 72 : 48} مم)</span>
                </button>
              ))}
            </div>
            <label className="block text-xs font-bold text-slate-500 mt-4 mb-2">دقة رأس الطابعة — إن اختفت الكتابة من يمين الورقة أو خرجت أكبر من اللازم</label>
            <div className="flex flex-wrap gap-2" data-testid="thermal-dpi">
              {([['auto', 'تلقائي (حسب اسم الطابعة)'], ['203', '203 — 576 نقطة (أغلب الطابعات)'], ['180', '180 — 512 نقطة (إبسون TM-T70 / T88)']] as const).map(([v, t]) => (
                <button key={v} type="button" data-v={v} onClick={() => setPrintSettings((p) => { const n = { ...p, thermalDpi: v }; setThermal(n); return n; })}
                  className={`px-3 py-2 rounded-xl border-2 text-xs font-black ${(printSettings.thermalDpi || 'auto') === v ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-200' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div data-testid="receipt-layout" className="text-sm font-bold">
            <label className="block text-xs font-bold text-slate-500 mb-2">ضبط إيصال البيع — إذا خرجت الكتابة عن الورقة من جهة زِد هامشها</label>
            <LayoutCtl padDefault={1} right={printSettings.thermalPadRightMm} left={printSettings.thermalPadLeftMm} font={printSettings.thermalFontPct}
              onChange={(c) => setPrintSettings((p) => {
                const n = { ...p, thermalOffsetMm: 0, ...(c.padRightMm != null ? { thermalPadRightMm: c.padRightMm } : {}), ...(c.padLeftMm != null ? { thermalPadLeftMm: c.padLeftMm } : {}), ...(c.fontPct != null ? { thermalFontPct: c.fontPct } : {}) };
                setThermal(n); return n;
              })} />
            {/* طريقة الطباعة على طابعة الإيصالات (الإيصال، تقرير الإقفال، عرض السعر 80مم) */}
            <div className="mt-3 rounded-xl border-2 border-orange-300/70 dark:border-orange-800/60 p-2.5" data-testid="receipt-mode">
              <div className="text-xs font-black text-slate-700 dark:text-slate-200 mb-1.5">طريقة الطباعة على طابعة الإيصالات</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {RECEIPT_MODES.map((m) => {
                  const on = receiptMode === m.v;
                  return (
                    <button key={m.v} type="button" data-v={m.v} aria-pressed={on} onClick={() => setPrintSettings((p) => ({ ...p, receiptMode: m.v }))}
                      className={`text-right rounded-lg border-2 px-2.5 py-1.5 transition ${on ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30' : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}>
                      <div className="text-xs font-black">{m.label}{on ? ' ✓' : ''}</div>
                      <div className="text-[10.5px] text-slate-500 dark:text-slate-400 font-semibold leading-snug mt-0.5">{m.hint}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-cyan-700 dark:text-cyan-300 mt-1.5 font-bold" data-testid="receipt-mode-now">
                الطريقة الفعلية الآن{receiptTarget ? <> لطابعة «<span dir="ltr">{receiptTarget}</span>»</> : ''}: {THERMAL_VIA_LABEL[receiptVia]}
                {receiptMode !== 'driver' && receiptMode !== 'driverPaper' && receiptVia !== 'escpos' && (!escposCompatible(receiptTarget) ? ' (لا تفهم ESC/POS)' : !printSettings.silent ? ' (الطباعة الصامتة متوقفة)' : '')}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                <button type="button" onClick={() => { void receiptTest(); }} disabled={testing} data-testid="receipt-test"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 dark:bg-slate-700 text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50">
                  <TestTube2 className="w-3.5 h-3.5" /> ورقة اختبار بهذه الطريقة
                </button>
                <button type="button" onClick={() => { void receiptTestAll(); }} disabled={testing} data-testid="receipt-test-all"
                  className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-black flex items-center gap-1.5 disabled:opacity-50">
                  <TestTube2 className="w-3.5 h-3.5" /> جرّب كل الطرق (ورقة مرقّمة لكل طريقة)
                </button>
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5 font-bold leading-relaxed">
                رموز غير مفهومة ← اختر «تعريف ويندوز». لا يخرج شيء أو الكتابة مقصوصة ← جرّب «ورق الطابعة»، وتأكد من عرض الورق (طابعة 58مم تقصّ إيصال 80مم من اليمين مهما زاد الهامش).
              </p>
            </div>
          </div>
        </div>
        <div className="mt-5" data-testid="receipt-logo-size">
          <label className="block text-xs font-bold text-slate-500 mb-2">حجم الشعار في إيصال 80مم</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(RECEIPT_LOGO_SIZES) as ReceiptLogoSize[]).map((k) => {
              const on = (printSettings.receiptLogo || 'md') === k;
              return (
                <button key={k} type="button" onClick={() => setPrintSettings((p) => ({ ...p, receiptLogo: k }))}
                  className={`px-4 py-2 rounded-xl border-2 text-xs font-black flex items-center gap-2 ${on ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-800 dark:text-cyan-200' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  {k !== 'hidden' && <span className="inline-block rounded bg-slate-400/60" style={{ width: RECEIPT_LOGO_SIZES[k].mm * 0.9, height: RECEIPT_LOGO_SIZES[k].mm * 0.9 }} />}
                  {RECEIPT_LOGO_SIZES[k].label}{k !== 'hidden' ? ` (${RECEIPT_LOGO_SIZES[k].mm}مم)` : ''}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-5" data-testid="a4-theme">
          <label className="block text-xs font-bold text-slate-500 mb-2">قالب ألوان مستندات A4 — الفاتورة وعرض السعر وفاتورة الشراء والتقارير</label>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(A4_THEMES) as A4Theme[]).map((t) => {
              const c = A4_THEMES[t];
              const on = (printSettings.a4Theme || 'green') === t;
              // المفرّغ: معاينة بخطوط بدل الكتل الملونة
              const fill = t === 'plain' ? { background: '#fff', border: '1px solid #000' } : { background: c.main };
              return (
                <button key={t} type="button" onClick={() => setPrintSettings((p) => ({ ...p, a4Theme: t }))} data-theme={t}
                  className={`w-44 rounded-xl border-2 p-2 text-right transition ${on ? 'border-cyan-500 ring-2 ring-cyan-500/30' : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}>
                  <div className="rounded-md overflow-hidden border border-slate-200 bg-white">
                    <div className="h-1.5" style={t === 'plain' ? { borderBottom: '1px solid #000' } : { background: c.main }} />
                    <div className="p-1.5 space-y-1">
                      <div className="h-2.5 rounded-sm" style={fill} />
                      <div className="h-1.5 rounded-sm bg-slate-200" /><div className="h-1.5 rounded-sm bg-slate-100" />
                      <div className="h-2.5 w-1/2 mr-auto rounded-sm" style={fill} />
                      <div className="h-2 rounded-sm border" style={{ background: c.soft, borderColor: c.softBorder }} />
                    </div>
                  </div>
                  <div className="mt-1.5 text-xs font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full inline-block" style={t === 'plain' ? { border: '1.5px solid #000', background: '#fff' } : { background: c.main }} />{c.label}{on ? ' ✓' : ''}
                  </div>
                </button>
              );
            })}
            {/* ترجمة: الإيصال الحراري والفاتورة وعرض السعر A4/A5 بلغتين على أي قالب مختار —
                مغلق افتراضياً، ويعمل/يُطفأ مع تبديل لغة البرنامج (الإنجليزية/العربية) */}
            {(() => {
              const on = printBilingual();
              return (
                <button type="button" data-testid="a4-bilingual" aria-pressed={on} onClick={() => setPrintSettings((p) => ({ ...p, bilingualPrint: !on }))}
                  className={`w-44 rounded-xl border-2 p-2 text-right transition flex flex-col ${on ? 'border-cyan-500 ring-2 ring-cyan-500/30' : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}>
                  <div translate="no" className="rounded-md border border-slate-200 bg-white text-slate-800 px-2 py-1.5 leading-tight flex-1 flex flex-col justify-center gap-0.5">
                    <div className="text-[13px] font-black">الإجمالي المستحق</div>
                    <div className={`text-[10px] font-bold ${on ? 'text-slate-600' : 'text-slate-300 line-through'}`} dir="ltr" style={{ textAlign: 'right' }}>Total amount due</div>
                  </div>
                  <div className="mt-1.5 text-[11px] font-black text-slate-700 dark:text-slate-200 flex items-center justify-between gap-1.5">
                    <span className="whitespace-nowrap">🌐 ترجمة عربي + English</span>
                    {/* مؤشر فقط (الزر كله هو المفتاح — لا زر داخل زر) */}
                    <span aria-hidden className={`w-9 h-5 rounded-full relative shrink-0 transition ${on ? 'bg-cyan-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                      <span className={`w-3.5 h-3.5 bg-white rounded-full absolute top-[3px] transition-all ${on ? 'left-[3px]' : 'left-[19px]'}`} />
                    </span>
                  </div>
                </button>
              );
            })()}
          </div>
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-1.5">🌐 الترجمة: الإيصال الحراري والفاتورة وعرض السعر (A4 وA5) بلغتين — كل عنوان بالعربي ومعه الإنجليزي، والمبلغ كتابةً بالإنجليزي أيضاً. تعمل تلقائياً عند تحويل البرنامج للإنجليزية، وتُطفأ عند العودة للعربية.</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          {restaurant ? (
            <label className="flex items-center gap-2 text-sm font-bold cursor-pointer" data-testid="auto-kitchen">
              <input type="checkbox" checked={printSettings.autoKitchenTickets} onChange={(e) => setPrintSettings((p) => ({ ...p, autoKitchenTickets: e.target.checked }))} />
              طباعة تذاكر طابعات الأقسام تلقائياً عند البيع <span className="text-xs text-slate-500 font-semibold">(طابعة المطبخ لها زرها الخاص)</span>
            </label>
          ) : <span />}
          <button onClick={() => { void receiptTest(); }} disabled={testing} data-testid="receipt-test-bottom" className="px-4 py-2 rounded-xl bg-slate-800 dark:bg-slate-700 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50">
            <TestTube2 className="w-4 h-4" /> ورقة اختبار
          </button>
        </div>
      </div>

      {/* طابعة المطبخ الرئيسية (المطعم): كل أصناف الطلب */}
      {restaurant && (
        <div className={`${card} border-2 ${km.enabled ? 'border-orange-400/70' : ''}`} data-testid="kitchen-main">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-100 dark:bg-orange-900/40 text-2xl leading-none shrink-0">👨‍🍳</div>
              <div className="min-w-0 flex-1">
                <label className="block text-[11px] font-bold text-slate-500 mb-0.5">اسم الطابعة <span className="font-semibold">(يظهر في رأس ورقة الطلب — اضغط للتعديل)</span></label>
                <div className="flex items-center gap-1.5 max-w-[17rem] mb-1 rounded-lg border-2 border-orange-300 dark:border-orange-700 bg-white dark:bg-slate-900 px-2 focus-within:border-orange-500">
                  <input value={km.name ?? ''} onChange={(e) => setKm({ name: e.target.value })} placeholder="طابعة المطبخ" title="اسم الطابعة — يظهر في رأس ورقة الطلب"
                    data-testid="kitchen-main-name" className="flex-1 min-w-0 py-1 leading-tight font-black text-lg bg-transparent outline-none placeholder:text-slate-400" />
                  <span className="text-orange-500 text-sm shrink-0" aria-hidden>✎</span>
                </div>
                <p className="text-xs text-slate-500 font-semibold">تطبع كل أصناف الطلب في ورقة واحدة عند كل بيع (إضافة لطابعات الأقسام)</p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-black">{km.enabled ? 'مفعّلة' : 'متوقفة'} <Switch on={km.enabled} onClick={() => setKm({ enabled: !km.enabled })} testId="kitchen-main-toggle" color="bg-orange-500" /></label>
          </div>
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${km.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">طابعة ويندوز</label>
              <OsSelect os={os} electron={electron} value={km.printer} onChange={(v) => setKm({ printer: v })} emptyLabel="نفس طابعة الإيصالات" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">نوع الورقة</label>
              <div className="grid grid-cols-2 gap-1.5" data-testid="kitchen-main-template">
                {([['ticket', 'ورقة بدون سعر'], ['priced', 'ورقة بالأسعار']] as const).map(([v, t]) => (
                  <button key={v} type="button" data-v={v} onClick={() => setKm({ template: v })}
                    className={`py-2 rounded-xl text-sm font-black border-2 ${km.template === v ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200' : 'border-slate-200 dark:border-slate-700'}`}>{t}</button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 text-sm font-bold">
              <span>طباعة مباشرة (بدون نافذة ويندوز)</span>
              <Switch on={km.silent} onClick={() => setKm({ silent: !km.silent })} testId="kitchen-main-silent" />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm font-bold md:col-span-2" title="يرسل التذكرة للطابعة الحرارية مباشرة: طول الورقة بقدر المحتوى وقص تلقائي — أوقفه فقط إن لم تكن الطابعة حرارية">
              <span>✂️ طابعة حرارية: ورقة بطول الطلب + قص تلقائي</span>
              <Switch on={km.raw !== false} onClick={() => setKm({ raw: !(km.raw !== false) })} testId="kitchen-main-raw" color="bg-orange-500" />
            </label>
            <div className="text-sm font-bold md:col-span-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 p-2.5">
              <LayoutCtl right={km.padRightMm} left={km.padLeftMm} font={km.fontPct} onChange={(c) => setKm({ ...c, offsetMm: 0 })} />
              <div className="mt-1.5 pt-1.5 border-t border-slate-200 dark:border-slate-700">
                <Stepper testId="kitchen-main-copies" label="عدد النسخ" value={clampCopies(km.copies)} unit="" step={1} min={1} max={5} onChange={(v) => setKm({ copies: v })} />
              </div>
            </div>
          </div>
          {showTests && km.enabled && (
            <button onClick={() => testPrint(km.printer || printSettings.receiptPrinter, km.name?.trim() || 'طابعة المطبخ', { offsetMm: km.offsetMm, padRightMm: km.padRightMm, padLeftMm: km.padLeftMm, fontPct: km.fontPct, copies: km.copies, silent: km.silent, priced: km.template === 'priced', raw: km.raw !== false })} className="mt-3 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold flex items-center gap-2">
              <TestTube2 className="w-4 h-4" /> ورقة اختبار للمطبخ
            </button>
          )}
        </div>
      )}

      {/* الطابعات المربوطة (مطبخ / أقسام / كاشير) */}
      <div>
        <h3 className="font-black text-lg mb-3" data-testid="linked-title">{restaurant ? 'طابعات المطبخ والأقسام' : 'طابعات الكاشير الإضافية'}</h3>
        {shown.length === 0 ? (
          <div className={`${card} text-center text-slate-400 font-bold py-10`}>
            {restaurant
              ? 'لا توجد طابعات مربوطة. اربط طابعة المطبخ أو الأقسام ثم اختر الطابعة في «مجموعات الأصناف» ليصل كل صنف لطابعته.'
              : 'لا توجد طابعات كاشير إضافية — الإيصال يُطبع على «طابعة الإيصالات الافتراضية» أعلاه.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {shown.map((p) => (
              <div key={p.id} className={card}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl"><Server className="w-6 h-6 text-blue-500" /></div>
                    <div>
                      <input value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} className="font-black text-base bg-transparent outline-none w-40" />
                      <div className="text-[11px] font-bold text-slate-500">{p.type === 'cashier' && !restaurant ? 'كاشير / إيصال' : 'طابعة قسم'}</div>
                    </div>
                  </div>
                  {/* تشغيل/إيقاف الطابعة: المتوقفة لا يُرسل إليها شيء إطلاقاً */}
                  <label className="flex items-center gap-2 text-xs font-black" data-testid="printer-status">
                    <span className={p.status === 'online' ? 'text-emerald-600' : 'text-slate-500'}>{p.status === 'online' ? 'تعمل' : 'متوقفة'}</span>
                    <Switch on={p.status === 'online'} onClick={() => update(p.id, { status: p.status === 'online' ? 'offline' : 'online' })} color="bg-emerald-500" />
                  </label>
                </div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">طابعة ويندوز</label>
                <OsSelect os={os} electron={electron} value={p.osPrinterName} onChange={(v) => update(p.id, { osPrinterName: v })} emptyLabel="طابعة النظام الافتراضية" />
                <div className={`mt-3 space-y-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 p-2.5 ${p.status === 'online' ? '' : 'opacity-50'}`}>
                  {p.status !== 'online' && <div className="text-[11px] font-black text-rose-600">متوقفة — لن تُطبع عليها أي تذكرة</div>}
                  <label className="flex items-center justify-between gap-2 text-xs font-bold" title="عند الإيقاف تظهر نافذة طباعة ويندوز لهذه الطابعة">
                    <span>طباعة مباشرة (بدون نافذة ويندوز)</span>
                    <Switch on={p.silent !== false} onClick={() => update(p.id, { silent: !(p.silent !== false) })} testId="printer-silent" />
                  </label>
                  {restaurant && (
                    <>
                      <div className="grid grid-cols-2 gap-1" data-testid="section-template">
                        {([['ticket', 'ورقة بدون سعر'], ['priced', 'ورقة بالأسعار']] as const).map(([v, t]) => (
                          <button key={v} type="button" data-v={v} onClick={() => update(p.id, { ticketTemplate: v })}
                            className={`py-1.5 rounded-lg text-[11px] font-black border-2 ${(p.ticketTemplate || 'ticket') === v ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200' : 'border-slate-200 dark:border-slate-700'}`}>{t}</button>
                        ))}
                      </div>
                      <label className="flex items-center justify-between gap-2 text-xs font-bold" title="طول الورقة بقدر المحتوى وقص تلقائي — أوقفه فقط إن لم تكن الطابعة حرارية">
                        <span>✂️ حرارية: بطول الطلب + قص</span>
                        <Switch on={p.raw !== false} onClick={() => update(p.id, { raw: !(p.raw !== false) })} testId="printer-raw" color="bg-orange-500" />
                      </label>
                      <div className="text-xs font-bold pt-1 border-t border-slate-200 dark:border-slate-700">
                        <LayoutCtl right={p.padRightMm} left={p.padLeftMm} font={p.fontPct} onChange={(c) => update(p.id, { ...c, offsetMm: 0 })} />
                        <div className="mt-1.5">
                          <Stepper testId="printer-copies" label="عدد النسخ" value={clampCopies(p.copies)} unit="" step={1} min={1} max={5} onChange={(v) => update(p.id, { copies: v })} />
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  {showTests && <button onClick={() => testPrint(p.osPrinterName, p.name, { offsetMm: p.offsetMm, padRightMm: p.padRightMm, padLeftMm: p.padLeftMm, fontPct: p.fontPct, copies: p.copies, silent: p.silent !== false, priced: p.ticketTemplate === 'priced', raw: p.raw !== false })} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg text-xs font-bold">طباعة اختبار</button>}
                  <button
                    onClick={() => { if (window.confirm(`حذف الطابعة "${p.name}"؟`)) setPrinters((prev) => prev.filter((x) => x.id !== p.id)); }}
                    className="px-3 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg"
                  ><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {extra}
      {adding && (
        <div className="fixed inset-0 z-[9998] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-lg">ربط طابعة جديدة</h3>
              <button onClick={() => setAdding(false)}><X className="w-5 h-5" /></button>
            </div>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={restaurant ? "اسم للطابعة (مطبخ، مشروبات...)" : "اسم للطابعة (كاشير 2...)"} className={sel} />
            <OsSelect os={os} electron={electron} value={form.osPrinterName} onChange={(v) => setForm({ ...form, osPrinterName: v })} emptyLabel="اختر طابعة ويندوز" />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setAdding(false)} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-sm">إلغاء</button>
              <button onClick={addPrinter} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-black">حفظ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
