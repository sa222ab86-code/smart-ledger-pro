import { useState } from 'react';
import { latinBarcodeKeyDown } from '../utils/docScan';
import { X, Plus } from 'lucide-react';

/** باركودات إضافية للصنف (نفس الصنف من موردين مختلفين، أو باركود قديم/جديد) */
export default function ExtraBarcodes({ value, onChange, isTaken }: {
  value: string[];
  onChange: (v: string[]) => void;
  /** يعيد اسم الصنف الذي يستخدم الباركود (إن وُجد) */
  isTaken?: (code: string) => string | null;
}) {
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');
  const add = () => {
    const c = draft.trim();
    if (!c) return;
    if (value.includes(c)) { setErr('الباركود مضاف بالفعل'); return; }
    const owner = isTaken?.(c);
    if (owner) { setErr(`مستخدم للصنف «${owner}»`); return; }
    onChange([...value, c]); setDraft(''); setErr('');
  };
  return (
    <div className="space-y-1.5" data-testid="extra-barcodes">
      <label className="block text-slate-600 dark:text-slate-300 text-xs font-bold">باركودات إضافية <span className="font-semibold text-slate-400">(اختياري — امسح ثم Enter)</span></label>
      <div className="flex gap-2">
        <input value={draft} onChange={(e) => { setDraft(e.target.value); setErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } else latinBarcodeKeyDown(e); }}
          placeholder="باركود آخر لنفس الصنف" data-testid="extra-barcode-input"
          className="flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-cyan-400 text-slate-700 dark:text-slate-200 font-bold font-mono" />
        <button type="button" onClick={add} className="px-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white" title="إضافة"><Plus className="w-4 h-4" /></button>
      </div>
      {err && <div className="text-xs font-bold text-rose-600">{err}</div>}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 text-xs font-mono font-bold text-cyan-800 dark:text-cyan-200">
              {c}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== c))} className="text-rose-500 hover:text-rose-700" title="حذف"><X className="w-3.5 h-3.5" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
