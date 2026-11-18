import { useState, type MouseEvent } from 'react';
import { Delete, CornerDownLeft, ArrowBigUp } from 'lucide-react';

type Layout = 'num' | 'en' | 'ar';

const EN = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const AR = ['ضصثقفغعهخحج', 'شسيبلاتنمكط', 'ئءؤرىةوزظد'];
const SYMBOLS = '@#$_-.!*';

/**
 * لوحة مفاتيح على الشاشة (لأجهزة اللمس): أرقام كبيرة افتراضياً، وحروف إنجليزية/عربية عند الحاجة
 */
export default function OnScreenKeyboard({ onKey, onBackspace, onClear, onEnter, enterLabel = 'دخول' }: {
  enterLabel?: string;
  onKey: (ch: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onEnter: () => void;
}) {
  const [layout, setLayout] = useState<Layout>('num');
  const [shift, setShift] = useState(false);
  const key = 'h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-cyan-700 active:scale-95 border border-slate-700 text-white font-black text-lg transition select-none';
  const press = (ch: string) => { onKey(layout === 'en' && shift ? ch.toUpperCase() : ch); if (shift) setShift(false); };
  // منع سرقة التركيز من حقل كلمة المرور
  const noFocus = (e: MouseEvent) => e.preventDefault();

  return (
    <div className="space-y-2" dir="ltr" onMouseDown={noFocus} data-testid="osk">
      <div className="flex justify-center gap-1.5" dir="rtl">
        {(['num', 'en', 'ar'] as Layout[]).map((l) => (
          <button key={l} type="button" onClick={() => setLayout(l)}
            className={`px-4 py-1.5 rounded-lg text-xs font-black border ${layout === l ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
            {l === 'num' ? '123' : l === 'en' ? 'ABC' : 'أبج'}
          </button>
        ))}
      </div>

      {layout === 'num' ? (
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" className={key} onClick={() => onKey(d)}>{d}</button>
          ))}
          <button type="button" className={`${key} text-sm text-rose-300`} onClick={onClear}>مسح</button>
          <button type="button" className={key} onClick={() => onKey('0')}>0</button>
          <button type="button" className={`${key} flex items-center justify-center`} onClick={onBackspace} aria-label="حذف"><Delete className="w-6 h-6" /></button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex gap-1 justify-center">
            {'1234567890'.split('').map((d) => <button key={d} type="button" className={`${key} flex-1 h-10 text-base`} onClick={() => onKey(d)}>{d}</button>)}
          </div>
          {(layout === 'en' ? EN : AR).map((row, i) => (
            <div key={i} className="flex gap-1 justify-center" dir={layout === 'ar' ? 'rtl' : 'ltr'}>
              {i === 2 && layout === 'en' && (
                <button type="button" onClick={() => setShift(!shift)} className={`${key} h-10 px-2 ${shift ? 'bg-cyan-700' : ''}`} aria-label="Shift"><ArrowBigUp className="w-5 h-5" /></button>
              )}
              {row.split('').map((ch) => (
                <button key={ch} type="button" className={`${key} flex-1 h-10 text-base`} onClick={() => press(ch)}>{layout === 'en' && shift ? ch.toUpperCase() : ch}</button>
              ))}
              {i === 2 && <button type="button" className={`${key} h-10 px-3 flex items-center`} onClick={onBackspace} aria-label="حذف"><Delete className="w-5 h-5" /></button>}
            </div>
          ))}
          <div className="flex gap-1">
            {SYMBOLS.split('').map((ch) => <button key={ch} type="button" className={`${key} flex-1 h-10 text-base`} onClick={() => onKey(ch)}>{ch}</button>)}
            <button type="button" className={`${key} h-10 px-3 text-sm text-rose-300`} onClick={onClear}>مسح</button>
          </div>
        </div>
      )}

      <button type="button" onClick={onEnter} className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black flex items-center justify-center gap-2" dir="rtl">
        <CornerDownLeft className="w-5 h-5" /> {enterLabel}
      </button>
    </div>
  );
}
