import { useCallback, useEffect, useMemo, useState } from 'react';
import DateField from './DateField';
import { DatabaseBackup, Download, Upload, RefreshCw, ShieldCheck, FolderOpen, FolderSymlink, HardDrive, FileArchive, AlertTriangle, CheckCircle2, X, Loader2 } from 'lucide-react';
import type { ArchiveConfig, BackupInfo } from '../storage/persistence';
import { flushNow } from '../storage/persistence';
import type { Invoice } from '../types';

const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn') : '—');
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Props {
  notify: (msg: string, ms?: number) => void;
  invoices?: Invoice[];
  onArchiveInvoice?: (inv: Invoice) => Promise<{ ok: boolean; skipped?: boolean; error?: string }>;
}

const card = 'bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-4';
const btn = 'px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50 transition';

function FolderRow({ dir, ok, onChoose, onOpen, onClear, busy, emptyText }: { dir: string; ok: boolean | null; onChoose: () => void; onOpen: () => void; onClear: () => void; busy: boolean; emptyText: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={`flex-1 min-w-[260px] flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm ${!dir ? 'border-dashed border-slate-300 dark:border-slate-600 text-slate-400' : ok ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20'}`}>
        {dir ? (ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />) : <FolderOpen className="w-4 h-4 shrink-0" />}
        <span className="font-mono text-xs truncate" dir="ltr" title={dir}>{dir || emptyText}</span>
      </div>
      <button disabled={busy} onClick={onChoose} className={`${btn} bg-cyan-600 hover:bg-cyan-700 text-white`}><FolderSymlink className="w-4 h-4" /> {dir ? 'تغيير المجلد' : 'اختيار المجلد'}</button>
      {dir && <button onClick={onOpen} className={`${btn} bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200`}><FolderOpen className="w-4 h-4" /> فتح</button>}
      {dir && <button onClick={onClear} title="إيقاف" className={`${btn} px-3 text-rose-600 bg-rose-50 dark:bg-rose-950/30`}><X className="w-4 h-4" /></button>}
    </div>
  );
}

export default function BackupManager({ notify, invoices = [], onArchiveInvoice }: Props) {
  const api = window.ledger;
  const [list, setList] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<ArchiveConfig | null>(null);
  const today = ymd(new Date());
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [bulk, setBulk] = useState<{ done: number; total: number; failed: number } | null>(null);

  const refresh = useCallback(async () => {
    if (!api) return;
    try { setList(await api.backup.list()); } catch { /* تجاهل */ }
    try { if (api.archive) setCfg(await api.archive.get()); } catch { /* تجاهل */ }
  }, [api]);

  useEffect(() => { void refresh(); }, [refresh]);

  const rangeInvoices = useMemo(
    () => invoices.filter(i => { const d = (i.date || '').slice(0, 10); return d >= from && d <= to; }),
    [invoices, from, to]
  );

  if (!api) {
    return (
      <div className={card}>
        <h3 className="font-black text-lg flex items-center gap-2 mb-2"><DatabaseBackup className="w-5 h-5 text-cyan-500" /> النسخ الاحتياطي والاستعادة</h3>
        <p className="text-sm font-semibold text-slate-500">متاح في النسخة المكتبية (المثبّتة) فقط.</p>
      </div>
    );
  }

  const guard = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { console.error(e); notify('تعذر تنفيذ العملية'); } finally { setBusy(false); }
  };

  const exportBackup = () => guard(async () => {
    await flushNow();
    const r = await api.backup.exportTo();
    if (r.ok) { notify('تم حفظ النسخة الاحتياطية'); void refresh(); }
  });

  const restore = (fn: () => Promise<{ ok: boolean; canceled?: boolean; error?: string }>) => guard(async () => {
    await flushNow();
    const r = await fn();
    if (!r.ok && !r.canceled) notify(r.error || 'فشلت الاستعادة');
  });

  const choose = (kind: 'backup' | 'invoices') => guard(async () => {
    if (!api.archive) return;
    await flushNow();
    const r = await api.archive.chooseDir(kind);
    setCfg(r.config);
    if (r.ok) notify(kind === 'backup' ? 'تم توجيه النسخ الاحتياطي للمجلد — وأُخذت أول نسخة فيه' : 'تم تحديد مجلد أرشيف الفواتير', 5000);
    else if (r.error) notify(r.error, 6000);
    void refresh();
  });

  const clear = (kind: 'backup' | 'invoices') => guard(async () => {
    if (!api.archive) return;
    if (!window.confirm(kind === 'backup' ? 'إيقاف النسخ إلى المجلد الخارجي؟ (النسخ الموجودة فيه لا تُحذف)' : 'إيقاف أرشفة الفواتير؟ (الملفات المؤرشفة لا تُحذف)')) return;
    setCfg(await api.archive.set({ clear: kind }));
  });

  const backupNow = () => guard(async () => {
    if (!api.archive) return;
    await flushNow();
    const r = await api.archive.backupNow();
    setCfg(r.config);
    if (r.config.backupDir && !r.mirrored) notify(`حُفظت نسخة على الجهاز، لكن تعذّر نسخها للمجلد الخارجي: ${r.config.lastMirrorError || ''}`, 7000);
    else notify(r.mirrored ? 'تم أخذ نسخة احتياطية وحفظها في المجلد الخارجي' : 'تم أخذ نسخة احتياطية على الجهاز', 4000);
    void refresh();
  });

  const toggle = (k: 'invoicePdf' | 'invoiceXml' | 'backupOnOpenClose') => guard(async () => {
    if (!api.archive || !cfg) return;
    setCfg(await api.archive.set({ [k]: k === 'backupOnOpenClose' ? cfg.backupOnOpenClose === false : !cfg[k] }));
  });

  const archiveRange = () => guard(async () => {
    if (!onArchiveInvoice || !rangeInvoices.length) return;
    let done = 0, failed = 0;
    setBulk({ done, total: rangeInvoices.length, failed });
    for (const inv of rangeInvoices) {
      const r = await onArchiveInvoice(inv);
      done++; if (!r.ok && !r.skipped) failed++;
      setBulk({ done, total: rangeInvoices.length, failed });
    }
    notify(`تمت أرشفة ${done - failed} فاتورة${failed ? ` — تعذّرت ${failed}` : ''}`, 5000);
    void refresh();
  });

  return (
    <div className="space-y-5" dir="rtl" data-testid="backup-page">
      {/* 1) توجيه النسخ الاحتياطي */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-black text-lg flex items-center gap-2"><HardDrive className="w-5 h-5 text-cyan-500" /> توجيه النسخ الاحتياطي</h3>
          <button disabled={busy} onClick={backupNow} className={`${btn} bg-emerald-600 hover:bg-emerald-700 text-white`} data-testid="backup-now">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseBackup className="w-4 h-4" />} نسخة احتياطية الآن
          </button>
        </div>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          اختر مجلداً على قرص آخر أو فلاش أو مجلد مزامنة سحابية (OneDrive / Google Drive). كل نسخة احتياطية — عند الفتح والإغلاق، وكل 6 ساعات أثناء التشغيل، وقبل التحديث، واليدوية — تُحفظ أيضاً فيه داخل مجلد <span className="font-mono">SmartLedger-Backups</span> (آخر 60 نسخة).
        </p>
        {cfg && (
          <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 px-3 py-2.5 cursor-pointer" data-testid="backup-open-close">
            <span>
              <span className="block text-sm font-black">نسخة احتياطية عند فتح البرنامج وعند إغلاقه</span>
              <span className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400">{cfg.backupOnOpenClose !== false ? 'مفعّل: نسخة مع كل فتح وكل إغلاق (تُنسخ للمجلد الخارجي أيضاً)' : 'متوقف: نسخة يومية واحدة عند أول فتح فقط'}</span>
            </span>
            <button type="button" role="switch" aria-checked={cfg.backupOnOpenClose !== false} onClick={(e) => { e.preventDefault(); toggle('backupOnOpenClose'); }} data-testid="toggle-backup-open-close"
              className={`w-12 h-6 rounded-full relative shrink-0 ${cfg.backupOnOpenClose !== false ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`w-4 h-4 bg-white rounded-full absolute top-1 ${cfg.backupOnOpenClose !== false ? 'left-1' : 'right-1'}`} /></button>
          </label>
        )}
        {cfg && (
          <FolderRow dir={cfg.backupDir} ok={cfg.backupDirOk} busy={busy} emptyText="لم يُحدَّد — النسخ تُحفظ على هذا الجهاز فقط"
            onChoose={() => choose('backup')} onOpen={() => api.archive?.open('backup')} onClear={() => clear('backup')} />
        )}
        {cfg?.backupDir && (
          <div className="text-xs font-semibold flex flex-wrap gap-x-6 gap-y-1">
            <span className="text-slate-500">آخر نسخة في المجلد: <b className="text-slate-700 dark:text-slate-200">{fmtTime(cfg.lastMirrorAt)}</b></span>
            {cfg.lastMirrorError && <span className="text-rose-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {cfg.lastMirrorError}</span>}
          </div>
        )}
      </div>

      {/* 2) أرشيف الفواتير */}
      <div className={card} data-testid="invoice-archive">
        <h3 className="font-black text-lg flex items-center gap-2"><FileArchive className="w-5 h-5 text-cyan-500" /> مجلد أرشيف الفواتير</h3>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          كل فاتورة ومرتجع يُحفظ تلقائياً عند إصداره في المجلد مرتباً حسب السنة والشهر، مثل <span className="font-mono" dir="ltr">2026\10\INV-00001.pdf</span>. ومع الفوترة الإلكترونية يُحفظ بجانبه ملف XML المختوم (والمعتمد من الهيئة للفاتورة الضريبية).
        </p>
        {cfg && (
          <FolderRow dir={cfg.invoiceDir} ok={cfg.invoiceDirOk} busy={busy} emptyText="لم يُحدَّد — الأرشفة متوقفة"
            onChoose={() => choose('invoices')} onOpen={() => api.archive?.open('invoices')} onClear={() => clear('invoices')} />
        )}
        {cfg?.invoiceDir && (
          <>
            <div className="flex flex-wrap gap-4 text-sm font-bold">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={cfg.invoicePdf} onChange={() => toggle('invoicePdf')} /> ملف PDF للفاتورة (A4)</label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={cfg.invoiceXml} onChange={() => toggle('invoiceXml')} /> ملف XML المختوم (الفوترة الإلكترونية)</label>
            </div>
            <div className="text-xs font-semibold flex flex-wrap gap-x-6 gap-y-1">
              <span className="text-slate-500">فواتير مؤرشفة: <b className="text-slate-700 dark:text-slate-200 font-mono">{cfg.archivedCount || 0}</b></span>
              {cfg.lastInvoiceError && <span className="text-rose-600 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {cfg.lastInvoiceError}</span>}
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 p-3 flex flex-wrap items-end gap-3">
              <div className="text-sm font-black w-full">أرشفة الفواتير السابقة</div>
              <label className="text-xs font-bold text-slate-500 space-y-1"><span className="block">من</span><DateField value={from} onChange={(v) => setFrom(v)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" /></label>
              <label className="text-xs font-bold text-slate-500 space-y-1"><span className="block">إلى</span><DateField value={to} onChange={(v) => setTo(v)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm" /></label>
              <button disabled={busy || !cfg.invoicePdf || rangeInvoices.length === 0} onClick={archiveRange} className={`${btn} bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700`} data-testid="archive-range">
                <FileArchive className="w-4 h-4" /> أرشفة {rangeInvoices.length} فاتورة
              </button>
              {bulk && (
                <div className="flex-1 min-w-[200px]">
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((bulk.done / Math.max(1, bulk.total)) * 100)}%` }} /></div>
                  <div className="text-[11px] font-bold text-slate-500 mt-1">{bulk.done} / {bulk.total}{bulk.failed ? ` — تعذّر ${bulk.failed}` : ''}</div>
                </div>
              )}
              <p className="w-full text-[11px] text-slate-400 font-semibold">الفواتير المؤرشفة مسبقاً لا تُكرر.</p>
            </div>
          </>
        )}
      </div>

      {/* 3) النسخ على الجهاز والاستعادة */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-black text-lg flex items-center gap-2"><DatabaseBackup className="w-5 h-5 text-cyan-500" /> النسخ على هذا الجهاز والاستعادة</h3>
          <div className="flex gap-2 flex-wrap">
            <button disabled={busy} onClick={exportBackup} className={`${btn} bg-cyan-600 hover:bg-cyan-700 text-white`}><Download className="w-4 h-4" /> تصدير نسخة إلى ملف</button>
            <button disabled={busy} onClick={() => restore(api.backup.restoreFromFile)} className={`${btn} bg-amber-500 hover:bg-amber-600 text-white`}><Upload className="w-4 h-4" /> استعادة من ملف</button>
            {api.archive && <button onClick={() => api.archive?.open('local')} className={`${btn} bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200`}><FolderOpen className="w-4 h-4" /> فتح المجلد</button>}
          </div>
        </div>

        <p className="flex items-start gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          يأخذ البرنامج نسخة تلقائية كل يوم وكل 6 ساعات أثناء التشغيل وقبل كل تحديث (يُحتفظ بآخر 30 على الجهاز). وقبل أي استعادة تُحفظ نسخة أمان من بياناتك الحالية.
        </p>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-black">النسخ التلقائية على هذا الجهاز ({list.length})</span>
            <button onClick={refresh} className="text-xs font-bold text-slate-500 flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> تحديث</button>
          </div>
          <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700">
            {list.length === 0 && <div className="p-4 text-center text-xs font-bold text-slate-400">لا توجد نسخ بعد.</div>}
            {list.map((b) => (
              <div key={b.name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-mono text-xs truncate" dir="ltr">{b.name}</div>
                  <div className="text-[11px] text-slate-500 font-semibold">{fmtTime(b.mtime)} — {fmtSize(b.size)}</div>
                </div>
                <button disabled={busy} onClick={() => restore(() => api.backup.restoreFromAuto(b.name))} className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 text-xs font-black disabled:opacity-50">استعادة</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
