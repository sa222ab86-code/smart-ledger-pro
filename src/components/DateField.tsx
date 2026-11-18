import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * حقل تاريخ بتقويم الدفتر الذكي (بديل حقل التاريخ في المتصفح):
 *  - أشهر عربية والأسبوع يبدأ بالسبت
 *  - التاريخ الهجري (أم القرى) تحت كل يوم وفي رأس التقويم
 *  - الضغط على اسم الشهر يفتح شبكة الأشهر للتنقل السريع بين السنوات (تواريخ الصلاحية مثلاً)
 * القيمة بنفس صيغة حقل التاريخ: «YYYY-MM-DD» أو نص فارغ.
 */
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const WEEK = ['سبت', 'أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (v?: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return isNaN(d.getTime()) ? null : d;
};
const fmt = (opts: Intl.DateTimeFormatOptions, cal = false) => {
  try { return new Intl.DateTimeFormat(cal ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'ar-u-nu-latn', opts); } catch { return null; }
};
const hijriDay = fmt({ day: 'numeric' }, true);
const hijriMonthYear = fmt({ month: 'long', year: 'numeric' }, true);
const hijriFull = fmt({ day: 'numeric', month: 'long', year: 'numeric' }, true);
const longDate = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const hNum = (f: Intl.DateTimeFormat | null, d: Date) => { try { return f ? f.format(d).replace(/\s*هـ$/, '') : ''; } catch { return ''; } };

export interface DateFieldProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  /** بلا زر «مسح» */
  required?: boolean;
  min?: string;
  max?: string;
  'data-testid'?: string;
}

export default function DateField({ value, onChange, className = '', placeholder = 'اختر التاريخ', title, disabled, required, min, max, ...rest }: DateFieldProps) {
  const selected = parse(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'days' | 'months'>('days');
  const [cursor, setCursor] = useState(() => selected || new Date());
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const today = ymd(new Date());

  const openPicker = () => {
    if (disabled) return;
    setCursor(selected || new Date());
    setView('days');
    setOpen(true);
  };

  // موضع النافذة: تحت الحقل (أو فوقه إن لم تتسع الشاشة) ومحاذاة يمين الحقل
  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const w = 296, h = pop.current?.offsetHeight || 380;
    let left = r.right - w;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    setPos({ top, left });
  };
  useLayoutEffect(() => { if (open) place(); }, [open, view]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (pop.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    const onMove = () => place();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const y = cursor.getFullYear(), m = cursor.getMonth();
  const days = useMemo(() => {
    const first = new Date(y, m, 1, 12);
    const lead = (first.getDay() + 1) % 7; // السبت أول الأسبوع
    const count = new Date(y, m + 1, 0).getDate();
    const cells: (Date | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= count; d++) cells.push(new Date(y, m, d, 12));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [y, m]);
  const hijriRange = useMemo(() => {
    const a = hNum(hijriMonthYear, new Date(y, m, 1, 12)), b = hNum(hijriMonthYear, new Date(y, m + 1, 0, 12));
    return a === b ? a : `${a.replace(/\s*\d+$/, '')} – ${b}`;
  }, [y, m]);

  const outOfRange = (s: string) => (min && s < min) || (max && s > max);
  const pick = (d: Date) => { const s = ymd(d); if (outOfRange(s)) return; onChange(s); setOpen(false); };
  const shift = (months: number) => setCursor(new Date(y, m + months, 1, 12));

  const tip = selected ? `${longDate?.format(selected) || value}${hijriFull ? ` — ${hNum(hijriFull, selected)} هـ` : ''}` : undefined;

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPicker())}
        title={title ? `${title}${tip ? `\n${tip}` : ''}` : tip}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid={rest['data-testid']}
        data-value={value || ''}
        className={`${className} inline-flex items-center justify-between gap-1.5 text-right cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className={`font-mono truncate ${value ? '' : 'opacity-60 font-sans'}`} dir="ltr">{value || placeholder}</span>
        <span className="flex items-center gap-0.5 shrink-0">
          {value && !required && !disabled && (
            <span role="button" aria-label="مسح التاريخ" title="مسح" onClick={(e) => { e.stopPropagation(); onChange(''); }} className="p-0.5 rounded-full opacity-50 hover:opacity-100 hover:bg-rose-500 hover:text-white">
              <X className="w-3 h-3" />
            </span>
          )}
          <Calendar className="w-3.5 h-3.5 opacity-60" />
        </span>
      </button>
      {open && createPortal(
        <div
          ref={pop}
          role="dialog"
          dir="rtl"
          data-testid="date-popup"
          style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: 296, zIndex: 1000 }}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-100"
        >
          {/* الرأس: الشهر والسنة + الهجري */}
          <div className="bg-gradient-to-l from-cyan-600 to-teal-600 text-white px-3 py-2.5 flex items-center justify-between gap-2">
            <button type="button" onClick={() => (view === 'days' ? shift(-1) : setCursor(new Date(y - 1, m, 1, 12)))} className="p-1.5 rounded-lg hover:bg-white/20 cursor-pointer" title={view === 'days' ? 'الشهر السابق' : 'السنة السابقة'}><ChevronRight className="w-4 h-4" /></button>
            <button type="button" onClick={() => setView(view === 'days' ? 'months' : 'days')} className="flex-1 text-center rounded-lg hover:bg-white/15 px-1 py-0.5 cursor-pointer" data-testid="date-title">
              <div className="font-black text-sm leading-tight">{view === 'days' ? `${MONTHS[m]} ${y}` : y}</div>
              {view === 'days' && hijriRange && <div className="text-[10px] font-bold opacity-85 leading-tight">{hijriRange} هـ</div>}
            </button>
            <button type="button" onClick={() => (view === 'days' ? shift(1) : setCursor(new Date(y + 1, m, 1, 12)))} className="p-1.5 rounded-lg hover:bg-white/20 cursor-pointer" title={view === 'days' ? 'الشهر التالي' : 'السنة التالية'}><ChevronLeft className="w-4 h-4" /></button>
          </div>

          {view === 'days' ? (
            <div className="p-2">
              <div className="grid grid-cols-7 mb-1">
                {WEEK.map((w, i) => <div key={w} className={`text-center text-[10px] font-black py-1 ${i === 6 ? 'text-rose-500' : 'text-slate-400'}`}>{w}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {days.map((d, i) => {
                  if (!d) return <div key={i} />;
                  const s = ymd(d);
                  const isSel = s === value, isToday = s === today, off = outOfRange(s);
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!!off}
                      onClick={() => pick(d)}
                      data-date={s}
                      className={`h-10 rounded-lg flex flex-col items-center justify-center leading-none transition cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed ${
                        isSel ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                          : isToday ? 'ring-2 ring-cyan-500 text-cyan-700 dark:text-cyan-300 font-black'
                          : 'hover:bg-cyan-50 dark:hover:bg-cyan-950/40'
                      }`}
                    >
                      <span className="font-mono font-black text-[13px]">{d.getDate()}</span>
                      <span className={`font-mono text-[8.5px] mt-0.5 ${isSel ? 'text-cyan-100' : 'text-slate-400'}`}>{hNum(hijriDay, d)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-2 grid grid-cols-3 gap-1.5">
              {MONTHS.map((name, i) => (
                <button key={name} type="button" onClick={() => { setCursor(new Date(y, i, 1, 12)); setView('days'); }}
                  className={`py-2.5 rounded-lg text-xs font-black cursor-pointer ${i === m ? 'bg-cyan-600 text-white' : 'hover:bg-cyan-50 dark:hover:bg-cyan-950/40'}`}>{name}</button>
              ))}
            </div>
          )}

          {/* التذييل: التاريخ المختار بالهجري + اختصارات */}
          <div className="border-t border-slate-100 dark:border-slate-800 px-2.5 py-2 flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 truncate">
              {selected ? `${hNum(hijriFull, selected)} هـ` : 'لم يُحدَّد تاريخ'}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {!required && value && (
                <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="px-2 py-1 rounded-lg text-[11px] font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">مسح</button>
              )}
              <button type="button" disabled={!!outOfRange(today)} onClick={() => pick(new Date())} className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/25 cursor-pointer disabled:opacity-40" data-testid="date-today">اليوم</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
