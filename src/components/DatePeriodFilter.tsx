import DateField from './DateField';

/** فلتر الفترة لقوائم المستندات (المشتريات، مرتجع المشتريات): الافتراضي «اليوم» */
export type DatePeriod = 'today' | 'yesterday' | 'week' | 'month' | 'all' | 'range';
export interface PeriodState { mode: DatePeriod; from: string; to: string }
export const defaultPeriod = (): PeriodState => ({ mode: 'today', from: '', to: '' });

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** هل التاريخ (YYYY-MM-DD أو طابع زمني) داخل الفترة؟ */
export function inPeriod(date: string | undefined, p: PeriodState): boolean {
  if (p.mode === 'all') return true;
  const d = String(date || '').replace('T', ' ').slice(0, 10);
  const now = new Date();
  const today = ymd(now);
  switch (p.mode) {
    case 'today': return d === today;
    case 'yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return d === ymd(y); }
    case 'week': { const w = new Date(now); w.setDate(w.getDate() - 6); return d >= ymd(w) && d <= today; }
    case 'month': return d.slice(0, 7) === today.slice(0, 7);
    case 'range': return (!p.from || d >= p.from) && (!p.to || d <= p.to);
    default: return true;
  }
}

const LABELS: [DatePeriod, string][] = [['today', 'اليوم'], ['yesterday', 'أمس'], ['week', 'آخر 7 أيام'], ['month', 'هذا الشهر'], ['all', 'الكل'], ['range', 'فترة']];

export default function DatePeriodFilter({ value, onChange, searching }: { value: PeriodState; onChange: (p: PeriodState) => void; searching?: boolean }) {
  const box = 'bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-700 dark:text-slate-200 w-36';
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="period-filter">
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-0.5">
        {LABELS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => onChange({ ...value, mode: k })} data-testid={`period-${k}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${value.mode === k ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>
      {value.mode === 'range' && (
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
          <span>من</span><DateField value={value.from} onChange={(v) => onChange({ ...value, from: v })} className={box} />
          <span>إلى</span><DateField value={value.to} onChange={(v) => onChange({ ...value, to: v })} className={box} />
        </div>
      )}
      {searching && value.mode !== 'all' && <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">البحث يشمل كل التواريخ</span>}
    </div>
  );
}
