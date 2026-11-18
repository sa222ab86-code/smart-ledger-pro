import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import {
  Calculator, LayoutDashboard, BookOpen, ListTree, FileSpreadsheet, Settings2, Plus, Trash2, Pencil, Printer, FileDown, Save, X,
  Lock, Search, ArrowDownCircle, ArrowUpCircle, Scale, Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, Building2, Receipt,
} from 'lucide-react';
import type { Customer, Supplier } from '../types';
import {
  type Account, type AccountingSettings, type AccountRole, type AccountType, type JournalEntry, type JournalLine, type LedgerEntry, type SourceData,
  DEFAULT_ACCOUNTS, DEFAULT_ROLES, ROLE_LABELS, TYPE_LABELS, KIND_LABELS, buildLedger, computeBalances, natural, flattenTree, rollupNet,
  validateEntry, nextEntryNumber, lineTotals, stockValuation, roleOf, fmtMoney, dashboardFigures, debitNature,
  trialBalanceReport, incomeStatementReport, balanceSheetReport, accountStatementReport, journalReport, partyBalancesReport,
} from '../utils/accounting';
import { reportToCsv, reportToHtml, reportLandscape, type ReportTable } from '../utils/reports';
import { exportHtmlAsPdf, printHtmlDocument, type PrintSettings } from '../utils/printing';
import { localTimestamp, saveTextFile, todayStamp } from '../utils/files';
import { tafqeet } from '../utils/tafqeet';

/** مصدر بيانات فرع (في المركز): يُحمَّل عند اختياره */
export interface BranchSource { id: string; label: string; load: () => Promise<SourceData> }

interface Props {
  accounts: Account[];
  setAccounts: Dispatch<SetStateAction<Account[]>>;
  entries: JournalEntry[];
  setEntries: Dispatch<SetStateAction<JournalEntry[]>>;
  settings: AccountingSettings;
  setSettings: Dispatch<SetStateAction<AccountingSettings>>;
  /** بيانات هذا الجهاز (المستندات التي تُشتق منها القيود الآلية) */
  local: SourceData;
  localLabel: string;
  customers: Customer[];
  suppliers: Supplier[];
  /** المركز الرئيسي: الفروع المرتبطة (للتقارير لكل فرع والموحّدة) */
  branches?: BranchSource[];
  company: { name: string; nameEn?: string; vat: string; address?: string; shortAddress?: string };
  printSettings: PrintSettings;
  userName: string;
  canManage: boolean;
  deviceTag?: string;
  notify: (msg: string, ms?: number) => void;
}

type Tab = 'dashboard' | 'journal' | 'vouchers' | 'accounts' | 'reports' | 'settings';
type ReportId = 'trial' | 'income' | 'balance' | 'statement' | 'journal' | 'customers' | 'suppliers';

const card = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4';
const input = 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-500 text-slate-700 dark:text-slate-200';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary = `${btn} bg-teal-600 hover:bg-teal-700 text-white`;
const btnGhost = `${btn} border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200`;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthStart = () => { const n = new Date(); return ymd(new Date(n.getFullYear(), n.getMonth(), 1)); };
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/* ---------------------------------------------------------------- *
 * اختيار حساب (الحسابات الفرعية فقط، مجمّعة حسب النوع)
 * ---------------------------------------------------------------- */
function AccountSelect({ accounts, value, onChange, filter, className = '', placeholder = 'اختر الحساب...' }: {
  accounts: Account[]; value: string; onChange: (id: string) => void; filter?: (a: Account) => boolean; className?: string; placeholder?: string;
}) {
  const tree = flattenTree(accounts);
  const types: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];
  return (
    <select className={`${input} ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {types.map((t) => {
        const list = tree.filter((x) => x.acc.type === t && !x.acc.isGroup && !x.acc.disabled && (!filter || filter(x.acc)));
        if (!list.length) return null;
        return (
          <optgroup key={t} label={TYPE_LABELS[t]}>
            {list.map(({ acc }) => <option key={acc.id} value={acc.id}>{acc.code} — {acc.name}</option>)}
          </optgroup>
        );
      })}
    </select>
  );
}

/* ---------------------------------------------------------------- *
 * عرض تقرير (جدول + بطاقات) بنفس قالب تقارير البرنامج
 * ---------------------------------------------------------------- */
function ReportBox({ report, onPrint, onPdf, onCsv, busy }: { report: ReportTable; onPrint: () => void; onPdf: () => void; onCsv: () => void; busy: boolean }) {
  return (
    <div className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-lg font-black text-slate-800 dark:text-white">{report.title}</div>
          <div className="text-xs text-slate-500">{report.period}</div>
        </div>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={onPrint} disabled={busy}><Printer className="w-4 h-4" />طباعة</button>
          <button className={btnGhost} onClick={onPdf} disabled={busy}><FileDown className="w-4 h-4" />PDF</button>
          <button className={btnGhost} onClick={onCsv} disabled={busy}><FileSpreadsheet className="w-4 h-4" />Excel</button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {report.summary.map((s) => (
          <div key={s.label} className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-2.5">
            <div className="text-[11px] text-slate-500">{s.label}</div>
            <div className="font-black text-slate-800 dark:text-white" dir="auto">{s.value}</div>
          </div>
        ))}
      </div>
      <div className="overflow-auto max-h-[60vh] rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-teal-900 text-white">
            <tr>{report.columns.map((c) => <th key={c} className="px-2 py-2 font-bold text-xs whitespace-nowrap">{c}</th>)}</tr>
          </thead>
          <tbody>
            {report.rows.map((r, i) => {
              const st = report.rowStyles?.[i];
              if (st === 'section') return <tr key={i} className="bg-teal-50 dark:bg-teal-950/40"><td colSpan={report.columns.length} className="px-2 py-1.5 font-black text-teal-800 dark:text-teal-300">{String(r[0] ?? '')}</td></tr>;
              const cls = st === 'net' ? 'bg-teal-800 text-white font-black' : st === 'subtotal' ? 'font-black border-t-2 border-teal-700' : 'odd:bg-white even:bg-slate-50 dark:odd:bg-slate-900 dark:even:bg-slate-950';
              return (
                <tr key={i} className={cls}>
                  {r.map((c, j) => <td key={j} className={`px-2 py-1.5 border-b border-slate-100 dark:border-slate-800 ${j === 0 || j === 1 ? 'text-right' : 'text-center font-mono'} whitespace-pre-wrap`}>{c == null ? '' : String(c)}</td>)}
                </tr>
              );
            })}
            {report.rows.length > 0 && !report.noTotals && (
              <tr className="bg-teal-900 text-white font-black">{report.totals.map((c, j) => <td key={j} className={`px-2 py-2 ${j < 2 ? 'text-right' : 'text-center font-mono'}`}>{c == null ? '' : String(c)}</td>)}</tr>
            )}
          </tbody>
        </table>
        {report.rows.length === 0 && <div className="p-8 text-center text-sm text-slate-500">لا توجد بيانات في هذه الفترة.</div>}
      </div>
      {report.notes?.length ? <ul className="text-xs text-slate-500 list-disc pr-5 space-y-0.5">{report.notes.map((n) => <li key={n}>{n}</li>)}</ul> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * محرر القيد اليومي
 * ---------------------------------------------------------------- */
interface EditorProps {
  initial: JournalEntry;
  accounts: Account[];
  customers: Customer[];
  suppliers: Supplier[];
  settings: AccountingSettings;
  isNew: boolean;
  onSave: (e: JournalEntry) => void;
  onClose: () => void;
}
function EntryEditor({ initial, accounts, customers, suppliers, settings, isNew, onSave, onClose }: EditorProps) {
  const [e, setE] = useState<JournalEntry>(() => ({ ...initial, lines: initial.lines.length ? initial.lines.map((l) => ({ ...l })) : [blankLine(), blankLine()] }));
  const [errors, setErrors] = useState<string[]>([]);
  const arId = roleOf(settings, 'ar');
  const apId = roleOf(settings, 'ap');
  const t = lineTotals(e.lines);

  const setLine = (i: number, patch: Partial<JournalLine>) => setE((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const setAmount = (i: number, side: 'debit' | 'credit', v: string) => {
    const n = Math.max(0, Number(v) || 0);
    setLine(i, side === 'debit' ? { debit: n, credit: n > 0 ? 0 : e.lines[i].credit } : { credit: n, debit: n > 0 ? 0 : e.lines[i].debit });
  };
  const balanceLast = () => {
    if (Math.abs(t.diff) < 0.005) return;
    const i = e.lines.length - 1;
    if (t.diff > 0) setLine(i, { credit: Math.round(((e.lines[i].credit || 0) + t.diff) * 100) / 100, debit: 0 });
    else setLine(i, { debit: Math.round(((e.lines[i].debit || 0) - t.diff) * 100) / 100, credit: 0 });
  };
  const save = () => {
    const lines = e.lines
      .filter((l) => (Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0)
      .map((l) => ({ ...l, debit: Math.round((Number(l.debit) || 0) * 100) / 100, credit: Math.round((Number(l.credit) || 0) * 100) / 100 }));
    const out = { ...e, memo: e.memo.trim(), lines };
    const errs = validateEntry(out, accounts, settings.lockDate);
    if (!out.memo) errs.unshift('اكتب بيان القيد');
    setErrors(errs);
    if (!errs.length) onSave(out);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" dir="rtl" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="font-black text-lg text-slate-800 dark:text-white">{isNew ? 'قيد جديد' : `تعديل ${e.number}`} — {KIND_LABELS[e.kind]}</div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="grid md:grid-cols-4 gap-2">
            <label className="text-xs font-bold text-slate-500 space-y-1"><span>التاريخ</span><input type="date" className={`${input} w-full`} value={e.date.slice(0, 10)} onChange={(ev) => setE({ ...e, date: ev.target.value })} /></label>
            <label className="text-xs font-bold text-slate-500 space-y-1"><span>النوع</span>
              <select className={`${input} w-full`} value={e.kind} onChange={(ev) => setE({ ...e, kind: ev.target.value as JournalEntry['kind'] })} disabled={!isNew}>
                <option value="manual">قيد يومية</option><option value="opening">قيد افتتاحي</option><option value="adjust">قيد تسوية</option>
                <option value="receipt">سند قبض</option><option value="payment">سند صرف</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-500 space-y-1 md:col-span-2"><span>البيان</span><input className={`${input} w-full`} value={e.memo} onChange={(ev) => setE({ ...e, memo: ev.target.value })} placeholder="مثال: إثبات رأس المال / سداد إيجار شهر..." /></label>
            <label className="text-xs font-bold text-slate-500 space-y-1"><span>المرجع (اختياري)</span><input className={`${input} w-full`} value={e.reference || ''} onChange={(ev) => setE({ ...e, reference: ev.target.value })} placeholder="رقم شيك / فاتورة" /></label>
          </div>
          {e.kind === 'opening' && <div className="text-xs rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 p-2.5">القيد الافتتاحي: أدخل أرصدة الحسابات في تاريخ بدء العمل بالبرنامج (الصندوق، البنك، المخزون، العملاء، الموردين...) واجعل الطرف المقابل «أرصدة افتتاحية» أو «رأس المال».</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-slate-500">
                <th className="text-right p-1 w-[34%]">الحساب</th><th className="text-right p-1 w-[18%]">العميل / المورد</th><th className="p-1 w-[12%]">مدين</th><th className="p-1 w-[12%]">دائن</th><th className="text-right p-1">بيان السطر</th><th />
              </tr></thead>
              <tbody>
                {e.lines.map((l, i) => {
                  const party = l.accountId === arId ? 'customer' : l.accountId === apId ? 'supplier' : null;
                  const list = party === 'customer' ? customers : party === 'supplier' ? suppliers : [];
                  return (
                    <tr key={i}>
                      <td className="p-1"><AccountSelect accounts={accounts} value={l.accountId} onChange={(id) => setLine(i, { accountId: id, partyId: undefined, partyName: undefined, partyType: undefined })} className="w-full" /></td>
                      <td className="p-1">
                        {party ? (
                          <select className={`${input} w-full`} value={l.partyId || ''} onChange={(ev) => { const p = list.find((x) => x.id === ev.target.value); setLine(i, { partyType: party, partyId: p?.id, partyName: p?.name }); }}>
                            <option value="">— بدون —</option>
                            {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="p-1"><input type="number" min={0} step="0.01" className={`${input} w-full text-center font-mono`} value={l.debit || ''} onChange={(ev) => setAmount(i, 'debit', ev.target.value)} /></td>
                      <td className="p-1"><input type="number" min={0} step="0.01" className={`${input} w-full text-center font-mono`} value={l.credit || ''} onChange={(ev) => setAmount(i, 'credit', ev.target.value)} /></td>
                      <td className="p-1"><input className={`${input} w-full`} value={l.memo || ''} onChange={(ev) => setLine(i, { memo: ev.target.value })} /></td>
                      <td className="p-1"><button className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg disabled:opacity-30" disabled={e.lines.length <= 2} onClick={() => setE({ ...e, lines: e.lines.filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-black">
                  <td className="p-1" colSpan={2}>
                    <button className={btnGhost} onClick={() => setE({ ...e, lines: [...e.lines, blankLine()] })}><Plus className="w-4 h-4" />سطر</button>
                    {Math.abs(t.diff) >= 0.005 && <button className={`${btnGhost} mr-2`} onClick={balanceLast}><Scale className="w-4 h-4" />موازنة آخر سطر</button>}
                  </td>
                  <td className="p-1 text-center font-mono">{fmtMoney(t.debit)}</td>
                  <td className="p-1 text-center font-mono">{fmtMoney(t.credit)}</td>
                  <td className={`p-1 text-xs ${Math.abs(t.diff) < 0.005 ? 'text-emerald-600' : 'text-rose-600'}`} colSpan={2}>{Math.abs(t.diff) < 0.005 ? 'متوازن ✓' : `الفرق ${fmtMoney(Math.abs(t.diff))}`}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {errors.length > 0 && <ul className="text-sm rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 p-3 list-disc pr-6 space-y-0.5">{errors.map((x) => <li key={x}>{x}</li>)}</ul>}
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button className={btnGhost} onClick={onClose}>إلغاء</button>
          <button className={btnPrimary} onClick={save}><Save className="w-4 h-4" />حفظ القيد</button>
        </div>
      </div>
    </div>
  );
}
const blankLine = (): JournalLine => ({ accountId: '', debit: 0, credit: 0 });

/* ---------------------------------------------------------------- *
 * الشاشة الرئيسية
 * ---------------------------------------------------------------- */
export default function AccountingManager(props: Props) {
  const { accounts, setAccounts, entries, setEntries, settings, setSettings, local, localLabel, customers, suppliers, branches, company, printSettings, userName, canManage, deviceTag, notify } = props;
  const [tab, setTab] = useState<Tab>('dashboard');
  const [scope, setScope] = useState<string>('local');
  const [remote, setRemote] = useState<Record<string, SourceData>>({});
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(ymd(new Date()));
  const [editing, setEditing] = useState<{ entry: JournalEntry; isNew: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const accs = accounts.length ? accounts : DEFAULT_ACCOUNTS;
  const readOnlyScope = scope !== 'local';
  // المصفوفات تتغير مرجعياً فقط عند تعديلها — مفتاح ثابت للفروع بدل مصفوفة جديدة في كل رسم
  const branchKey = (branches || []).map((b) => `${b.id}:${b.label}`).join('|');
  const canWrite = canManage && !readOnlyScope;

  // تحميل بيانات الفروع عند اختيارها (المركز)
  useEffect(() => {
    if (scope === 'local' || !branches?.length) return;
    const need = scope === 'all' ? branches : branches.filter((b) => b.id === scope);
    const missing = need.filter((b) => !remote[b.id]);
    if (!missing.length) return;
    setLoading(true);
    Promise.all(missing.map(async (b) => [b.id, await b.load()] as const))
      .then((list) => setRemote((p) => { const n = { ...p }; for (const [id, d] of list) n[id] = d; return n; }))
      .catch((e) => notify(`تعذّر تحميل بيانات الفرع: ${String((e as Error)?.message || e)}`, 5000))
      .finally(() => setLoading(false));
  }, [scope, branchKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const costMap = (src: SourceData) => new Map((src.products || []).map((p) => [p.id, Number(p.cost) || 0] as [string, number]));
  const ledger: LedgerEntry[] = useMemo(() => {
    const mine = () => buildLedger({ ...local, journalEntries: entries }, settings, { productCost: costMap(local), branch: scope === 'all' ? localLabel : undefined });
    if (scope === 'local') return mine();
    const list = scope === 'all' ? branches || [] : (branches || []).filter((b) => b.id === scope);
    const out: LedgerEntry[] = scope === 'all' ? mine() : [];
    for (const b of list) {
      const d = remote[b.id];
      if (d) out.push(...buildLedger(d, settings, { productCost: costMap(d), branch: scope === 'all' ? b.label : undefined }));
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }, [local.invoices, local.purchases, local.purchaseReturns, local.cashMovements, local.products, entries, settings, scope, remote, branchKey, localLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const scopeLabel = scope === 'local' ? (branches?.length ? localLabel : '') : scope === 'all' ? 'موحّد (كل الفروع)' : branches?.find((b) => b.id === scope)?.label || '';

  /* ---------- أدوات الطباعة والتصدير ---------- */
  const run = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); try { await fn(); } catch (e) { console.error(e); notify('تعذّر تنفيذ العملية'); } finally { setBusy(false); } };
  const printReport = (r: ReportTable) => run(async () => {
    const res = await printHtmlDocument(reportToHtml(r, company), { silent: printSettings.silent && !!printSettings.a4Printer, deviceName: printSettings.a4Printer || undefined, pageSize: 'A4', landscape: reportLandscape(r) });
    notify(res.ok ? 'تم إرسال التقرير للطباعة' : 'لم تتم الطباعة');
  });
  const pdfReport = (r: ReportTable) => run(async () => { if (await exportHtmlAsPdf(reportToHtml(r, company), `accounting-${todayStamp()}.pdf`, reportLandscape(r))) notify('تم التصدير'); });
  const csvReport = (r: ReportTable) => run(async () => { if (await saveTextFile(`accounting-${todayStamp()}.csv`, reportToCsv(r, company.name), 'csv')) notify('تم تصدير الملف (يفتح في Excel)'); });

  /* ---------- حفظ القيود ---------- */
  const saveEntry = (e: JournalEntry, isNew: boolean) => {
    const now = localTimestamp();
    if (isNew) {
      const withNo = { ...e, number: nextEntryNumber(entries, e.kind, deviceTag), createdAt: now, createdBy: userName, ...(deviceTag ? { deviceTag } : {}) };
      setEntries((p) => [withNo, ...p]);
      notify(`تم حفظ ${KIND_LABELS[e.kind]} ${withNo.number}`);
    } else {
      setEntries((p) => p.map((x) => (x.id === e.id ? { ...e, updatedAt: now, updatedBy: userName } : x)));
      notify('تم حفظ التعديل');
    }
    setEditing(null);
  };
  const locked = (date: string) => !!settings.lockDate && date.slice(0, 10) <= settings.lockDate;
  const deleteEntry = (e: JournalEntry) => {
    if (locked(e.date)) { notify('القيد داخل فترة مقفلة'); return; }
    if (!window.confirm(`حذف ${KIND_LABELS[e.kind]} ${e.number}؟ لا يمكن التراجع.`)) return;
    setEntries((p) => p.filter((x) => x.id !== e.id));
    notify('تم الحذف');
  };
  const newEntry = (kind: JournalEntry['kind'] = 'manual'): JournalEntry => ({ id: newId('je'), number: '', date: ymd(new Date()), kind, memo: kind === 'opening' ? 'القيد الافتتاحي' : '', lines: [], createdAt: '' });

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'dashboard', label: 'الملخص المالي', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'journal', label: 'القيود اليومية', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'vouchers', label: 'سندات القبض والصرف', icon: <Receipt className="w-4 h-4" /> },
    { id: 'accounts', label: 'دليل الحسابات', icon: <ListTree className="w-4 h-4" /> },
    { id: 'reports', label: 'القوائم والتقارير', icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'settings', label: 'إعدادات المحاسبة', icon: <Settings2 className="w-4 h-4" /> },
  ];

  const periodBar = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-xs font-bold text-slate-500">الفترة</span>
      <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
      <span className="text-slate-400">←</span>
      <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
      <button className={btnGhost} onClick={() => { setFrom(monthStart()); setTo(ymd(new Date())); }}>هذا الشهر</button>
      <button className={btnGhost} onClick={() => { setFrom(yearStart()); setTo(ymd(new Date())); }}>هذه السنة</button>
      <button className={btnGhost} onClick={() => { setFrom(''); setTo(''); }}>الكل</button>
    </div>
  );

  return (
    <div className="p-4 2xl:p-6 max-w-7xl mx-auto space-y-4 text-right dark:text-white" dir="rtl" data-testid="accounting-view">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 rounded-xl"><Calculator className="w-8 h-8" /></div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white">المحاسبة <span className="text-xs align-middle bg-amber-400 text-black font-black rounded-md px-1.5 py-0.5 mr-1">PRO</span></h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold mt-1">قيد مزدوج كامل — القيود تُرحَّل آلياً من المبيعات والمشتريات والصندوق، مع القيود اليدوية والسندات والقوائم المالية</p>
          </div>
        </div>
        {!!branches?.length && (
          <label className="flex items-center gap-2 text-sm font-bold">
            <Building2 className="w-4 h-4 text-teal-600" />
            <select className={input} value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="local">{localLabel}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              <option value="all">موحّد — كل الفروع</option>
            </select>
            {loading && <Loader2 className="w-4 h-4 animate-spin text-teal-600" />}
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`${btn} ${tab === t.id ? 'bg-teal-600 text-white' : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{t.icon}{t.label}</button>
        ))}
      </div>
      {readOnlyScope && <div className="text-xs rounded-xl bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-300 p-2.5">تعرض الآن بيانات {scopeLabel} كما وصلت من آخر مزامنة — للاطلاع فقط. القيود اليدوية للفرع تُسجَّل من جهاز الفرع نفسه.</div>}

      {tab === 'dashboard' && <Dashboard {...{ accs, ledger, settings, from, to, periodBar, local, canWrite, readOnlyScope, setEditing, newEntry, notify }} />}
      {tab === 'journal' && <JournalTab {...{ accs, ledger, entries, from, to, periodBar, canWrite, locked, setEditing, deleteEntry, newEntry, printReport, pdfReport, csvReport, busy, scopeLabel }} />}
      {tab === 'vouchers' && <VouchersTab {...{ accs, entries, settings, setSettings, customers, suppliers, canWrite, saveEntry, deleteEntry, locked, company, local, printSettings, notify, userName }} />}
      {tab === 'accounts' && <AccountsTab {...{ accs, setAccounts, ledger, canManage: canWrite, notify, from, to, setTab, onStatement: () => setTab('reports') }} />}
      {tab === 'reports' && <ReportsTab {...{ accs, ledger, settings, from, to, periodBar, customers, suppliers, printReport, pdfReport, csvReport, busy, scopeLabel }} />}
      {tab === 'settings' && <SettingsTab {...{ accs, setAccounts, settings, setSettings, canManage: canManage, notify }} />}

      {editing && (
        <EntryEditor initial={editing.entry} isNew={editing.isNew} accounts={accs} customers={customers} suppliers={suppliers} settings={settings}
          onSave={(e) => saveEntry(e, editing.isNew)} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * الملخص المالي
 * ---------------------------------------------------------------- */
function Dashboard({ accs, ledger, settings, from, to, periodBar, local, canWrite, readOnlyScope, setEditing, newEntry, notify }: {
  accs: Account[]; ledger: LedgerEntry[]; settings: AccountingSettings; from: string; to: string; periodBar: ReactNode; local: SourceData;
  canWrite: boolean; readOnlyScope: boolean; setEditing: (v: { entry: JournalEntry; isNew: boolean } | null) => void; newEntry: (k?: JournalEntry['kind']) => JournalEntry; notify: (m: string) => void;
}) {
  const f = useMemo(() => dashboardFigures(accs, ledger, settings, from || undefined, to || undefined), [accs, ledger, settings, from, to]);
  const stock = useMemo(() => stockValuation(local.products), [local.products]);
  const invDiff = Math.round((stock - f.inventory) * 100) / 100;
  const C = ({ label, value, tone = 'slate', hint }: { label: string; value: number; tone?: string; hint?: string }) => (
    <div className={`${card} !p-3`}>
      <div className="text-xs text-slate-500 font-bold">{label}</div>
      <div className={`text-xl font-black font-mono mt-1 ${tone === 'green' ? 'text-emerald-600' : tone === 'red' ? 'text-rose-600' : 'text-slate-800 dark:text-white'}`} dir="ltr">{fmtMoney(value)}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
  const adjust = () => {
    const amt = Math.abs(invDiff);
    const inv = roleOf(settings, 'inventory'), adj = roleOf(settings, 'invAdjust');
    const e = newEntry('adjust');
    e.memo = `تسوية رصيد المخزون مع الجرد الفعلي (${fmtMoney(stock)})`;
    e.lines = invDiff > 0
      ? [{ accountId: inv, debit: amt, credit: 0 }, { accountId: adj, debit: 0, credit: amt }]
      : [{ accountId: adj, debit: amt, credit: 0 }, { accountId: inv, debit: 0, credit: amt }];
    setEditing({ entry: e, isNew: true });
    notify('راجع قيد التسوية ثم احفظه');
  };
  const recent = ledger.slice(-12).reverse();
  return (
    <div className="space-y-4">
      {periodBar}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <C label="صافي الإيرادات" value={f.income.revenue} />
        <C label="مجمل الربح" value={f.income.gross} tone={f.income.gross >= 0 ? 'green' : 'red'} />
        <C label="المصروفات (بدون التكلفة)" value={f.income.expenses} />
        <C label={f.income.net >= 0 ? 'صافي الربح' : 'صافي الخسارة'} value={f.income.net} tone={f.income.net >= 0 ? 'green' : 'red'} />
      </div>
      <div className="text-xs font-black text-slate-500">الأرصدة حتى {to || 'اليوم'}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <C label="الصندوق" value={f.cash} />
        <C label="الشبكة / مدى (تحت التحصيل)" value={f.card} hint="يُنقل للبنك بقيد عند إيداع التسوية" />
        <C label="البنك" value={f.bank} />
        <C label="ضريبة مستحقة للهيئة" value={f.vatPayable} hint="المخرجات − المدخلات" />
        <C label="العملاء (مستحق لنا)" value={f.ar} />
        <C label="الموردون (مستحق علينا)" value={f.ap} />
        <C label="المخزون (دفترياً)" value={f.inventory} />
        <div className={`${card} !p-3`}>
          <div className="text-xs text-slate-500 font-bold">المخزون الفعلي (الكمية × التكلفة)</div>
          <div className="text-xl font-black font-mono mt-1" dir="ltr">{fmtMoney(stock)}</div>
          {!readOnlyScope && Math.abs(invDiff) >= 0.01 && (
            <div className="text-[11px] mt-1 flex items-center justify-between gap-1">
              <span className="text-amber-600">فرق {fmtMoney(invDiff)}</span>
              {canWrite && <button className="text-teal-700 dark:text-teal-400 font-bold underline" onClick={adjust}>قيد تسوية</button>}
            </div>
          )}
        </div>
      </div>
      <div className={card}>
        <div className="font-black mb-2">آخر القيود</div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          {recent.length === 0 && <div className="text-slate-500 text-xs py-4 text-center">لا توجد قيود بعد — ابدأ بالقيد الافتتاحي من «القيود اليومية».</div>}
          {recent.map((e) => {
            const t = lineTotals(e.lines);
            return (
              <div key={e.id} className="flex items-center gap-3 py-1.5">
                <span className="text-xs font-mono text-slate-500 w-32 shrink-0">{e.date.slice(0, 16)}</span>
                <span className={`text-[11px] font-bold rounded-md px-1.5 py-0.5 shrink-0 ${e.auto ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' : 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'}`}>{KIND_LABELS[e.kind]}</span>
                <span className="flex-1 truncate">{e.memo}</span>
                <span className="font-mono font-bold" dir="ltr">{fmtMoney(t.debit)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * القيود اليومية
 * ---------------------------------------------------------------- */
function JournalTab({ accs, ledger, entries, from, to, periodBar, canWrite, locked, setEditing, deleteEntry, newEntry, printReport, pdfReport, csvReport, busy, scopeLabel }: {
  accs: Account[]; ledger: LedgerEntry[]; entries: JournalEntry[]; from: string; to: string; periodBar: ReactNode; canWrite: boolean;
  locked: (d: string) => boolean; setEditing: (v: { entry: JournalEntry; isNew: boolean } | null) => void; deleteEntry: (e: JournalEntry) => void;
  newEntry: (k?: JournalEntry['kind']) => JournalEntry; printReport: (r: ReportTable) => void; pdfReport: (r: ReportTable) => void; csvReport: (r: ReportTable) => void; busy: boolean; scopeLabel: string;
}) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string>('');
  const [showAuto, setShowAuto] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(200);
  const byId = useMemo(() => new Map(accs.map((a) => [a.id, a])), [accs]);
  const manual = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ledger.filter((e) => {
      const d = e.date.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (!showAuto && e.auto) return false;
      if (kind && e.kind !== kind) return false;
      if (s && !(`${e.number} ${e.memo} ${e.lines.map((l) => `${l.memo || ''} ${l.partyName || ''}`).join(' ')}`.toLowerCase().includes(s))) return false;
      return true;
    }).reverse();
  }, [ledger, from, to, showAuto, kind, q]);
  const report = () => journalReport(accs, list.slice().reverse(), from || undefined, to || undefined, scopeLabel);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {periodBar}
        {canWrite && (
          <div className="flex gap-2">
            <button className={btnPrimary} onClick={() => setEditing({ entry: newEntry('manual'), isNew: true })}><Plus className="w-4 h-4" />قيد يومية</button>
            <button className={btnGhost} onClick={() => setEditing({ entry: newEntry('opening'), isNew: true })}>قيد افتتاحي</button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search className="w-4 h-4 absolute right-2.5 top-2.5 text-slate-400" /><input className={`${input} pr-8 w-64`} placeholder="بحث بالرقم أو البيان أو العميل..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className={input} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">كل الأنواع</option>
          {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm font-bold"><input type="checkbox" checked={showAuto} onChange={(e) => setShowAuto(e.target.checked)} />إظهار القيود الآلية</label>
        <span className="text-xs text-slate-500 mr-auto">{list.length} قيد</span>
        <button className={btnGhost} disabled={busy} onClick={() => printReport(report())}><Printer className="w-4 h-4" />طباعة</button>
        <button className={btnGhost} disabled={busy} onClick={() => pdfReport(report())}><FileDown className="w-4 h-4" />PDF</button>
        <button className={btnGhost} disabled={busy} onClick={() => csvReport(report())}><FileSpreadsheet className="w-4 h-4" />Excel</button>
      </div>
      <div className={`${card} !p-0 overflow-hidden`}>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {list.length === 0 && <div className="p-8 text-center text-sm text-slate-500">لا توجد قيود.</div>}
          {list.slice(0, limit).map((e) => {
            const t = lineTotals(e.lines);
            const m = manual.get(e.id);
            const isOpen = open === e.id;
            return (
              <div key={e.id}>
                <button className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 text-right" onClick={() => setOpen(isOpen ? null : e.id)}>
                  {isOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronLeft className="w-4 h-4 shrink-0" />}
                  <span className="text-xs font-mono text-slate-500 w-32 shrink-0">{e.date.slice(0, 16)}</span>
                  <span className="text-xs font-mono font-bold w-28 shrink-0 truncate">{e.number || '—'}</span>
                  <span className={`text-[11px] font-bold rounded-md px-1.5 py-0.5 shrink-0 ${e.auto ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' : 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'}`}>{KIND_LABELS[e.kind]}</span>
                  {e.branch && <span className="text-[11px] rounded-md px-1.5 py-0.5 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 shrink-0">{e.branch}</span>}
                  <span className="flex-1 truncate">{e.memo}</span>
                  {Math.abs(t.diff) >= 0.01 && <AlertTriangle className="w-4 h-4 text-rose-500" />}
                  <span className="font-mono font-bold" dir="ltr">{fmtMoney(t.debit)}</span>
                </button>
                {isOpen && (
                  <div className="bg-slate-50 dark:bg-slate-950 px-10 py-2">
                    <table className="w-full text-sm">
                      <thead><tr className="text-xs text-slate-500"><th className="text-right py-1">الحساب</th><th className="text-right">البيان</th><th>مدين</th><th>دائن</th></tr></thead>
                      <tbody>
                        {e.lines.map((l, i) => {
                          const a = byId.get(l.accountId);
                          return (
                            <tr key={i} className="border-t border-slate-200 dark:border-slate-800">
                              <td className={`py-1 ${l.credit ? 'pr-6' : ''}`}>{a ? `${a.code} — ${a.name}` : l.accountId}{l.partyName ? <span className="text-xs text-slate-500"> / {l.partyName}</span> : null}</td>
                              <td className="text-xs text-slate-500">{l.memo}</td>
                              <td className="text-center font-mono">{l.debit ? fmtMoney(l.debit) : ''}</td>
                              <td className="text-center font-mono">{l.credit ? fmtMoney(l.credit) : ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                      {e.auto ? <span>قيد آلي من المستند — يتغير تلقائياً بتعديل المستند نفسه.</span> : m && (
                        <>
                          <span>{m.createdBy ? `أنشأه ${m.createdBy}` : ''} {m.createdAt ? `في ${m.createdAt}` : ''}{m.updatedAt ? ` — عُدّل ${m.updatedAt}${m.updatedBy ? ` (${m.updatedBy})` : ''}` : ''}{m.reference ? ` — المرجع: ${m.reference}` : ''}</span>
                          {canWrite && (locked(m.date)
                            ? <span className="mr-auto flex items-center gap-1"><Lock className="w-3.5 h-3.5" />فترة مقفلة</span>
                            : <span className="mr-auto flex gap-2">
                                <button className={btnGhost} onClick={() => setEditing({ entry: m, isNew: false })}><Pencil className="w-3.5 h-3.5" />تعديل</button>
                                <button className={`${btnGhost} text-rose-600`} onClick={() => deleteEntry(m)}><Trash2 className="w-3.5 h-3.5" />حذف</button>
                              </span>)}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {list.length > limit && <button className="w-full py-2 text-sm font-bold text-teal-700 hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => setLimit(limit + 300)}>عرض المزيد ({list.length - limit})</button>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * سندات القبض والصرف + تصنيف حركات الصندوق
 * ---------------------------------------------------------------- */
function VouchersTab({ accs, entries, settings, setSettings, customers, suppliers, canWrite, saveEntry, deleteEntry, locked, company, local, printSettings, notify, userName }: {
  accs: Account[]; entries: JournalEntry[]; settings: AccountingSettings; setSettings: Dispatch<SetStateAction<AccountingSettings>>;
  customers: Customer[]; suppliers: Supplier[]; canWrite: boolean; saveEntry: (e: JournalEntry, isNew: boolean) => void; deleteEntry: (e: JournalEntry) => void;
  locked: (d: string) => boolean; company: Props['company']; local: SourceData; printSettings: PrintSettings; notify: (m: string) => void; userName: string;
}) {
  const [type, setType] = useState<'receipt' | 'payment'>('payment');
  const [date, setDate] = useState(ymd(new Date()));
  const [amount, setAmount] = useState('');
  const [money, setMoney] = useState(roleOf(settings, 'cash'));
  const [counter, setCounter] = useState('');
  const [partyId, setPartyId] = useState('');
  const [memo, setMemo] = useState('');
  const [reference, setReference] = useState('');
  const arId = roleOf(settings, 'ar'), apId = roleOf(settings, 'ap');
  const partyType = counter === arId ? 'customer' : counter === apId ? 'supplier' : null;
  const parties = partyType === 'customer' ? customers : partyType === 'supplier' ? suppliers : [];
  const moneyAccounts = (a: Account) => a.type === 'asset' && (a.id === roleOf(settings, 'cash') || a.id === roleOf(settings, 'bank') || a.id === roleOf(settings, 'card') || /صندوق|بنك|نقد|مصرف|خزين/.test(a.name));
  const vouchers = entries.filter((e) => e.kind === 'receipt' || e.kind === 'payment').slice(0, 100);

  const submit = () => {
    const n = Math.round((Number(amount) || 0) * 100) / 100;
    if (!(n > 0)) { notify('أدخل المبلغ'); return; }
    if (!money || !counter) { notify('اختر الصندوق/البنك والحساب المقابل'); return; }
    if (counter === money) { notify('الحساب المقابل لا يكون نفس حساب الصندوق'); return; }
    if (partyType === 'customer' && !window.confirm('تنبيه: سداد العملاء على الفواتير الآجلة يُسجَّل من شاشة «العملاء» أو «الفواتير الآجلة» ليُحدَّث رصيد العميل والفواتير.\nهذا السند يؤثر على الحسابات فقط. متابعة؟')) return;
    const p = parties.find((x) => x.id === partyId);
    const party: Partial<JournalLine> = partyType && p ? { partyType, partyId: p.id, partyName: p.name } : {};
    const desc = memo.trim() || (type === 'receipt' ? 'سند قبض' : 'سند صرف') + (p ? ` — ${p.name}` : '');
    const lines: JournalLine[] = type === 'receipt'
      ? [{ accountId: money, debit: n, credit: 0 }, { accountId: counter, debit: 0, credit: n, ...party }]
      : [{ accountId: counter, debit: n, credit: 0, ...party }, { accountId: money, debit: 0, credit: n }];
    const e: JournalEntry = { id: newId('je'), number: '', date, kind: type, memo: desc, lines, reference: reference.trim() || undefined, createdAt: '' };
    const errs = validateEntry(e, accs, settings.lockDate);
    if (errs.length) { notify(errs[0]); return; }
    saveEntry(e, true);
    setAmount(''); setMemo(''); setReference(''); setPartyId('');
  };

  const printVoucher = async (v: JournalEntry) => {
    const byId = new Map(accs.map((a) => [a.id, a]));
    const amt = lineTotals(v.lines).debit;
    const other = v.lines.find((l) => (v.kind === 'receipt' ? l.credit : l.debit) > 0);
    const title = v.kind === 'receipt' ? 'سند قبض' : 'سند صرف';
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title} ${esc(v.number)}</title><style>
      @page { size: A5 landscape; margin: 10mm; } body { font-family: Tajawal, Tahoma, Arial, sans-serif; color:#000; }
      .h { display:flex; justify-content:space-between; border-bottom:3px solid #134e4a; padding-bottom:6px; } .h h1 { margin:0; font-size:24px; color:#134e4a; }
      .row { display:flex; gap:8px; margin:10px 0; font-size:15px; } .row b { min-width:130px; } .amt { font-size:22px; font-weight:900; border:2px solid #134e4a; border-radius:8px; padding:6px 14px; display:inline-block; direction:ltr; }
      .sig { display:flex; justify-content:space-between; margin-top:40px; font-size:13px; } .sig div { border-top:1px solid #000; padding-top:4px; width:30%; text-align:center; }
    </style></head><body>
      <div class="h"><div><h1>${title}</h1><div>رقم: <b>${esc(v.number)}</b> — التاريخ: <b>${esc(v.date.slice(0, 10))}</b></div></div>
      <div style="text-align:left"><b>${esc(company.name)}</b><br>${company.vat ? `الرقم الضريبي: ${esc(company.vat)}` : ''}</div></div>
      <div class="row"><b>المبلغ:</b><span class="amt">${fmtMoney(amt)}</span></div>
      <div class="row"><b>المبلغ كتابةً:</b><span>${esc(tafqeet(amt))}</span></div>
      <div class="row"><b>${v.kind === 'receipt' ? 'استلمنا من' : 'صُرف إلى'}:</b><span>${esc(other?.partyName || (other ? byId.get(other.accountId)?.name : '') || '')}</span></div>
      <div class="row"><b>وذلك عن:</b><span>${esc(v.memo)}</span></div>
      ${v.reference ? `<div class="row"><b>المرجع:</b><span>${esc(v.reference)}</span></div>` : ''}
      <div class="sig"><div>المحاسب</div><div>${v.kind === 'receipt' ? 'المستلم' : 'المستلم (المستفيد)'}</div><div>المدير</div></div>
    </body></html>`;
    const res = await printHtmlDocument(html, { silent: printSettings.silent && !!printSettings.a4Printer, deviceName: printSettings.a4Printer || undefined, pageSize: 'A5', landscape: true });
    notify(res.ok ? 'تم إرسال السند للطباعة' : 'لم تتم الطباعة');
  };

  const movements = (local.cashMovements || []).filter((m) => m.kind !== 'float' && m.kind !== 'handover').slice(0, 60);
  const setMap = (id: string, acc: string) => setSettings((s) => { const cashMap = { ...(s.cashMap || {}) }; if (acc) cashMap[id] = acc; else delete cashMap[id]; return { ...s, cashMap }; });

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className={`${card} space-y-3`}>
          <div className="flex gap-2">
            <button className={`${btn} ${type === 'receipt' ? 'bg-emerald-600 text-white' : 'border border-slate-200 dark:border-slate-700'}`} onClick={() => setType('receipt')}><ArrowDownCircle className="w-4 h-4" />سند قبض</button>
            <button className={`${btn} ${type === 'payment' ? 'bg-rose-600 text-white' : 'border border-slate-200 dark:border-slate-700'}`} onClick={() => setType('payment')}><ArrowUpCircle className="w-4 h-4" />سند صرف</button>
            <span className="text-xs text-slate-500 self-center mr-2">{type === 'receipt' ? 'مبلغ يدخل الصندوق/البنك (رأس مال، إيراد آخر، قرض...)' : 'مبلغ يخرج من الصندوق/البنك (مصروف، سداد مورد، رواتب...)'}</span>
          </div>
          <div className="grid md:grid-cols-6 gap-2">
            <label className="text-xs font-bold text-slate-500 space-y-1"><span>التاريخ</span><input type="date" className={`${input} w-full`} value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="text-xs font-bold text-slate-500 space-y-1"><span>المبلغ</span><input type="number" min={0} step="0.01" className={`${input} w-full font-mono text-center`} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="text-xs font-bold text-slate-500 space-y-1 md:col-span-2"><span>{type === 'receipt' ? 'إلى (الصندوق/البنك)' : 'من (الصندوق/البنك)'}</span><AccountSelect accounts={accs} value={money} onChange={setMoney} filter={moneyAccounts} className="w-full" /></label>
            <label className="text-xs font-bold text-slate-500 space-y-1 md:col-span-2"><span>{type === 'receipt' ? 'من حساب' : 'إلى حساب (المصروف/المورد...)'}</span><AccountSelect accounts={accs} value={counter} onChange={(v) => { setCounter(v); setPartyId(''); }} className="w-full" /></label>
            {partyType && (
              <label className="text-xs font-bold text-slate-500 space-y-1 md:col-span-2"><span>{partyType === 'customer' ? 'العميل' : 'المورد'}</span>
                <select className={`${input} w-full`} value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                  <option value="">— اختر —</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}
            <label className="text-xs font-bold text-slate-500 space-y-1 md:col-span-3"><span>البيان</span><input className={`${input} w-full`} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="مثال: إيجار شهر نوفمبر" /></label>
            <label className="text-xs font-bold text-slate-500 space-y-1"><span>المرجع</span><input className={`${input} w-full`} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
          </div>
          <div className="flex justify-end"><button className={btnPrimary} onClick={submit}><Save className="w-4 h-4" />حفظ السند</button></div>
        </div>
      )}
      <div className={card}>
        <div className="font-black mb-2">آخر السندات</div>
        {vouchers.length === 0 ? <div className="text-xs text-slate-500 py-3">لا توجد سندات.</div> : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {vouchers.map((v) => (
              <div key={v.id} className="flex items-center gap-3 py-1.5">
                <span className={`text-[11px] font-bold rounded-md px-1.5 py-0.5 ${v.kind === 'receipt' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'}`}>{KIND_LABELS[v.kind]}</span>
                <span className="font-mono text-xs w-28">{v.number}</span>
                <span className="font-mono text-xs text-slate-500 w-24">{v.date.slice(0, 10)}</span>
                <span className="flex-1 truncate">{v.memo}</span>
                <span className="font-mono font-bold" dir="ltr">{fmtMoney(lineTotals(v.lines).debit)}</span>
                <button className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="طباعة" onClick={() => void printVoucher(v)}><Printer className="w-4 h-4" /></button>
                {canWrite && !locked(v.date) && <button className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500" title="حذف" onClick={() => deleteEntry(v)}><Trash2 className="w-4 h-4" /></button>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={card}>
        <div className="font-black">تصنيف حركات الصندوق</div>
        <p className="text-xs text-slate-500 mb-2">حركات الإدخال والصرف اليدوية من شاشة «الصندوق» تُرحَّل آلياً: الإدخال إلى «{accs.find((a) => a.id === roleOf(settings, 'otherIncome'))?.name}» والصرف إلى «{accs.find((a) => a.id === roleOf(settings, 'miscExpense'))?.name}». اختر حساباً أدق لكل حركة (إيجار، رواتب، سداد مورد...).</p>
        {movements.length === 0 ? <div className="text-xs text-slate-500">لا توجد حركات.</div> : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm max-h-96 overflow-y-auto">
            {movements.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-1.5">
                <span className={`text-[11px] font-bold w-12 ${m.type === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>{m.type === 'in' ? 'إدخال' : 'صرف'}</span>
                <span className="font-mono text-xs text-slate-500 w-32">{m.date.slice(0, 16)}</span>
                <span className="flex-1 truncate">{m.reason}{m.note ? ` — ${m.note}` : ''}</span>
                <span className="font-mono font-bold w-24 text-left" dir="ltr">{fmtMoney(m.amount)}</span>
                {m.kind === 'diff' ? <span className="text-xs text-slate-500 w-64">فروقات الصندوق</span> : (
                  <AccountSelect accounts={accs} value={settings.cashMap?.[m.id] || ''} onChange={(v) => setMap(m.id, v)} className="w-64 !py-1" placeholder="(الافتراضي)" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-400">المستخدم الحالي: {userName}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * دليل الحسابات
 * ---------------------------------------------------------------- */
function AccountsTab({ accs, setAccounts, ledger, canManage, notify, to }: {
  accs: Account[]; setAccounts: Dispatch<SetStateAction<Account[]>>; ledger: LedgerEntry[]; canManage: boolean; notify: (m: string) => void;
  from: string; to: string; setTab: (t: Tab) => void; onStatement: () => void;
}) {
  const [edit, setEdit] = useState<Account | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [q, setQ] = useState('');
  const bals = useMemo(() => computeBalances(ledger, undefined, to || undefined), [ledger, to]);
  const roll = useMemo(() => rollupNet(accs, bals), [accs, bals]);
  const used = useMemo(() => { const s = new Set<string>(); for (const e of ledger) for (const l of e.lines) s.add(l.accountId); return s; }, [ledger]);
  const tree = flattenTree(accs);
  const s = q.trim();
  const shown = s ? tree.filter(({ acc }) => acc.code.includes(s) || acc.name.includes(s)) : tree;

  const save = () => {
    if (!edit) return;
    const code = edit.code.trim(), name = edit.name.trim();
    if (!code || !name) { notify('الكود والاسم مطلوبان'); return; }
    if (accs.some((a) => a.code === code && a.id !== edit.id)) { notify(`الكود ${code} مستخدم`); return; }
    if (edit.parentId === edit.id) { notify('لا يكون الحساب أباً لنفسه'); return; }
    const parent = accs.find((a) => a.id === edit.parentId);
    const out = { ...edit, code, name, type: parent ? parent.type : edit.type };
    if (out.isGroup && used.has(out.id)) { notify('عليه قيود — لا يتحول لحساب تجميعي'); return; }
    setAccounts((p) => (isNew ? [...(p.length ? p : DEFAULT_ACCOUNTS), out] : (p.length ? p : DEFAULT_ACCOUNTS).map((a) => (a.id === out.id ? out : a))));
    setEdit(null);
    notify('تم حفظ الحساب');
  };
  const remove = (a: Account) => {
    if (a.system) { notify('حساب نظام مرتبط بالقيود الآلية — يمكن إعادة تسميته فقط'); return; }
    if (used.has(a.id)) { notify('عليه قيود — أوقفه بدل حذفه'); return; }
    if (accs.some((x) => x.parentId === a.id)) { notify('له حسابات فرعية — احذفها أو انقلها أولاً'); return; }
    if (!window.confirm(`حذف الحساب ${a.code} — ${a.name}؟`)) return;
    setAccounts((p) => (p.length ? p : DEFAULT_ACCOUNTS).filter((x) => x.id !== a.id));
  };
  const addUnder = (parent?: Account) => {
    const siblings = accs.filter((a) => a.parentId === parent?.id);
    const maxCode = siblings.reduce((m, a) => Math.max(m, Number(a.code) || 0), 0);
    const code = parent ? String(maxCode ? maxCode + 1 : Number(`${parent.code}${parent.code.length < 2 ? '1' : '01'}`)) : '';
    setEdit({ id: newId('acc'), code, name: '', type: parent?.type || 'expense', parentId: parent?.id });
    setIsNew(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search className="w-4 h-4 absolute right-2.5 top-2.5 text-slate-400" /><input className={`${input} pr-8 w-64`} placeholder="بحث بالكود أو الاسم" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <span className="text-xs text-slate-500">الأرصدة حتى {to || 'اليوم'} — على طبيعة كل حساب</span>
        {canManage && <button className={`${btnPrimary} mr-auto`} onClick={() => addUnder()}><Plus className="w-4 h-4" />حساب رئيسي</button>}
      </div>
      <div className={`${card} !p-0 overflow-hidden`}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950 text-xs text-slate-500"><tr><th className="text-right p-2 w-28">الكود</th><th className="text-right p-2">الحساب</th><th className="p-2 w-28">النوع</th><th className="p-2 w-36">الرصيد</th><th className="w-40" /></tr></thead>
          <tbody>
            {shown.map(({ acc, depth }) => {
              const v = natural(acc, roll.get(acc.id) || 0);
              return (
                <tr key={acc.id} className={`border-t border-slate-100 dark:border-slate-800 ${acc.isGroup ? 'font-black bg-slate-50/60 dark:bg-slate-950/40' : ''} ${acc.disabled ? 'opacity-50' : ''}`}>
                  <td className="p-2 font-mono">{acc.code}</td>
                  <td className="p-2" style={{ paddingRight: `${8 + depth * 18}px` }}>{acc.name}{acc.system && <Lock className="inline w-3 h-3 mr-1 text-slate-400" />}{acc.disabled && <span className="text-[10px] mr-1">(موقوف)</span>}</td>
                  <td className="p-2 text-center text-xs">{TYPE_LABELS[acc.type]}</td>
                  <td className={`p-2 text-center font-mono ${v < 0 ? 'text-rose-600' : ''}`} dir="ltr">{Math.abs(v) >= 0.005 ? fmtMoney(v) : '—'}</td>
                  <td className="p-1 text-left whitespace-nowrap">
                    {canManage && (
                      <>
                        {acc.isGroup && <button className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="إضافة حساب فرعي" onClick={() => addUnder(acc)}><Plus className="w-4 h-4" /></button>}
                        <button className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="تعديل" onClick={() => { setEdit({ ...acc }); setIsNew(false); }}><Pencil className="w-4 h-4" /></button>
                        {!acc.system && <button className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500" title="حذف" onClick={() => remove(acc)}><Trash2 className="w-4 h-4" /></button>}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" dir="rtl" onMouseDown={(e) => { if (e.target === e.currentTarget) setEdit(null); }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-3">
            <div className="font-black text-lg">{isNew ? 'حساب جديد' : 'تعديل حساب'}</div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs font-bold text-slate-500 space-y-1"><span>الكود</span><input className={`${input} w-full font-mono`} value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.replace(/[^0-9A-Za-z\-]/g, '') })} /></label>
              <label className="text-xs font-bold text-slate-500 space-y-1 col-span-2"><span>اسم الحساب</span><input className={`${input} w-full`} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></label>
              <label className="text-xs font-bold text-slate-500 space-y-1 col-span-2"><span>الحساب الأب</span>
                <select className={`${input} w-full`} value={edit.parentId || ''} onChange={(e) => setEdit({ ...edit, parentId: e.target.value || undefined })} disabled={edit.system}>
                  <option value="">— حساب رئيسي —</option>
                  {flattenTree(accs).filter((x) => x.acc.isGroup && x.acc.id !== edit.id).map(({ acc, depth }) => <option key={acc.id} value={acc.id}>{'— '.repeat(depth)}{acc.code} {acc.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-500 space-y-1"><span>النوع</span>
                <select className={`${input} w-full`} value={edit.type} disabled={!!edit.parentId || edit.system} onChange={(e) => setEdit({ ...edit, type: e.target.value as AccountType })}>
                  {(Object.keys(TYPE_LABELS) as AccountType[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              {!edit.system && <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!edit.isGroup} onChange={(e) => setEdit({ ...edit, isGroup: e.target.checked })} />حساب تجميعي (له حسابات فرعية)</label>}
              {!edit.system && <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!edit.disabled} onChange={(e) => setEdit({ ...edit, disabled: e.target.checked })} />موقوف</label>}
            </div>
            <p className="text-[11px] text-slate-500">طبيعة الحساب: {debitNature(edit.type) ? 'مدينة (يزيد بالمدين)' : 'دائنة (يزيد بالدائن)'}</p>
            <div className="flex justify-end gap-2"><button className={btnGhost} onClick={() => setEdit(null)}>إلغاء</button><button className={btnPrimary} onClick={save}><Save className="w-4 h-4" />حفظ</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * القوائم المالية والتقارير
 * ---------------------------------------------------------------- */
function ReportsTab({ accs, ledger, settings, from, to, periodBar, customers, suppliers, printReport, pdfReport, csvReport, busy, scopeLabel }: {
  accs: Account[]; ledger: LedgerEntry[]; settings: AccountingSettings; from: string; to: string; periodBar: ReactNode; customers: Customer[]; suppliers: Supplier[];
  printReport: (r: ReportTable) => void; pdfReport: (r: ReportTable) => void; csvReport: (r: ReportTable) => void; busy: boolean; scopeLabel: string;
}) {
  const [id, setId] = useState<ReportId>('trial');
  const [acc, setAcc] = useState(roleOf(settings, 'cash'));
  const [party, setParty] = useState('');
  const arId = roleOf(settings, 'ar'), apId = roleOf(settings, 'ap');
  const partyList = acc === arId ? customers : acc === apId ? suppliers : [];
  const F = from || undefined, T = to || undefined;
  const report: ReportTable = useMemo(() => {
    switch (id) {
      case 'income': return incomeStatementReport(accs, ledger, F, T, settings, scopeLabel);
      case 'balance': return balanceSheetReport(accs, ledger, T, scopeLabel);
      case 'statement': {
        const p = partyList.find((x) => x.id === party);
        return accountStatementReport(accs, ledger, { accountId: acc, partyId: p?.id, partyName: p?.name }, F, T, scopeLabel);
      }
      case 'journal': return journalReport(accs, ledger, F, T, scopeLabel);
      case 'customers': return partyBalancesReport(accs, ledger, 'customer', settings, T, scopeLabel);
      case 'suppliers': return partyBalancesReport(accs, ledger, 'supplier', settings, T, scopeLabel);
      default: return trialBalanceReport(accs, ledger, F, T, { scope: scopeLabel });
    }
  }, [id, accs, ledger, settings, F, T, acc, party, scopeLabel]); // eslint-disable-line react-hooks/exhaustive-deps
  const items: { id: ReportId; label: string }[] = [
    { id: 'trial', label: 'ميزان المراجعة' }, { id: 'income', label: 'قائمة الدخل' }, { id: 'balance', label: 'الميزانية العمومية' },
    { id: 'statement', label: 'كشف حساب / دفتر الأستاذ' }, { id: 'journal', label: 'دفتر اليومية' }, { id: 'customers', label: 'أرصدة العملاء' }, { id: 'suppliers', label: 'أرصدة الموردين' },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => <button key={it.id} onClick={() => setId(it.id)} className={`${btn} ${id === it.id ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900' : 'border border-slate-200 dark:border-slate-700'}`}>{it.label}</button>)}
      </div>
      {id === 'balance' ? (
        <div className="flex items-center gap-2 text-sm"><span className="text-xs font-bold text-slate-500">كما في تاريخ</span>{periodBar}</div>
      ) : periodBar}
      {id === 'statement' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-500">الحساب</span>
          <AccountSelect accounts={accs} value={acc} onChange={(v) => { setAcc(v); setParty(''); }} className="w-80" />
          {partyList.length > 0 && (
            <select className={input} value={party} onChange={(e) => setParty(e.target.value)}>
              <option value="">{acc === arId ? 'كل العملاء' : 'كل الموردين'}</option>
              {partyList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
      )}
      <ReportBox report={report} busy={busy} onPrint={() => printReport(report)} onPdf={() => pdfReport(report)} onCsv={() => csvReport(report)} />
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * الإعدادات
 * ---------------------------------------------------------------- */
function SettingsTab({ accs, setAccounts, settings, setSettings, canManage, notify }: {
  accs: Account[]; setAccounts: Dispatch<SetStateAction<Account[]>>; settings: AccountingSettings; setSettings: Dispatch<SetStateAction<AccountingSettings>>; canManage: boolean; notify: (m: string) => void;
}) {
  const [s, setS] = useState<AccountingSettings>(settings);
  useEffect(() => setS(settings), [settings]);
  const roles = Object.keys(DEFAULT_ROLES) as AccountRole[];
  const save = () => { setSettings(s); notify('تم حفظ إعدادات المحاسبة'); };
  const restoreDefaults = () => {
    const have = new Set(accs.map((a) => a.id));
    const missing = DEFAULT_ACCOUNTS.filter((a) => !have.has(a.id));
    if (!missing.length) { notify('كل حسابات الدليل الافتراضي موجودة'); return; }
    setAccounts((p) => [...(p.length ? p : DEFAULT_ACCOUNTS), ...missing]);
    notify(`أضيف ${missing.length} حساب من الدليل الافتراضي`);
  };
  const auto = s.autoPost;
  return (
    <div className="space-y-4">
      <div className={`${card} space-y-3`}>
        <div className="font-black">الترحيل الآلي</div>
        <div className="flex flex-wrap gap-4 text-sm">
          {([['sales', 'المبيعات والمرتجعات والتحصيل (مع تكلفة البضاعة)'], ['purchases', 'المشتريات ومرتجعها'], ['cash', 'حركات الصندوق اليدوية'], ['damage', 'التالف']] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-1.5"><input type="checkbox" disabled={!canManage} checked={auto[k] !== false} onChange={(e) => setS({ ...s, autoPost: { ...auto, [k]: e.target.checked } })} />{l}</label>
          ))}
        </div>
        <div className="grid md:grid-cols-3 gap-3 text-sm">
          <label className="space-y-1"><span className="text-xs font-bold text-slate-500">فواتير المشتريات</span>
            <select className={`${input} w-full`} disabled={!canManage} value={s.purchasesPaidFrom || 'credit'} onChange={(e) => setS({ ...s, purchasesPaidFrom: e.target.value as AccountingSettings['purchasesPaidFrom'] })}>
              <option value="credit">آجلة على المورد (تُسدَّد بسند صرف)</option><option value="cash">مدفوعة نقداً من الصندوق</option><option value="bank">مدفوعة من البنك</option>
            </select>
          </label>
          <label className="space-y-1"><span className="text-xs font-bold text-slate-500">بداية الترحيل الآلي (اختياري)</span>
            <input type="date" className={`${input} w-full`} disabled={!canManage} value={s.startDate || ''} onChange={(e) => setS({ ...s, startDate: e.target.value || undefined })} />
            <span className="text-[11px] text-slate-400 block">المستندات قبله لا تُرحَّل — أدخل أرصدتها بقيد افتتاحي</span>
          </label>
          <label className="space-y-1"><span className="text-xs font-bold text-slate-500 flex items-center gap-1"><Lock className="w-3.5 h-3.5" />إقفال الفترة حتى تاريخ</span>
            <input type="date" className={`${input} w-full`} disabled={!canManage} value={s.lockDate || ''} onChange={(e) => setS({ ...s, lockDate: e.target.value || undefined })} />
            <span className="text-[11px] text-slate-400 block">يمنع إضافة/تعديل/حذف القيود اليدوية داخل الفترة المقفلة</span>
          </label>
        </div>
      </div>
      <div className={`${card} space-y-3`}>
        <div className="font-black">ربط القيود الآلية بالحسابات</div>
        <div className="grid md:grid-cols-2 gap-2">
          {roles.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <span className="w-48 shrink-0 text-xs font-bold text-slate-500">{ROLE_LABELS[r]}</span>
              <AccountSelect accounts={accs} value={roleOf(s, r)} onChange={(v) => setS({ ...s, roles: { ...s.roles, [r]: v || undefined } })} className="flex-1" />
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 justify-between">
        <button className={btnGhost} disabled={!canManage} onClick={restoreDefaults}><ListTree className="w-4 h-4" />إضافة الحسابات الناقصة من الدليل الافتراضي</button>
        <button className={btnPrimary} disabled={!canManage} onClick={save}><CheckCircle2 className="w-4 h-4" />حفظ الإعدادات</button>
      </div>
      <div className="text-xs text-slate-500 leading-6 rounded-xl bg-slate-50 dark:bg-slate-950 p-3">
        <b>كيف تعمل المحاسبة؟</b> كل فاتورة بيع تُنتج قيداً: من حساب الصندوق/الشبكة/العملاء إلى حساب المبيعات وضريبة المخرجات، ومن تكلفة البضاعة المباعة إلى المخزون.
        فاتورة الشراء: من المخزون وضريبة المدخلات إلى المورد. هذه القيود تُحسب من المستندات نفسها، فتعديل الفاتورة أو حذفها يعدّل الحسابات فوراً.
        المصروفات والسداد للموردين ورأس المال تُسجَّل بسندات القبض والصرف أو بقيد يومية.
      </div>
    </div>
  );
}
